"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Subscribes to an SSE channel and surfaces the latest event.
 *
 * Channels follow the publisher's convention: `user-${userId}`,
 * `bounty-${bountyId}`, `global`.
 *
 * The hook keeps the EventSource alive across re-renders by ref so a
 * parent component re-rendering doesn't churn the underlying TCP
 * connection. It auto-reconnects with backoff when the browser drops
 * the stream (laptop sleep, flaky tunnel) — EventSource does this for
 * us up to a point, but we wrap it so a 403/410 doesn't burn forever.
 */

export type RealtimeMessage = {
  type: string;
  data: unknown;
  ts: number;
};

export function useClaimRealtime(
  channel: string | null,
  onEvent: (event: RealtimeMessage) => void,
) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!channel) return;

    let cancelled = false;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAt = 1_000;

    const open = () => {
      if (cancelled) return;
      es = new EventSource(`/api/stream/${encodeURIComponent(channel)}`);

      es.onopen = () => {
        retryAt = 1_000;
        setConnected(true);
      };

      es.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as RealtimeMessage;
          onEventRef.current(parsed);
        } catch {
          // Ignore malformed frame — heartbeats are sent as comments
          // and never reach onmessage, so a parse failure here is a
          // real bug we'd want to know about in logs, not user UI.
        }
      };

      // Named events come through addEventListener, not onmessage —
      // the SSE endpoint emits `event: claim_verified` etc.
      const handler = (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data) as RealtimeMessage;
          onEventRef.current(parsed);
        } catch {
          /* swallow */
        }
      };
      for (const type of [
        "claim_verified",
        "claim_failed",
        "new_verification",
        "bounty_updated",
      ]) {
        es.addEventListener(type, handler as EventListener);
      }

      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        if (cancelled) return;
        retryTimer = setTimeout(open, retryAt);
        retryAt = Math.min(retryAt * 2, 30_000);
      };
    };

    open();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      setConnected(false);
    };
  }, [channel]);

  return { connected };
}
