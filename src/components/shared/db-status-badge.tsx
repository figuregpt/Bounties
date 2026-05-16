"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Database, CircleAlert, CircleCheck, Loader } from "lucide-react";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; userCount: number }
  | { status: "error"; message: string };

export function DbStatusBadge() {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ok) {
          setState({ status: "ok", userCount: data.userCount });
        } else {
          setState({
            status: "error",
            message: data.error ?? `HTTP ${res.status}`,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border-default bg-bg-surface px-4 py-3"
    >
      <span className="grid size-8 place-items-center rounded-[8px] bg-bg-elevated text-text-secondary">
        <Database className="size-4" strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-caption uppercase text-text-tertiary">Database</p>
        <p className="truncate text-small text-text-primary">
          {state.status === "loading" && "Checking connection…"}
          {state.status === "ok" && (
            <>
              Connected ·{" "}
              <span className="font-mono" data-numeric>
                {state.userCount.toLocaleString()}
              </span>{" "}
              user{state.userCount === 1 ? "" : "s"}
            </>
          )}
          {state.status === "error" && (
            <span className="text-text-secondary">{state.message}</span>
          )}
        </p>
      </div>

      <StatusPill state={state} />
    </motion.div>
  );
}

function StatusPill({ state }: { state: HealthState }) {
  if (state.status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-bg-elevated px-2.5 py-1 text-caption uppercase text-text-tertiary">
        <Loader className="size-3 animate-spin" strokeWidth={2.25} />
        Checking
      </span>
    );
  }

  if (state.status === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-success-soft px-2.5 py-1 text-caption uppercase text-success">
        <CircleCheck className="size-3" strokeWidth={2.25} />
        Connected
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-danger-soft px-2.5 py-1 text-caption uppercase text-danger">
      <CircleAlert className="size-3" strokeWidth={2.25} />
      Offline
    </span>
  );
}
