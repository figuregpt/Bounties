import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { generateUniqueReferralCode } from "@/lib/auth";
import { getUserInfo, type TwitterUserInfo } from "@/lib/twitter/client";
import { recomputeAndPersistSmartFollowerCount } from "@/lib/smart-followers/get-count";
import type { User } from "@/types/database";

/**
 * Called from the NextAuth `signIn` callback on every successful
 * Twitter OAuth. Replaces the pre-NextAuth `/api/auth/sync` route.
 *
 *   1. Hydrate full profile from twitterapi.io (followers, account
 *      age, raw payload). Skip the call if we already have a row whose
 *      profile was synced in the last 24h.
 *   2. Upsert keyed on `twitterId` — this is our stable identity now
 *      that `privyId` is deprecated. New users get a referral code and
 *      a fresh smart-follower count.
 *   3. Fail soft on twitterapi.io errors — the auth flow still
 *      completes; a backfill job catches the row up later.
 *
 * Wallet address is left null intentionally: NextAuth no longer
 * provisions wallets. Users connect a Phantom / Solflare wallet lazily
 * when they create or claim a bounty.
 */

type Args = {
  twitterId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  twitterVerified: boolean;
};

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const TWITTER_TIMEOUT_MS = 5_000;

export async function upsertUserFromTwitter(
  args: Args,
): Promise<{ user: User; isNewUser: boolean; twitterSyncOk: boolean }> {
  const db = getDb();
  const now = new Date();
  const cleanHandle = args.handle.replace(/^@/, "");

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.twitterId, args.twitterId))
    .limit(1);

  const lastSyncTs =
    existing?.twitterLastSyncedAt instanceof Date
      ? existing.twitterLastSyncedAt.getTime()
      : 0;
  const needsTwitterFetch =
    !existing || now.getTime() - lastSyncTs > STALE_AFTER_MS;

  let twitterInfo: TwitterUserInfo | null = null;
  let twitterSyncOk = false;
  if (cleanHandle && needsTwitterFetch) {
    try {
      twitterInfo = await Promise.race([
        getUserInfo(cleanHandle, { userId: existing?.id ?? null }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("twitterapi.io timeout (5s)")),
            TWITTER_TIMEOUT_MS,
          ),
        ),
      ]);
      twitterSyncOk = true;
    } catch (err) {
      console.warn(
        `[upsertUserFromTwitter] twitterapi.io getUserInfo failed for @${cleanHandle}:`,
        err,
      );
    }
  } else if (existing) {
    twitterSyncOk = true;
  }

  let row: User;
  let isNewUser = false;

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        handle: existing.handle, // never silently change canonical handle
        twitterHandle: twitterInfo?.userName ?? cleanHandle,
        displayName: twitterInfo?.name ?? args.displayName ?? existing.displayName,
        avatarUrl:
          twitterInfo?.profilePicture ??
          args.avatarUrl ??
          existing.avatarUrl,
        bio: twitterInfo?.description ?? existing.bio,
        // Prefer fresh twitterapi.io truth, but if that fetch failed
        // (twitterInfo null) keep the existing value rather than
        // letting NextAuth's `args.twitterVerified` clobber it —
        // Twitter v2 OAuth doesn't reliably surface Blue-verified.
        twitterVerified:
          twitterInfo?.isVerified ?? existing.twitterVerified ?? args.twitterVerified,
        twitterFollowers:
          twitterInfo?.followers ?? existing.twitterFollowers,
        twitterFollowing:
          twitterInfo?.following ?? existing.twitterFollowing,
        twitterTweetCount:
          twitterInfo?.statusesCount ?? existing.twitterTweetCount,
        twitterAccountCreatedAt: twitterInfo?.createdAt
          ? new Date(twitterInfo.createdAt)
          : existing.twitterAccountCreatedAt,
        twitterRawProfile: twitterInfo?.raw ?? existing.twitterRawProfile,
        twitterLastSyncedAt: twitterSyncOk ? now : existing.twitterLastSyncedAt,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, existing.id))
      .returning();
    row = updated;
  } else {
    isNewUser = true;
    const referralCode = await generateUniqueReferralCode();
    const [inserted] = await db
      .insert(users)
      .values({
        // Wallet stays null — user connects lazily at create/claim time.
        walletAddress: null,
        handle: twitterInfo?.userName ?? cleanHandle,
        displayName: twitterInfo?.name ?? args.displayName ?? null,
        avatarUrl: twitterInfo?.profilePicture ?? args.avatarUrl ?? null,
        bio: twitterInfo?.description ?? null,
        twitterId: args.twitterId,
        twitterHandle: twitterInfo?.userName ?? cleanHandle,
        twitterVerified: twitterInfo?.isVerified ?? args.twitterVerified,
        twitterFollowers: twitterInfo?.followers ?? 0,
        twitterFollowing: twitterInfo?.following ?? 0,
        twitterTweetCount: twitterInfo?.statusesCount ?? 0,
        twitterAccountCreatedAt: twitterInfo?.createdAt
          ? new Date(twitterInfo.createdAt)
          : null,
        twitterRawProfile: twitterInfo?.raw ?? null,
        twitterLastSyncedAt: now,
        referralCode,
        lastActiveAt: now,
      })
      .returning();
    row = inserted;
  }

  // Best-effort smart-follower recompute. Don't fail the sign-in if
  // the cache is cold.
  try {
    const smartFollowerCount = await recomputeAndPersistSmartFollowerCount({
      userId: row.id,
      twitterId: row.twitterId,
    });
    row = {
      ...row,
      smartFollowerCount,
      smartFollowerLastCheckedAt: new Date(),
    };
  } catch (err) {
    console.warn(
      "[upsertUserFromTwitter] smart-follower recompute failed:",
      err,
    );
  }

  return { user: row, isNewUser, twitterSyncOk };
}
