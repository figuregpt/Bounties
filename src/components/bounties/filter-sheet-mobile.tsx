"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { FilterSidebar } from "./filter-sidebar";
import type { DiscoverFilters } from "./filter-types";

/**
 * Mobile-only bottom sheet that wraps the same FilterSidebar the
 * desktop view uses. Slides up from the bottom; tap the backdrop or
 * the "Show results" button to dismiss. No Radix dependency — a
 * lightweight framer-motion sheet keeps the bundle small.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: DiscoverFilters;
  onFiltersChange: (next: DiscoverFilters) => void;
};

export function FilterSheetMobile({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
}: Props) {
  // Body scroll lock while open. Doesn't fight with our DevnetBanner
  // sticky positioning because the sheet is fixed-position overlay.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-[24px] border-t border-border-default bg-bg-surface"
          >
            {/* Grab handle + title */}
            <div className="sticky top-0 z-10 bg-bg-surface px-5 pb-3 pt-2">
              <span
                aria-hidden
                className="mx-auto mb-3 block h-1 w-12 rounded-full bg-border-default"
              />
              <h2 className="text-h3 font-medium">Filters</h2>
            </div>

            {/* Body — scrolls when content exceeds */}
            <div className="overflow-y-auto px-5 pb-3 pt-1">
              <FilterSidebar
                filters={filters}
                onChange={onFiltersChange}
              />
            </div>

            {/* Sticky CTA */}
            <div className="pb-safe sticky bottom-0 border-t border-border-subtle bg-bg-surface px-5 pt-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="press h-12 w-full rounded-[var(--radius-button)] bg-accent-primary text-small font-medium text-[#100F16] hover:bg-accent-hover"
              >
                Show results
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
