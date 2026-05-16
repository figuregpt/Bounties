/**
 * Self-test for src/lib/bounties/state-machine.ts.
 * Exits 0 on success, 1 if any assertion fails.
 */

import {
  assertBountyTransition,
  assertClaimTransition,
  canBountyTransition,
  canClaimTransition,
} from "../src/lib/bounties/state-machine";
import type { BountyStatus, ClaimStatus } from "../src/types/database";

let failed = 0;

function expectIllegalClaim(from: ClaimStatus, to: ClaimStatus) {
  try {
    assertClaimTransition(from, to);
    console.log(`FAIL: claim ${from}→${to} should have been blocked`);
    failed += 1;
  } catch (err) {
    console.log(
      `ok: claim ${from}→${to} blocked (${(err as Error).message})`,
    );
  }
}
function expectLegalClaim(from: ClaimStatus, to: ClaimStatus) {
  if (!canClaimTransition(from, to)) {
    console.log(`FAIL: claim ${from}→${to} should be legal`);
    failed += 1;
    return;
  }
  console.log(`ok: claim ${from}→${to} legal`);
}
function expectIllegalBounty(from: BountyStatus, to: BountyStatus) {
  try {
    assertBountyTransition(from, to);
    console.log(`FAIL: bounty ${from}→${to} should have been blocked`);
    failed += 1;
  } catch (err) {
    console.log(
      `ok: bounty ${from}→${to} blocked (${(err as Error).message})`,
    );
  }
}
function expectLegalBounty(from: BountyStatus, to: BountyStatus) {
  if (!canBountyTransition(from, to)) {
    console.log(`FAIL: bounty ${from}→${to} should be legal`);
    failed += 1;
    return;
  }
  console.log(`ok: bounty ${from}→${to} legal`);
}

// Claim — illegal
expectIllegalClaim("claimed_reward", "verified");
expectIllegalClaim("expired", "claimed_reward");
expectIllegalClaim("failed", "verified");
expectIllegalClaim("awaiting_action", "claimed_reward");

// Claim — legal
expectLegalClaim("initial_verified", "verified");
expectLegalClaim("verified", "claiming");
expectLegalClaim("claiming", "claimed_reward");

// Bounty — illegal
expectIllegalBounty("completed", "active");

// Bounty — legal
expectLegalBounty("active", "finalizing");
expectLegalBounty("finalizing", "completed");
expectLegalBounty("finalizing", "active");

if (failed > 0) {
  console.log(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall state-machine assertions passed");
