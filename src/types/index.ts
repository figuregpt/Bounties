/**
 * Cross-cutting types live here. Domain types (Campaign, Bounty, Payout, etc.)
 * are added in Phase 2 once the schema lands.
 */
export type TokenCategory = "platform" | "stable" | "sol" | "meme";

export type SocialAction = "like" | "retweet" | "reply" | "quote";
