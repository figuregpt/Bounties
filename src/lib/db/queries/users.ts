/**
 * User queries — lookups, leaderboards, and reputation maintenance.
 */
import type { User } from "@/types/database";

export async function getUserByHandle(_handle: string): Promise<User | null> {
  // TODO(phase-3): lower(handle) lookup.
  throw new Error("Not implemented");
}

export async function getUserByTwitterId(
  _twitterId: string,
): Promise<User | null> {
  // TODO(phase-3): used by twitterapi.io webhook handlers.
  throw new Error("Not implemented");
}

export async function getTopHunters(_limit: number): Promise<User[]> {
  // TODO(phase-4): order by totalRewardsEarnedUsd desc, filter isBanned=false.
  throw new Error("Not implemented");
}

export async function getTopCreators(_limit: number): Promise<User[]> {
  // TODO(phase-4): order by totalSpentAsCreatorUsd desc.
  throw new Error("Not implemented");
}

export async function updateUserReputationScore(
  _userId: string,
  _newScore: number,
): Promise<void> {
  // TODO(phase-9): background job updates this, emit reputation_tier_up
  //                notifications when crossing tier thresholds.
  throw new Error("Not implemented");
}
