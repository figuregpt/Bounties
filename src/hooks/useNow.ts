"use client";

import { useEffect, useState } from "react";

/**
 * Snapshot of `Date.now()` that re-evaluates on a coarse interval.
 *
 * Calling `Date.now()` directly during render is rejected by the
 * React Compiler's purity rule, so any component that needs "the
 * current time" (live countdowns, ends-at hints, etc.) reads it
 * through this hook instead.
 *
 * Default tick interval is 30s — plenty for human-readable
 * "ends in 2h" copy. Pass a tighter interval for second-by-second
 * countdowns when the use case really needs it.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
