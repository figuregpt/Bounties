import { cn } from "@/lib/utils";

/**
 * Loading placeholder for `<BountyCard />`. Matches the real card's
 * dimensions so the layout doesn't reflow when data lands.
 *
 * Animation uses the `shimmer` utility from globals.css (1.5s linear
 * gradient sweep) so it works without framer-motion in the skeleton path.
 */
export function BountyCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Block className="size-9 rounded-full" />
          <div className="space-y-1.5">
            <Block className="h-4 w-32" />
            <Block className="h-3 w-20" />
          </div>
        </div>
        <Block className="h-6 w-16 rounded-[var(--radius-pill)]" />
      </div>

      <div className="mt-4 space-y-2 rounded-[11px] bg-bg-tweet p-3">
        <Block className="h-3 w-24" />
        <Block className="h-3 w-full" />
        <Block className="h-3 w-5/6" />
        <div className="flex gap-3 pt-1">
          <Block className="h-3 w-10" />
          <Block className="h-3 w-10" />
          <Block className="h-3 w-10" />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Block className="h-6 w-16 rounded-[var(--radius-pill)]" />
        <Block className="h-6 w-16 rounded-[var(--radius-pill)]" />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Block className="h-1.5 flex-1 rounded-full" />
        <Block className="h-3 w-12" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="space-y-1.5">
          <Block className="h-5 w-24" />
          <Block className="h-3 w-32" />
        </div>
        <Block className="h-9 w-24 rounded-[var(--radius-button)]" />
      </div>
    </div>
  );
}

function Block({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "shimmer rounded-md bg-bg-elevated",
        className,
      )}
    />
  );
}
