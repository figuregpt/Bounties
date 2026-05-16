"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Coins,
  Loader,
  Pause,
  Play,
  Trash,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CtaConfig } from "@/lib/bounties/state";

/**
 * Renders a single CTA from the state machine. The button's visual
 * intent (variant) and animation (pulse) come from the state config;
 * the page wires the actual click handler.
 */

const ICONS: Record<NonNullable<CtaConfig["icon"]>, LucideIcon> = {
  ArrowRight,
  Check,
  Loader,
  AlertTriangle,
  Coins,
  Pause,
  Play,
  Trash,
};

type Props = {
  config: CtaConfig;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: "default" | "lg";
  className?: string;
};

export function CTAButton({
  config,
  onClick,
  disabled,
  fullWidth,
  size = "default",
  className,
}: Props) {
  const Icon = config.icon ? ICONS[config.icon] : null;
  const isDisabled = disabled || config.variant === "disabled";
  const isLoaderIcon = config.icon === "Loader";

  const tone = toneFor(config.variant);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      whileHover={isDisabled ? undefined : { scale: 1.005 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "press relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] font-medium transition-colors",
        size === "lg" ? "h-[52px] px-6 text-body" : "h-9 px-4 text-small",
        fullWidth ? "w-full" : "",
        tone.bg,
        tone.text,
        tone.hover,
        tone.border,
        isDisabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {/* Glow / pulse for ready_to_claim, awaiting_final etc. */}
      {config.pulse && !isDisabled && (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-[var(--radius-button)] bg-accent-primary/40 blur-md animate-pulse"
        />
      )}

      {Icon && (
        <Icon
          className={cn(
            size === "lg" ? "size-4" : "size-3.5",
            isLoaderIcon && "animate-spin",
          )}
          strokeWidth={2.25}
        />
      )}
      <span>{config.label}</span>
    </motion.button>
  );
}

/* =========================================================================
   Tone palettes
   ========================================================================= */

function toneFor(variant: CtaConfig["variant"]): {
  bg: string;
  text: string;
  hover: string;
  border: string;
} {
  switch (variant) {
    case "primary":
      return {
        bg: "bg-accent-primary",
        text: "text-[#0E0E10]",
        hover: "hover:bg-accent-hover",
        border: "",
      };
    case "secondary":
      return {
        bg: "bg-bg-elevated",
        text: "text-text-primary",
        hover: "hover:bg-bg-elevated/80",
        border: "border border-border-default hover:border-border-hover",
      };
    case "danger":
      return {
        bg: "bg-danger-soft",
        text: "text-danger",
        hover: "hover:bg-danger-soft/80",
        border: "border border-danger/20",
      };
    case "disabled":
      return {
        bg: "bg-bg-elevated",
        text: "text-text-tertiary",
        hover: "",
        border: "border border-border-subtle",
      };
  }
}
