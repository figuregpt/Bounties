import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  ctaLabel?: string;
  ctaHref?: string;
};

/**
 * Per-tab empty state. Centered card with a single CTA. Used by all
 * four profile tabs to keep the visual rhythm consistent when a
 * section has nothing to show.
 */
export function EmptyState({ icon: Icon, title, ctaLabel, ctaHref }: Props) {
  return (
    <div className="grid place-items-center rounded-[var(--radius-card)] border border-dashed border-border-subtle bg-bg-surface/60 px-6 py-12 text-center">
      <Icon
        className="size-8 text-text-tertiary opacity-50"
        strokeWidth={1.75}
      />
      <p className="mt-4 text-body text-text-secondary">{title}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="press mt-4 inline-flex items-center gap-1.5 text-small font-medium text-accent-text hover:text-accent-hover"
        >
          {ctaLabel}
          <ArrowRight className="size-4" strokeWidth={2.25} />
        </Link>
      )}
    </div>
  );
}
