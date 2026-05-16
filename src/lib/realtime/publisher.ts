import "server-only";

/**
 * In-memory pub/sub for SSE.
 *
 * Phase 7 keeps this in-process — when the Layer 2 worker verifies a claim it
 * calls `publishEvent` and any SSE handler subscribed to that channel
 * receives the event. Phase 8+ swaps the bus for Redis pub/sub once the
 * worker runs in a separate process.
 *
 * Channels are flat strings — convention is `user-${userId}`,
 * `bounty-${bountyId}`, `global`.
 *
 * Survives HMR by parking the bus on globalThis. Without this, the dev
 * server re-imports the module on every edit and SSE clients hold a
 * subscriber on a stale Set.
 */

export type RealtimeEventType =
  | "claim_verified"
  | "claim_failed"
  | "new_verification"
  | "bounty_updated"
  | "activity_inserted"
  | "ping";

export type RealtimeEvent = {
  type: RealtimeEventType;
  data: unknown;
  ts: number;
};

type Subscriber = (event: RealtimeEvent) => void;

type Bus = {
  channels: Map<string, Set<Subscriber>>;
};

const globalKey = "__bountiesRealtimeBus__" as const;
type GlobalWithBus = typeof globalThis & { [globalKey]?: Bus };

function getBus(): Bus {
  const g = globalThis as GlobalWithBus;
  if (!g[globalKey]) {
    g[globalKey] = { channels: new Map() };
  }
  return g[globalKey]!;
}

export function subscribe(channel: string, fn: Subscriber): () => void {
  const bus = getBus();
  let subs = bus.channels.get(channel);
  if (!subs) {
    subs = new Set();
    bus.channels.set(channel, subs);
  }
  subs.add(fn);

  return () => {
    const current = bus.channels.get(channel);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) bus.channels.delete(channel);
  };
}

export function publishEvent(
  channel: string,
  type: RealtimeEventType,
  data: unknown,
): void {
  const bus = getBus();
  const subs = bus.channels.get(channel);
  if (!subs || subs.size === 0) return;
  const event: RealtimeEvent = { type, data, ts: Date.now() };
  for (const fn of subs) {
    try {
      fn(event);
    } catch {
      // Subscriber threw — drop it so a wedged client can't poison
      // delivery to healthy subscribers on the same channel.
      subs.delete(fn);
    }
  }
}

export function channelSubscriberCount(channel: string): number {
  return getBus().channels.get(channel)?.size ?? 0;
}
