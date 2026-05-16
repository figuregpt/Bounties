"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";
import {
  failureMessage,
  rulesAreEmpty,
  verifyTextAction,
} from "@/lib/bounties/verify-reply";
import type { TextActionRules } from "@/types/database";

/**
 * Live verifier for reply OR quote rules. Pure client component; runs
 * the same `verifyTextAction()` function that the server uses in
 * Phase 7.
 *
 * `kind` only changes the surrounding copy ("Test your reply" vs
 * "Test your quote text") so the same module backs both rule sections.
 */

type Kind = "reply" | "quote";

type Props = {
  rules: TextActionRules;
  kind?: Kind;
  /** Optional placeholder copy override. */
  placeholder?: string;
};

const COPY: Record<Kind, { title: string; placeholder: string; subject: string }> = {
  reply: {
    title: "Test your reply",
    placeholder: "Paste your reply text to check if it passes the rules",
    subject: "reply",
  },
  quote: {
    title: "Test your quote text",
    placeholder: "Paste your quote-tweet text to check if it passes the rules",
    subject: "quote",
  },
};

export function TextActionTester({ rules, kind = "reply", placeholder }: Props) {
  const [text, setText] = useState("");
  const [tested, setTested] = useState(false);

  const result = useMemo(
    () => verifyTextAction(text, rules),
    [text, rules],
  );

  const noRules = rulesAreEmpty(rules);
  const copy = COPY[kind];

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="inline-flex items-center gap-1.5 text-small font-medium text-text-primary">
          <Sparkles className="size-3.5 text-accent-text" strokeWidth={2} />
          {copy.title}
        </h4>
        <span className="text-caption text-text-tertiary">
          Runs locally · matches what we check on Twitter
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (tested) setTested(false);
        }}
        placeholder={placeholder ?? copy.placeholder}
        rows={4}
        className="w-full resize-none rounded-[10px] border border-border-default bg-bg-base px-3 py-2 text-small text-text-primary placeholder:text-text-quaternary focus:border-accent-primary focus:outline-none"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-text-tertiary">
          {text.length} chars ·{" "}
          {text.trim() === "" ? 0 : text.trim().split(/\s+/).length} words
        </p>
        <button
          type="button"
          onClick={() => setTested(true)}
          disabled={text.trim() === ""}
          className="press inline-flex h-9 items-center rounded-[var(--radius-button)] bg-accent-primary px-4 text-small font-medium text-[#0E0E10] hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Test
        </button>
      </div>

      <AnimatePresence initial={false}>
        {tested && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={
              noRules
                ? "rounded-[10px] border border-border-subtle bg-bg-elevated px-3 py-2 text-small text-text-secondary"
                : result.passed
                  ? "rounded-[10px] border border-success/15 bg-success-soft px-3 py-2"
                  : "rounded-[10px] border border-warning/15 bg-warning-soft px-3 py-2"
            }
          >
            {noRules ? (
              <span>No rules to check — any non-empty {copy.subject} counts.</span>
            ) : result.passed ? (
              <div className="flex items-center gap-2 text-small text-success">
                <Check className="size-3.5" strokeWidth={2.5} />
                Your {copy.subject} passes every rule.
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-small font-medium text-warning">
                  <X className="size-3.5" strokeWidth={2.5} />
                  {result.failures.length} issue
                  {result.failures.length > 1 ? "s" : ""} to fix
                </div>
                <ul className="space-y-0.5 pl-5 text-small text-text-secondary">
                  {result.failures.map((f, i) => (
                    <li key={i} className="list-disc">
                      {failureMessage(f)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Back-compat alias for the existing reply-only call sites. */
export const ReplyTester = (props: Omit<Props, "kind">) => (
  <TextActionTester {...props} kind="reply" />
);
