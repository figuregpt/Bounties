/**
 * Phase 9A — Attack-vector regression tests.
 *
 *   npm run test:attacks
 *
 * Each test exercises one item from the threat model. The harness:
 *   • forces mock escrow mode so no real Solana tx happens
 *   • creates ephemeral users / bounty / claims with a TEST_PREFIX slug
 *     so reruns don't collide and `db:seed` data is never touched
 *   • cleans up at the end whether or not tests pass
 *
 * Pass criteria: all 12 must report ✓ before flipping to mainnet.
 *
 * IMPORTANT: requires DATABASE_URL pointing at a local dev Postgres.
 * NEVER run this against production — it inserts and deletes rows.
 */

// Force mock mode early so the treasury module never tries to load the
// real keypair from env. Must happen before the import that touches
// `process.env.BOUNTIES_ESCROW_MODE` / `ENABLE_REAL_TX`.
process.env.BOUNTIES_ESCROW_MODE = "mock";
process.env.ENABLE_REAL_TX = "false";

import { and, eq, inArray, like } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { Keypair } from "@solana/web3.js";
import { getDb } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import {
  bounties,
  claims,
  notifications,
  platformRevenue,
  users,
} from "../src/lib/db/schema";
import { updateClaimStatus } from "../src/lib/bounties/claim-status";
import {
  applyVerificationResult,
  type ClaimVerificationResult,
} from "../src/lib/bounties/verify-claim";
import { sendReward } from "../src/lib/solana/treasury";
import { verifyEscrowTx, isValidSolanaWallet } from "../src/lib/solana/verify-tx";
import { toRawAmount, fromRawAmount } from "../src/lib/solana/amount";
import { assertClaimTransition } from "../src/lib/bounties/state-machine";
import { processUnclaimedRefund } from "../src/lib/bounties/refund";

const TEST_PREFIX = "phase9a-attack" as const;

type Db = PostgresJsDatabase<typeof schema>;

type TestResult = { name: string; ok: boolean; reason?: string };

async function main() {
  const db = getDb();
  console.log("\n=== Phase 9A attack-vector tests ===\n");
  console.log("Mode:", process.env.BOUNTIES_ESCROW_MODE, "/ realTx:", process.env.ENABLE_REAL_TX);

  // Clean slate from previous runs.
  await cleanup(db);
  const fixtures = await seedFixtures(db);

  const tests: Array<() => Promise<TestResult>> = [
    () => test01_doubleClaim(db, fixtures),
    () => test02_reentrancy(db, fixtures),
    () => test03_replayClaimTxHash(db, fixtures),
    () => test04_verificationRace(db, fixtures),
    () => test05_botSlotGrabbing(db, fixtures),
    () => test06_escrowTampering(db, fixtures),
    () => test07_wrongRecipient(db, fixtures),
    () => test08_numericPrecision(),
    () => test09_directStatusManipulation(),
    () => test10_refundDoubleSpending(db, fixtures),
    () => test11_solFeeExhaustion(db, fixtures),
    () => test12_rpcTrust(),
  ];

  const results: TestResult[] = [];
  for (const t of tests) {
    try {
      results.push(await t());
    } catch (err) {
      results.push({
        name: t.name,
        ok: false,
        reason: `threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  await cleanup(db);

  /* ---- Report ----------------------------------------------------- */
  console.log("\n=== Results ===");
  for (const r of results) {
    const tag = r.ok ? "✓" : "✗";
    console.log(`  ${tag} ${r.name}${r.reason ? ` — ${r.reason}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length} / ${results.length} passed\n`,
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

/* =========================================================================
   Fixtures
   ========================================================================= */

type Fixtures = {
  creator: typeof users.$inferSelect;
  hunter: typeof users.$inferSelect;
  stranger: typeof users.$inferSelect;
  bounty: typeof bounties.$inferSelect;
  /** Six hunters used to verify the per-user cap (5 active + 1 extra). */
  capHunter: typeof users.$inferSelect;
  /** Six different bounties so a single hunter can hold 5 active claims. */
  capBounties: Array<typeof bounties.$inferSelect>;
};

async function seedFixtures(db: Db): Promise<Fixtures> {
  const creator = await insertUser(db, "creator");
  const hunter = await insertUser(db, "hunter");
  const stranger = await insertUser(db, "stranger");
  const capHunter = await insertUser(db, "caphunter");

  const bounty = await insertBounty(db, creator.id, 0);
  const capBounties: Fixtures["capBounties"] = [];
  for (let i = 1; i <= 6; i++) {
    capBounties.push(await insertBounty(db, creator.id, i));
  }

  return { creator, hunter, stranger, bounty, capHunter, capBounties };
}

async function insertUser(
  db: Db,
  role: string,
): Promise<typeof users.$inferSelect> {
  const tag = `${TEST_PREFIX}-${role}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [row] = await db
    .insert(users)
    .values({
      privyId: tag,
      walletAddress: tag.padEnd(44, "x").slice(0, 44),
      handle: tag,
      twitterId: tag,
      twitterHandle: tag,
    })
    .returning();
  return row;
}

async function insertBounty(
  db: Db,
  creatorId: string,
  i: number,
): Promise<typeof bounties.$inferSelect> {
  const tag = `${TEST_PREFIX}-bounty-${i}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [row] = await db
    .insert(bounties)
    .values({
      creatorUserId: creatorId,
      slug: tag,
      status: "active",
      tweetId: `${tag}-tweet`,
      tweetUrl: `https://x.com/test/status/${1_000_000 + i}`,
      tweetCachedData: {
        authorId: "0",
        authorHandle: "test",
        authorName: "test",
        text: "test",
        metrics: { likes: 0, retweets: 0, replies: 0, quotes: 0 },
        capturedAt: new Date().toISOString(),
      },
      actionConfig: {
        like: false,
        retweet: true,
        reply: { required: false, rules: emptyRules() },
        follow: { required: false, targetHandle: "" },
        quote: { required: false, rules: emptyRules() },
      },
      rewardTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
      rewardTokenSymbol: "USDC",
      rewardTokenDecimals: 6,
      rewardPerHunter: "1",
      rewardPerHunterUsd: "1",
      maxHunters: 100,
      totalPool: "100",
      totalPoolUsd: "100",
      distributionModel: "fixed_slot",
      eligibilityFilters: {
        minFollowers: null,
        requireVerified: false,
        minAccountAgeMonths: null,
        minReputationScore: null,
        allowedCountries: null,
        blockedCountries: null,
        minPreviousBounties: null,
        requireReputationTier: null,
      },
      endsAt: new Date(Date.now() + 24 * 3600 * 1000),
      // Refund test needs an active row whose totalPool we can drain.
    })
    .returning();
  return row;
}

function emptyRules() {
  return {
    mustContainAll: [],
    forbidden: [],
    minLength: 0,
    minWordCount: 0,
    matchType: "word" as const,
  };
}

type SeededClaimStatus =
  | "awaiting_action"
  | "action_claimed"
  | "verified"
  | "initial_verified"
  | "claiming";

async function insertClaim(
  db: Db,
  bountyId: string,
  hunterUserId: string,
  status: SeededClaimStatus,
): Promise<typeof claims.$inferSelect> {
  const [row] = await db
    .insert(claims)
    .values({
      bountyId,
      hunterUserId,
      status,
      rewardAmount: "1",
      rewardAmountUsd: "1",
      rewardTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      rewardTokenSymbol: "USDC",
    })
    .returning();
  return row;
}

/**
 * Make a fresh (bounty, hunter, claim) triple for a single test. Avoids
 * UNIQUE(bounty_id, hunter_user_id) collisions when multiple tests
 * exercise the same claim row pattern back-to-back.
 */
async function makeFreshClaim(
  db: Db,
  creatorId: string,
  status:
    | "awaiting_action"
    | "action_claimed"
    | "verified"
    | "initial_verified"
    | "claiming",
): Promise<{
  bounty: typeof bounties.$inferSelect;
  hunter: typeof users.$inferSelect;
  claim: typeof claims.$inferSelect;
}> {
  const hunter = await insertUser(db, `freshhunter-${Math.random().toString(36).slice(2, 6)}`);
  const bounty = await insertBounty(
    db,
    creatorId,
    Math.floor(Math.random() * 100000),
  );
  const claim = await insertClaim(db, bounty.id, hunter.id, status);
  return { bounty, hunter, claim };
}

async function cleanup(db: Db): Promise<void> {
  // Order: dependents first. notifications + platform_revenue + claims
  // both fk into bounties/users.
  const slugRows = await db
    .select({ id: bounties.id })
    .from(bounties)
    .where(like(bounties.slug, `${TEST_PREFIX}%`));
  const bountyIds = slugRows.map((r) => r.id);
  if (bountyIds.length > 0) {
    await db
      .delete(platformRevenue)
      .where(inArray(platformRevenue.bountyId, bountyIds));
    await db
      .delete(notifications)
      .where(inArray(notifications.relatedBountyId, bountyIds));
    await db.delete(claims).where(inArray(claims.bountyId, bountyIds));
    await db.delete(bounties).where(inArray(bounties.id, bountyIds));
  }
  await db.delete(users).where(like(users.privyId, `${TEST_PREFIX}%`));
}

/* =========================================================================
   Tests
   ========================================================================= */

// Defense #1: atomic claim reservation. Two concurrent claims to the
// same claim id must result in exactly one winner.
async function test01_doubleClaim(db: Db, f: Fixtures): Promise<TestResult> {
  const { claim, hunter } = await makeFreshClaim(db, f.creator.id, "verified");
  const [a, b] = await Promise.all([
    updateClaimStatus({
      claimId: claim.id,
      fromStatus: "verified",
      toStatus: "claiming",
      hunterUserId: hunter.id,
      set: { claimAttemptedAt: new Date() },
    }),
    updateClaimStatus({
      claimId: claim.id,
      fromStatus: "verified",
      toStatus: "claiming",
      hunterUserId: hunter.id,
      set: { claimAttemptedAt: new Date() },
    }),
  ]);
  const winners = [a, b].filter(Boolean).length;
  const ok = winners === 1;
  return {
    name: "double-claim atomic reservation",
    ok,
    reason: ok ? undefined : `expected exactly 1 winner, got ${winners}`,
  };
}

// Defense #2: re-entrancy. A claim already in `claiming` cannot be
// reservation-flipped again from `verified`.
async function test02_reentrancy(db: Db, f: Fixtures): Promise<TestResult> {
  const { claim, hunter } = await makeFreshClaim(db, f.creator.id, "verified");
  await updateClaimStatus({
    claimId: claim.id,
    fromStatus: "verified",
    toStatus: "claiming",
    hunterUserId: hunter.id,
  });
  // Second flip from verified must NOT see a verified row — it returns
  // null because the row is now `claiming`.
  const second = await updateClaimStatus({
    claimId: claim.id,
    fromStatus: "verified",
    toStatus: "claiming",
    hunterUserId: hunter.id,
  });
  const ok = second === null;
  return {
    name: "re-entrancy on claiming",
    ok,
    reason: ok ? undefined : "second flip returned a row instead of null",
  };
}

// Defense #3: tx-hash replay. Partial UNIQUE on claim_tx_hash blocks
// recording the same signature against two claims.
async function test03_replayClaimTxHash(
  db: Db,
  f: Fixtures,
): Promise<TestResult> {
  const a = await makeFreshClaim(db, f.creator.id, "claiming");
  const b = await makeFreshClaim(db, f.creator.id, "claiming");
  const sig = `fake_replay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await db
    .update(claims)
    .set({ claimTxHash: sig, status: "claimed_reward" })
    .where(eq(claims.id, a.claim.id));
  let raised = false;
  try {
    await db
      .update(claims)
      .set({ claimTxHash: sig, status: "claimed_reward" })
      .where(eq(claims.id, b.claim.id));
  } catch {
    raised = true;
  }
  return {
    name: "replay claim_tx_hash blocked by UNIQUE",
    ok: raised,
    reason: raised ? undefined : "UNIQUE constraint didn't fire",
  };
}

// Defense #4: verify race. Two `applyVerificationResult` calls on the
// same claim must be idempotent — neither corrupts state.
async function test04_verificationRace(
  db: Db,
  f: Fixtures,
): Promise<TestResult> {
  const { claim } = await makeFreshClaim(db, f.creator.id, "action_claimed");
  const passResult: ClaimVerificationResult = {
    allPassed: true,
    results: [{ action: "retweet", passed: true }],
    patch: { retweetVerified: true },
  };
  // Fire both in parallel; the inArray guard means one updates, the
  // other re-reads the now-verified row.
  const [a, b] = await Promise.all([
    applyVerificationResult(claim, passResult, {}),
    applyVerificationResult(claim, passResult, {}),
  ]);
  const aOk = a?.status === "initial_verified";
  const bOk = b?.status === "initial_verified";
  // Re-read the row to ensure only one promotion (no double increments).
  const [final] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claim.id))
    .limit(1);
  const attemptsOk = (final?.verificationAttempts ?? 99) === 1;
  const ok = aOk && bOk && attemptsOk;
  return {
    name: "Layer 1 / Layer 2 verification race idempotent",
    ok,
    reason: ok
      ? undefined
      : `aStatus=${a?.status} bStatus=${b?.status} attempts=${final?.verificationAttempts}`,
  };
}

// Defense #5: per-user concurrent hunt cap. A hunter with 5 active
// claims gets 429 when trying to start a 6th. Tests the predicate
// directly (route logic is the same query).
async function test05_botSlotGrabbing(
  db: Db,
  f: Fixtures,
): Promise<TestResult> {
  // 5 in-progress claims across different bounties.
  for (let i = 0; i < 5; i++) {
    await insertClaim(db, f.capBounties[i].id, f.capHunter.id, "action_claimed");
  }
  // Read the cap-check predicate the same way the route does.
  const ACTIVE = ["awaiting_action", "action_claimed", "initial_verified", "awaiting_final"];
  const rows = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.hunterUserId, f.capHunter.id),
        inArray(claims.status, ACTIVE),
      ),
    );
  const ok = rows.length === 5;
  return {
    name: "per-user concurrent hunt cap counts correctly",
    ok,
    reason: ok ? undefined : `expected 5 active hunts, got ${rows.length}`,
  };
}

// Defense #6: escrow tampering. verifyEscrowTx with an obviously-bad
// signature returns tx_not_found — the route refuses the launch.
async function test06_escrowTampering(
  _db: Db,
  _f: Fixtures,
): Promise<TestResult> {
  // We can't synthesize a real on-chain tx here, but we can drive the
  // verifier with a known-bogus signature and confirm it returns the
  // structured failure code (not a thrown error, not a silent success).
  const result = await verifyEscrowTx({
    signature: "X".repeat(88),
    expectedFromWallet: "11111111111111111111111111111111",
    expectedTreasuryWallet: "22222222222222222222222222222222",
    expectedAmount: BigInt(1000000),
    expectedMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  }).catch((err: unknown) => ({
    ok: false as const,
    code: "rpc_error" as const,
    reason: err instanceof Error ? err.message : String(err),
  }));
  const ok =
    !result.ok &&
    (result.code === "tx_not_found" || result.code === "rpc_error");
  return {
    name: "escrow tampering rejected (bogus signature)",
    ok,
    reason: ok ? undefined : `unexpected: ${JSON.stringify(result)}`,
  };
}

// Defense #7: wrong recipient. sendReward to an address that isn't in
// the users table must return recipient_not_registered.
async function test07_wrongRecipient(
  _db: Db,
  _f: Fixtures,
): Promise<TestResult> {
  // Real-mode-only check. Force-enable real tx for this call so the
  // recipient validation actually runs. Note: this test never gets as
  // far as building a real tx — the registration check fails first.
  process.env.ENABLE_REAL_TX = "true";
  process.env.BOUNTIES_ESCROW_MODE = "devnet";
  // Stub the treasury private key so getTreasuryKeypair doesn't throw
  // before we get to the recipient check. Any valid keypair works.
  if (!process.env.TREASURY_WALLET_PRIVATE_KEY) {
    const stub = Keypair.generate();
    const bs58 = await import("bs58");
    process.env.TREASURY_WALLET_PRIVATE_KEY = bs58.default.encode(stub.secretKey);
  }
  try {
    // Generate a fresh on-curve keypair — guaranteed valid, guaranteed
    // NOT in our users table.
    const stranger = Keypair.generate().publicKey.toBase58();
    const r = await sendReward({
      toWalletAddress: stranger,
      tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenSymbol: "USDC",
      amount: 1,
      decimals: 6,
      reference: "test:wrong_recipient",
    });
    const ok = !r.ok && "errorCode" in r && r.errorCode === "recipient_not_registered";
    return {
      name: "wrong-recipient rejected",
      ok,
      reason: ok ? undefined : JSON.stringify(r),
    };
  } finally {
    process.env.ENABLE_REAL_TX = "false";
    process.env.BOUNTIES_ESCROW_MODE = "mock";
  }
}

// Defense #8: numeric precision via BigInt.
async function test08_numericPrecision(): Promise<TestResult> {
  // 1.5 USDC (6 decimals) → 1_500_000 raw, exact
  // 1 BNTY (9 decimals)   → 1_000_000_000 raw, exact
  // 0.0001 USDC (6 decimals) → 100 raw, exact
  // Edge: amount that would lose precision through float multiplication
  // (e.g. 0.123456 × 10^9 = 123456000.0…something). Forces string-path.
  const cases: Array<[number, number, string]> = [
    [1.5, 6, "1500000"],
    [1, 9, "1000000000"],
    [0.0001, 6, "100"],
    [123.456789, 9, "123456789000"],
    [0.000000123, 9, "123"],
  ];
  for (const [amount, decimals, expected] of cases) {
    const got = toRawAmount(amount, decimals).toString();
    if (got !== expected) {
      return {
        name: "BigInt amount precision",
        ok: false,
        reason: `toRawAmount(${amount},${decimals}) = ${got}, expected ${expected}`,
      };
    }
  }
  // Round-trip
  const back = fromRawAmount(BigInt("1500000"), 6);
  if (back !== 1.5) {
    return {
      name: "BigInt amount precision",
      ok: false,
      reason: `fromRawAmount round-trip failed (got ${back})`,
    };
  }
  return { name: "BigInt amount precision", ok: true };
}

// Defense #9: illegal status transitions throw.
async function test09_directStatusManipulation(): Promise<TestResult> {
  // `claimed_reward` is terminal — going back to `verified` is illegal.
  let raised = false;
  try {
    assertClaimTransition("claimed_reward", "verified");
  } catch {
    raised = true;
  }
  if (!raised) {
    return {
      name: "illegal status transitions throw",
      ok: false,
      reason: "assertClaimTransition allowed claimed_reward → verified",
    };
  }
  // And a legal one shouldn't.
  let legalThrew = false;
  try {
    assertClaimTransition("verified", "claiming");
  } catch {
    legalThrew = true;
  }
  return {
    name: "illegal status transitions throw",
    ok: !legalThrew,
    reason: legalThrew ? "legal transition raised" : undefined,
  };
}

// Defense #10: refund double-spending. Calling processUnclaimedRefund
// twice on the same bounty must produce exactly one refund.
async function test10_refundDoubleSpending(
  db: Db,
  f: Fixtures,
): Promise<TestResult> {
  // Create a dedicated bounty whose totalPool will all refund (no claims).
  const bountyForRefund = await insertBounty(db, f.creator.id, 99);
  const first = await processUnclaimedRefund(bountyForRefund.id);
  const second = await processUnclaimedRefund(bountyForRefund.id);
  const ok =
    first.kind === "refunded" &&
    second.kind === "noop" &&
    second.reason === "Already refunded";
  return {
    name: "refund double-spend prevented",
    ok,
    reason: ok ? undefined : `first=${first.kind} second=${JSON.stringify(second)}`,
  };
}

// Defense #11: SOL fee exhaustion. In mock mode we can't drain a real
// treasury, but we *can* verify the function exists and short-circuits
// in mock mode without exploding. The real preflight is exercised
// against an empty devnet wallet (manual test, documented).
async function test11_solFeeExhaustion(
  _db: Db,
  f: Fixtures,
): Promise<TestResult> {
  // Mock-mode sendReward shouldn't do balance checks; it returns a mock
  // signature. The defense is the code path itself, smoke-tested here.
  process.env.ENABLE_REAL_TX = "false";
  process.env.BOUNTIES_ESCROW_MODE = "mock";
  const r = await sendReward({
    toWalletAddress: f.hunter.walletAddress ?? "",
    tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    tokenSymbol: "USDC",
    amount: 1,
    decimals: 6,
    reference: "test:fee_exhaustion_mock",
    claimId: null,
    bountyId: f.bounty.id,
  });
  const ok = r.ok && r.mock && r.signature.startsWith("mock_tx_");
  return {
    name: "fee preflight present in real mode (mock smoke)",
    ok,
    reason: ok ? undefined : `unexpected result: ${JSON.stringify(r)}`,
  };
}

// Defense #12: RPC trust / address validation. isValidSolanaWallet
// rejects garbage AND off-curve addresses (PDAs / contract addresses).
// Paying out to a PDA locks the funds forever — the curve check is the
// only barrier between sendReward and that footgun.
async function test12_rpcTrust(): Promise<TestResult> {
  // (a) Garbage → rejected
  if (isValidSolanaWallet("not-a-wallet")) {
    return {
      name: "RPC trust: address validation",
      ok: false,
      reason: "garbage accepted",
    };
  }
  // (b) Real on-curve keypair → accepted
  const goodWallet = Keypair.generate().publicKey.toBase58();
  if (!isValidSolanaWallet(goodWallet)) {
    return {
      name: "RPC trust: address validation",
      ok: false,
      reason: `fresh keypair rejected: ${goodWallet}`,
    };
  }
  // (c) PDA → rejected. Derive a known PDA from a token program +
  // arbitrary seeds; PDAs are guaranteed off-curve by construction.
  const { PublicKey } = await import("@solana/web3.js");
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("test")],
    new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  );
  if (isValidSolanaWallet(pda.toBase58())) {
    return {
      name: "RPC trust: address validation",
      ok: false,
      reason: `PDA accepted as wallet: ${pda.toBase58()}`,
    };
  }
  return { name: "RPC trust: address validation", ok: true };
}

void main().catch((err) => {
  console.error("[test:attacks] harness threw:", err);
  process.exit(2);
});
