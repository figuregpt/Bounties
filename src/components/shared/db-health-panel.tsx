"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CircleAlert,
  CircleCheck,
  Database,
  GaugeCircle,
  ListTree,
  Loader,
  Table2,
} from "lucide-react";

type HealthData = {
  ok: true;
  tables: Record<string, number>;
  lastMigration: { hash: string | null; createdAt: string | null };
  indexes: { table: string; name: string }[];
  sampleLatencyMs: number;
};

type State =
  | { status: "loading" }
  | { status: "ok"; data: HealthData }
  | { status: "error"; message: string };

export function DbHealthPanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/db-health", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ok) {
          setState({ status: "ok", data });
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface"
    >
      <Header state={state} />

      {state.status === "loading" && (
        <div className="grid gap-4 border-t border-border-subtle p-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-[var(--radius-card)] bg-bg-elevated shimmer"
            />
          ))}
        </div>
      )}

      {state.status === "ok" && (
        <div className="grid gap-6 border-t border-border-subtle p-6 lg:grid-cols-3">
          <TableCountsCard tables={state.data.tables} />
          <MigrationAndLatencyCard data={state.data} />
          <IndexesCard indexes={state.data.indexes} />
        </div>
      )}

      {state.status === "error" && (
        <div className="border-t border-border-subtle p-6">
          <p className="text-small text-danger">{state.message}</p>
          <p className="mt-1 text-small text-text-tertiary">
            Set <code className="font-mono">DATABASE_URL</code> in{" "}
            <code className="font-mono">.env.local</code> and run{" "}
            <code className="font-mono">npm run db:push</code>.
          </p>
        </div>
      )}
    </motion.div>
  );
}

function Header({ state }: { state: State }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="grid size-9 place-items-center rounded-[8px] bg-bg-elevated text-text-secondary">
        <Database className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-caption uppercase text-text-tertiary">
          DB health · /api/db-health
        </p>
        <p className="text-small text-text-primary">
          {state.status === "loading" && "Probing connection…"}
          {state.status === "ok" &&
            `Connected · ${Object.values(state.data.tables).reduce(
              (a, b) => a + b,
              0,
            )} rows across ${Object.keys(state.data.tables).length} tables`}
          {state.status === "error" && (
            <span className="text-text-secondary">{state.message}</span>
          )}
        </p>
      </div>
      <StatusPill state={state} />
    </div>
  );
}

function StatusPill({ state }: { state: State }) {
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

function TableCountsCard({ tables }: { tables: Record<string, number> }) {
  const rows = Object.entries(tables).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="rounded-[var(--radius-card)] border border-border-subtle bg-bg-base">
      <SectionHeader icon={<Table2 className="size-3.5" />} label="Row counts" />
      <ul className="divide-y divide-border-subtle">
        {rows.map(([table, n]) => (
          <li
            key={table}
            className="flex items-center justify-between px-4 py-2"
          >
            <span className="font-mono text-small text-text-secondary">
              {table}
            </span>
            <span className="font-mono text-small text-text-primary" data-numeric>
              {n.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MigrationAndLatencyCard({ data }: { data: HealthData }) {
  const migDate = data.lastMigration.createdAt
    ? new Date(data.lastMigration.createdAt)
    : null;
  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-border-subtle bg-bg-base">
        <SectionHeader
          icon={<GaugeCircle className="size-3.5" />}
          label="Sample latency"
        />
        <div className="flex items-baseline gap-2 px-4 py-4">
          <span
            className="font-mono text-h2 text-text-primary"
            data-numeric
          >
            {data.sampleLatencyMs}
          </span>
          <span className="text-small text-text-tertiary">ms</span>
          <span className="ml-auto text-caption uppercase text-text-tertiary">
            SELECT COUNT(*) FROM users
          </span>
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-border-subtle bg-bg-base">
        <SectionHeader
          icon={<ListTree className="size-3.5" />}
          label="Last migration"
        />
        <div className="space-y-1 px-4 py-3">
          {data.lastMigration.hash ? (
            <>
              <p
                className="break-all font-mono text-small text-text-primary"
                data-numeric
              >
                {data.lastMigration.hash.slice(0, 24)}…
              </p>
              <p className="text-caption uppercase text-text-tertiary">
                Applied {migDate?.toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-small text-text-secondary">
              No migration journal found (db:push was used).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function IndexesCard({
  indexes,
}: {
  indexes: { table: string; name: string }[];
}) {
  const grouped = indexes.reduce<Record<string, string[]>>((acc, r) => {
    (acc[r.table] ||= []).push(r.name);
    return acc;
  }, {});
  return (
    <div className="rounded-[var(--radius-card)] border border-border-subtle bg-bg-base">
      <SectionHeader
        icon={<ListTree className="size-3.5" />}
        label={`Indexes · ${indexes.length}`}
      />
      <div className="max-h-96 overflow-y-auto">
        <ul className="space-y-3 px-4 py-3">
          {Object.entries(grouped).map(([table, names]) => (
            <li key={table}>
              <p className="font-mono text-small text-text-primary">{table}</p>
              <ul className="mt-1 space-y-0.5">
                {names.map((n) => (
                  <li
                    key={n}
                    className="pl-3 font-mono text-caption text-text-tertiary"
                  >
                    · {n}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border-subtle px-4 py-2 text-caption uppercase text-text-tertiary">
      {icon}
      {label}
    </div>
  );
}
