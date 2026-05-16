/**
 * Zod path → user-facing label.
 *
 * Validation errors come back as dotted paths (`actionConfig.follow.targetHandle`)
 * which are useless to surface in product UI. This helper maps the leaf
 * concept to the same name a creator would recognize from the form.
 *
 * Lookup is most-specific-first: an exact match wins, then progressively
 * shorter prefixes, then a hard-coded fallback. Adding a new field means
 * adding a line here.
 */

const EXACT: Record<string, string> = {
  tweetUrl: "Tweet",

  // Action config
  actionConfig: "Required actions",
  "actionConfig.retweet": "Retweet action",
  "actionConfig.reply": "Reply action",
  "actionConfig.reply.required": "Reply action",
  "actionConfig.reply.rules": "Reply requirements",
  "actionConfig.reply.rules.mustContainAll": "Reply must-contain keywords",
  "actionConfig.reply.rules.forbidden": "Reply forbidden words",
  "actionConfig.reply.rules.minLength": "Reply minimum length",
  "actionConfig.reply.rules.minWordCount": "Reply minimum words",
  "actionConfig.quote": "Quote action",
  "actionConfig.quote.required": "Quote action",
  "actionConfig.quote.rules": "Quote requirements",
  "actionConfig.quote.rules.mustContainAll": "Quote must-contain keywords",
  "actionConfig.quote.rules.forbidden": "Quote forbidden words",
  "actionConfig.quote.rules.minLength": "Quote minimum length",
  "actionConfig.quote.rules.minWordCount": "Quote minimum words",
  "actionConfig.follow": "Follow action",
  "actionConfig.follow.required": "Follow action",
  "actionConfig.follow.targetHandle": "Follow target",

  // Reward
  rewardTokenMint: "Reward token",
  rewardTokenSymbol: "Reward token",
  rewardTokenDecimals: "Reward token",
  rewardPerHunter: "Reward amount",
  rewardPerHunterUsd: "Reward USD value",
  maxHunters: "Slots",

  // Eligibility
  eligibilityFilters: "Eligibility filters",
  "eligibilityFilters.minFollowers": "Minimum followers",
  "eligibilityFilters.requireVerified": "Require verified",
  "eligibilityFilters.minAccountAgeMonths": "Minimum account age",
  "eligibilityFilters.minReputationScore": "Minimum reputation",
  "eligibilityFilters.allowedCountries": "Allowed countries",
  "eligibilityFilters.blockedCountries": "Blocked countries",
  "eligibilityFilters.minPreviousBounties": "Previous bounties",
  "eligibilityFilters.requireReputationTier": "Reputation tier",
  "eligibilityFilters.smartFollowers": "Smart followers",
  "eligibilityFilters.smartFollowers.minimum": "Smart follower minimum",

  // Lifecycle
  distributionModel: "Distribution model",
  durationHours: "Campaign duration",
  category: "Category",
  tags: "Tags",
};

export function labelForPath(path: string): string {
  if (path in EXACT) return EXACT[path];
  // Walk up the dotted path until we hit a known prefix.
  const parts = path.split(".");
  while (parts.length > 1) {
    parts.pop();
    const candidate = parts.join(".");
    if (candidate in EXACT) return EXACT[candidate];
  }
  // Last-resort fallback: humanize the original.
  return path
    .split(".")
    .map((s) => s.replace(/([A-Z])/g, " $1").trim())
    .join(" → ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Form";
}

/**
 * Resolves a zod path to the corresponding top-level form section number
 * (matches the `step` prop in [src/app/(app)/create/create-bounty-client.tsx]).
 * Used to scroll to the first errored section.
 */
export function sectionForPath(path: string): number | null {
  if (path.startsWith("tweetUrl")) return 1;
  if (path.startsWith("eligibilityFilters")) return 2;
  if (path.startsWith("actionConfig.reply.rules")) return 4;
  if (path.startsWith("actionConfig.quote.rules")) return 4;
  if (path.startsWith("actionConfig")) return 3;
  if (path.startsWith("distributionModel")) return 5;
  if (
    path.startsWith("rewardPerHunter") ||
    path.startsWith("maxHunters") ||
    path.startsWith("rewardToken")
  ) {
    return 6;
  }
  if (path.startsWith("durationHours")) return 7;
  return null;
}

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

/**
 * Serializes a `ZodError` into our wire format. Each issue carries the
 * dotted path the frontend uses to look up a field label and to find
 * the section to scroll to.
 */
export function serializeZodIssues(
  err: import("zod").ZodError,
): ValidationIssue[] {
  return err.issues.map((issue) => ({
    path: issue.path.map((p) => String(p)).join("."),
    code: String(issue.code),
    message: issue.message,
  }));
}

export type GroupedIssue = {
  label: string;
  messages: string[];
};

/** Group raw issues by display label so the modal can render
 *  "Reward amount: must be greater than 0". */
export function groupIssuesByLabel(
  issues: ValidationIssue[],
): GroupedIssue[] {
  const map = new Map<string, string[]>();
  for (const issue of issues) {
    const label = labelForPath(issue.path);
    const arr = map.get(label) ?? [];
    arr.push(issue.message);
    map.set(label, arr);
  }
  return Array.from(map.entries()).map(([label, messages]) => ({
    label,
    messages,
  }));
}
