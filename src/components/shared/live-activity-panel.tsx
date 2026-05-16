import { ActivityRow } from "./activity-row";
import type { LiveActivityRow } from "@/lib/db/queries/activities";

/**
 * Sticky right-rail showing the most recent platform activity. Server
 * component — Phase 4 reads from the socialActivities table; Phase 10
 * will swap the static list for an SSE-driven live stream while keeping
 * this same component shape.
 */
export function LiveActivityPanel({
  rows,
}: {
  rows: LiveActivityRow[];
}) {
  return (
    <aside className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-bg-surface">
      <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <span className="relative grid size-2 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent-primary/40" />
          <span className="size-1.5 rounded-full bg-accent-primary" />
        </span>
        <span className="text-small font-medium text-text-primary">
          Live activity
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-small text-text-tertiary">
          No recent activity yet.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-y-auto px-1.5 py-1.5 [scrollbar-width:thin]">
          {rows.map((row) => (
            <li key={row.id}>
              <ActivityRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
