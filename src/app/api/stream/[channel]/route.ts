import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  subscribe,
  type RealtimeEvent,
} from "@/lib/realtime/publisher";

/**
 * Server-Sent Events stream for one channel.
 *
 *   GET /api/stream/user-{userId}      — only the owning user
 *   GET /api/stream/bounty-{bountyId}  — public (any signed-in user)
 *   GET /api/stream/global             — public (any signed-in user)
 *
 * The Layer 2 worker publishes verification events via
 * `publishEvent(channel, ...)`; this handler relays them to the browser
 * as SSE. A 25s heartbeat keeps Cloudflare/Vercel proxies from killing
 * the connection on idle.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Per-user channel may only be subscribed to by its owner. Bounty +
  // global channels are public to authenticated users.
  if (channel.startsWith("user-")) {
    const ownerId = channel.slice("user-".length);
    if (ownerId !== user.id) {
      return new Response("Forbidden", { status: 403 });
    }
  } else if (
    !channel.startsWith("bounty-") &&
    channel !== "global"
  ) {
    return new Response("Unknown channel", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Initial comment forces the browser to flush response headers
      // and resolves the EventSource `onopen` promise immediately.
      safeEnqueue(`: connected to ${channel}\n\n`);

      const unsubscribe = subscribe(channel, (event: RealtimeEvent) => {
        // SSE frame: id keeps Last-Event-ID semantics; event names the
        // type so the client can use addEventListener per type if it
        // prefers over the default `message` listener.
        const payload = JSON.stringify({
          type: event.type,
          data: event.data,
          ts: event.ts,
        });
        safeEnqueue(
          `id: ${event.ts}\nevent: ${event.type}\ndata: ${payload}\n\n`,
        );
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
