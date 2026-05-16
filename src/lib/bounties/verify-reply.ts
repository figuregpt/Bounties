import type { TextActionRules } from "@/types/database";

/**
 * Pure text-action verifier. Runs in the browser (for the live tester
 * on the detail page) and on the server (Phase 7 final verification).
 *
 * Phase 7 polish: failures are now tagged unions instead of opaque
 * strings — the verify-claim layer needs to map them to user-friendly
 * categories ("reply_missing_keyword" vs. "reply_too_short") so the
 * hunt overlay can show specific fix-it copy. The tester UI still
 * renders the human string via `failureMessage()`.
 *
 * Match types:
 *   • "word"      → whole-word boundary, case-insensitive
 *   • "string"    → substring, case-insensitive
 *
 * Length checks:
 *   • minLength    → character count (post-trim)
 *   • minWordCount → whitespace-split tokens
 */

export type TextActionRuleFailure =
  | {
      type: "missing_required_keyword";
      /** All required keywords the text was missing, in the order the
       *  rules listed them. */
      keywords: string[];
    }
  | { type: "forbidden_keyword"; foundWord: string }
  | {
      type: "too_short";
      unit: "characters" | "words";
      minimum: number;
      actual: number;
    };

export type TextActionVerificationResult = {
  passed: boolean;
  failures: TextActionRuleFailure[];
};

/** Back-compat alias for the result type. */
export type ReplyVerificationResult = TextActionVerificationResult;

export function verifyTextAction(
  text: string,
  rules: TextActionRules,
): TextActionVerificationResult {
  const failures: TextActionRuleFailure[] = [];
  const trimmed = text.trim();
  const matcher = makeMatcher(rules.matchType);

  // 1. Length / word count
  if (rules.minLength > 0 && trimmed.length < rules.minLength) {
    failures.push({
      type: "too_short",
      unit: "characters",
      minimum: rules.minLength,
      actual: trimmed.length,
    });
  }
  const wordCount = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  if (rules.minWordCount > 0 && wordCount < rules.minWordCount) {
    failures.push({
      type: "too_short",
      unit: "words",
      minimum: rules.minWordCount,
      actual: wordCount,
    });
  }

  // 2. Required keywords (must include all). Collapse all misses into a
  //    single failure so the verify-claim layer can surface them as one
  //    "must include: X, Y, Z" message.
  const missing = (rules.mustContainAll ?? []).filter(
    (kw) => !matcher(trimmed, kw),
  );
  if (missing.length > 0) {
    failures.push({
      type: "missing_required_keyword",
      keywords: missing,
    });
  }

  // 3. Forbidden keywords — report the first hit; once the user removes
  //    it the next attempt surfaces the next one.
  for (const kw of rules.forbidden ?? []) {
    if (matcher(trimmed, kw)) {
      failures.push({ type: "forbidden_keyword", foundWord: kw });
      break;
    }
  }

  return { passed: failures.length === 0, failures };
}

/** Back-compat alias. */
export const verifyReply = verifyTextAction;

/**
 * Render a structured failure as a one-line human string. Used by the
 * tester UI and as the fallback in the hunt overlay when the verifier
 * doesn't supply a friendlier sentence.
 */
export function failureMessage(failure: TextActionRuleFailure): string {
  switch (failure.type) {
    case "missing_required_keyword":
      return failure.keywords.length === 1
        ? `Missing required keyword: ${failure.keywords[0]}`
        : `Missing required keywords: ${failure.keywords.join(", ")}`;
    case "forbidden_keyword":
      return `Contains forbidden keyword: ${failure.foundWord}`;
    case "too_short":
      return failure.unit === "characters"
        ? `Too short: ${failure.actual} chars (min ${failure.minimum})`
        : `Too few words: ${failure.actual} (min ${failure.minimum})`;
  }
}

/* =========================================================================
   Matchers
   ========================================================================= */

function makeMatcher(
  type: TextActionRules["matchType"],
): (text: string, keyword: string) => boolean {
  if (type === "string") {
    return (text, keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase());
  }
  // "word" — whole-word boundary, but allow `$` / `#` / `@` prefixes so that
  // "$BNTY", "#bountiesfm", "@yigo" match cleanly.
  return (text, keyword) => {
    if (!keyword) return false;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:^|[^\\w$#@])${escaped}(?=$|[^\\w])`,
      "i",
    );
    return pattern.test(text);
  };
}

/* =========================================================================
   Convenience exports
   ========================================================================= */

/** Used by the tester UI to render a "no rules" hint. */
export function rulesAreEmpty(rules: TextActionRules): boolean {
  return (
    (rules.mustContainAll?.length ?? 0) === 0 &&
    (rules.forbidden?.length ?? 0) === 0 &&
    (rules.minLength ?? 0) === 0 &&
    (rules.minWordCount ?? 0) === 0
  );
}
