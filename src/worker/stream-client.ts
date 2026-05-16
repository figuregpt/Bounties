import { WebSocket } from "ws";
import { processStreamEvent, type StreamEvent } from "./event-processor";

/**
 * Long-lived WebSocket subscriber for twitterapi.io's tweet filter.
 *
 * twitterapi.io's docs note that filter rules can drive either webhook
 * or websocket delivery; we use the WS path. The endpoint URL is
 * configurable since the docs don't publish a stable canonical path,
 * defaulting to the one bundled in the provider's example client.
 *
 * Resilience:
 *   • Exponential backoff on dropped connections (1s → 30s cap)
 *   • Heartbeat-pong every 25s; if the server stops responding to two
 *     consecutive pings we force a reconnect.
 *   • Graceful shutdown on SIGINT/SIGTERM so dev `npm run worker` ^C
 *     cleanly closes the socket and DB pool.
 */

const DEFAULT_URL = "wss://ws.twitterapi.io/twitter/tweet/websocket";
const PING_INTERVAL_MS = 25_000;
const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type StreamClient = {
  stop: () => Promise<void>;
};

export function startStreamClient(): StreamClient {
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    throw new Error("TWITTER_API_KEY is not set");
  }
  const url = process.env.TWITTERAPI_WS_URL ?? DEFAULT_URL;

  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectAt = RECONNECT_INITIAL_MS;
  let pingTimer: NodeJS.Timeout | null = null;
  let missedPongs = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;

  const teardown = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (ws) {
      try {
        ws.removeAllListeners();
        ws.close();
      } catch {
        /* swallow */
      }
      ws = null;
    }
  };

  const connect = () => {
    if (stopped) return;
    teardown();
    console.log(`[worker] connecting to ${url}`);
    ws = new WebSocket(url, {
      headers: { "X-API-Key": apiKey },
    });

    ws.on("open", () => {
      console.log("[worker] Connected, listening for events");
      reconnectAt = RECONNECT_INITIAL_MS;
      missedPongs = 0;
      pingTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (missedPongs >= 2) {
          console.warn("[worker] no pong in two intervals, reconnecting");
          scheduleReconnect();
          return;
        }
        missedPongs += 1;
        try {
          ws.ping();
        } catch {
          scheduleReconnect();
        }
      }, PING_INTERVAL_MS);
    });

    ws.on("pong", () => {
      missedPongs = 0;
    });

    ws.on("message", (data) => {
      void handleMessage(data.toString());
    });

    ws.on("error", (err) => {
      console.warn("[worker] socket error", err.message);
    });

    ws.on("close", (code, reason) => {
      console.warn(
        `[worker] socket closed (${code}) ${reason.toString().slice(0, 120)}`,
      );
      scheduleReconnect();
    });
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    teardown();
    const delay = reconnectAt;
    reconnectAt = Math.min(reconnectAt * 2, RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return {
    async stop() {
      stopped = true;
      teardown();
    },
  };
}

async function handleMessage(raw: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[worker] failed to parse frame, ignoring");
    return;
  }
  const events = normalizeFrame(parsed);
  for (const event of events) {
    try {
      await processStreamEvent(event);
    } catch (err) {
      console.error("[worker] event processing failed", err);
    }
  }
}

/**
 * The filter-stream sometimes sends one event per frame, sometimes a
 * batch under `tweets`. Normalize both into our `StreamEvent` shape.
 *
 * twitterapi.io's payload uses snake_case at the top level and a mix of
 * nested user objects — fields below mirror what their REST tweet
 * response carries.
 */
function normalizeFrame(frame: unknown): StreamEvent[] {
  if (!isObj(frame)) return [];
  const tweets: unknown[] = Array.isArray((frame as { tweets?: unknown[] }).tweets)
    ? ((frame as { tweets: unknown[] }).tweets ?? [])
    : isObj((frame as { tweet?: unknown }).tweet)
    ? [(frame as { tweet: unknown }).tweet]
    : [frame];
  const ruleId =
    (frame as { rule_id?: string; ruleId?: string }).rule_id ??
    (frame as { ruleId?: string }).ruleId ??
    null;

  const out: StreamEvent[] = [];
  for (const t of tweets) {
    if (!isObj(t)) continue;
    const tweetId =
      str((t as Record<string, unknown>).id) ??
      str((t as Record<string, unknown>).id_str);
    if (!tweetId) continue;
    const conversationId =
      str((t as Record<string, unknown>).conversation_id) ??
      str((t as Record<string, unknown>).conversationId) ??
      null;
    const author = (t as Record<string, unknown>).author ??
      (t as Record<string, unknown>).user;
    const authorObj = isObj(author) ? author : null;
    const inReplyToTweetId =
      str((t as Record<string, unknown>).in_reply_to_tweet_id) ??
      str((t as Record<string, unknown>).in_reply_to_status_id_str) ??
      null;
    const quotedTweetId =
      str((t as Record<string, unknown>).quoted_tweet_id) ??
      str((t as Record<string, unknown>).quoted_status_id_str) ??
      str(
        isObj((t as Record<string, unknown>).quoted_tweet)
          ? (
              (t as Record<string, unknown>).quoted_tweet as Record<
                string,
                unknown
              >
            ).id
          : undefined,
      ) ??
      null;
    const isReply = inReplyToTweetId != null;
    const isQuote = quotedTweetId != null;
    out.push({
      streamRuleId: ruleId,
      tweetId,
      conversationId,
      authorTwitterId: authorObj
        ? str(authorObj.id) ?? str(authorObj.id_str)
        : null,
      authorHandle: authorObj
        ? str(authorObj.userName) ?? str(authorObj.username) ?? str(authorObj.screen_name)
        : null,
      text:
        str((t as Record<string, unknown>).text) ??
        str((t as Record<string, unknown>).full_text) ??
        null,
      isReply,
      isQuote,
      inReplyToTweetId,
      quotedTweetId,
    });
  }
  return out;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}
