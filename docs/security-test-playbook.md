# bounties.fm — security test playbook

Manual scenarios that complement `scripts/security-audit.ts`. These need a
human at the keyboard because they involve real Phantom popups, browser
tabs, network changes, and timing windows that programmatic tests can't
fake convincingly.

Run them on **devnet** before flipping to mainnet. Tick off each
scenario; any failure blocks the launch.

## Setup

- Dev server running with `TEST_AUTH_BYPASS=true` is optional (the
  automated suite uses it; manual tests don't).
- Devnet env in `.env.local`: `BOUNTIES_ESCROW_MODE=devnet`,
  `ENABLE_REAL_TX=true`, `SOLANA_NETWORK=devnet`, treasury keys present.
- Two test Twitter accounts (or browser profiles): one creator, one
  hunter.
- Both Twitter accounts have a Phantom or Solflare wallet on devnet
  with some devnet SOL + USDC.

---

## M1 · Double-click claim in UI

**Goal:** the UI doesn't double-charge a claim when the user
double-clicks or claims from two tabs.

1. Hunt a bounty, complete actions, wait for `initial_verified`.
2. Manually expire the bounty (`UPDATE bounties SET ends_at=NOW() WHERE
   slug='...'`) and trigger the bounty-completion cron so the claim
   flips to `verified`.
3. Open the bounty detail page in **two browser tabs**.
4. In both tabs, click **"Claim reward"** as fast as you can.
5. **Expected:**
   - One tab shows success + tx hash.
   - The other shows `Another claim attempt is already in progress` or
     refreshes to `Reward already sent — check your wallet`.
   - Phantom only pops up once (treasury signs, not user — Phantom
     shouldn't even see this tx).
6. **Verify on-chain:** Solscan shows exactly **one** reward tx for
   this claim id.

- [ ] M1 passed

---

## M2 · Wallet disconnect mid-claim

**Goal:** disconnecting the wallet during a claim doesn't leave the
claim stuck.

1. Get to `verified` state (as in M1).
2. Click **Claim reward**.
3. Before tx confirms, click the disconnect (power) icon in the user
   menu's wallet pill.
4. **Expected:**
   - Clean error in the UI (no React crash).
   - Claim returns to `verified` state, NOT stuck in `claiming`.
   - Re-connect a wallet → click Claim again → succeeds.

- [ ] M2 passed

---

## M3 · Network change mid-tx

**Goal:** switching Phantom from devnet to mainnet mid-flow doesn't
silently break things.

1. Start a bounty launch on devnet.
2. When Phantom popup appears, **switch Phantom's network to mainnet**
   (settings → developer settings → change network).
3. Try to approve the tx.
4. **Expected:**
   - Phantom shows a chain-mismatch error OR the tx fails fast.
   - Our UI surfaces a recognizable error string with the simulation
     detail (we have `extractSimulationDetail` for this).
   - Bounty stays in `draft`, escrow not moved.

- [ ] M3 passed

---

## M4 · Action withdrawal detection (final check)

**Goal:** the oEmbed fast-path correctly fails claims whose reply was
deleted before final verification.

1. Create a bounty requiring a reply.
2. Hunt it from the second account, post a reply, verify
   (`initial_verified`).
3. **Delete the reply** on Twitter.
4. Confirm deletion: visit `https://x.com/<your_handle>/status/<reply_id>`
   in a fresh tab → should 404.
5. Fast-forward the bounty (`UPDATE bounties SET ends_at = NOW() - INTERVAL
   '1 minute' WHERE slug='...'`).
6. Trigger the cron:
   ```bash
   curl -X POST http://localhost:3001/api/cron/bounty-completion \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
7. **Expected:**
   - Cron response: `finalFailed: 1`, no twitterapi.io call needed
     (oEmbed 404 caught it).
   - Claim status: `failed`, `failureCategory: action_withdrawn`.
   - Bounty: `completed`, full pool refunded to creator.
   - On Solscan: refund tx visible to creator.

- [ ] M4 passed

---

## M5 · Creator can't drain a bounty with verified hunters

**Goal:** if a verified hunter exists, the creator can't claw back
their funds.

1. Create a bounty.
2. Have a hunter complete actions, verify (`initial_verified`).
3. Try to expire the bounty via SQL while the verified claim exists.
4. Trigger completion cron.
5. **Expected:**
   - Verified hunter's slot reward stays (1 USDC reserved).
   - Creator's refund = total pool − reserved rewards (correct math).
   - No way for creator to get more than that back.

- [ ] M5 passed

---

## M6 · Phantom rejection on launch

**Goal:** if the user rejects the Phantom popup, no funds move and the
UI doesn't get stuck.

1. Fill out the create form, click **Launch**.
2. Phantom popup → click **Reject**.
3. **Expected:**
   - Modal closes with a clean error like "User rejected request".
   - No DB row for the bounty (still `draft` if any, no escrow tx).
   - Form is editable, can retry.

- [ ] M6 passed

---

## M7 · Insufficient wallet balance

**Goal:** trying to escrow more than the wallet has fails fast.

1. With a wallet that has, say, 1 USDC on devnet, try to launch a
   bounty needing 10 USDC pool + 1 USDC fee = 11 USDC.
2. Click **Launch**.
3. **Expected:**
   - Phantom shows "insufficient balance" OR simulation fails with
     `0x1 / insufficient funds`.
   - Our UI surfaces the failure clearly (we map known Solana errors
     to friendly copy in `extractSimulationDetail`).
   - Bounty stays `draft`.

- [ ] M7 passed

---

## M8 · Twitter handle case sensitivity

**Goal:** `@FOOBar` and `@foobar` resolve to the same user record.

1. Sign in as `@TestHandle` (uppercase letters in the X username).
2. Sign out.
3. Sign in again — Twitter OAuth might return either case.
4. **Expected:** same `users` row, no duplicate created. The
   `lower(handle)` unique index in our schema guarantees this; verify
   the `users` table has exactly one row for this twitterId.

- [ ] M8 passed

---

## M9 · Profile of non-existent user

**Goal:** visiting a bogus handle returns a clean 404, no stack trace.

1. Navigate to `http://localhost:3001/profile/thisdoesnotexist123abc`.
2. **Expected:** Next.js 404 page renders (handled by our
   `notFound()` call in `/profile/[handle]/page.tsx`). No raw error,
   no DB dump.

- [ ] M9 passed

---

## M10 · Smart-follower eligibility boundary

**Goal:** the `≥ minimum` check is inclusive, not strict-greater.

1. Find/create a bounty with `eligibility_filters.smart_followers.minimum
   = 5`.
2. Pick a hunter whose `smartFollowerCount` is exactly **5**. Verify
   in DB.
3. Hunt the bounty — should be allowed.
4. With a hunter at **4** — should show "Need 1 more smart follower" and
   refuse.

- [ ] M10 passed

---

## M11 · Long-running session

**Goal:** a session left open overnight either still works or
re-authenticates cleanly.

1. Sign in, leave a tab open for 24+ hours.
2. Come back, try to do something that requires auth (e.g., claim a
   reward).
3. **Expected:** NextAuth JWT (30-day expiry) is still valid → request
   succeeds. If the cookie was rotated by another tab's sign-in, the
   request 401s cleanly and routes to /login.

- [ ] M11 passed

---

## M12 · Concurrent hunters racing for the last slot

**Goal:** 99/100 bounty + 5 hunters racing → exactly 1 wins, others get
`bounty_filled`.

1. Create a bounty with `maxHunters: 100`. Pre-fill 99 slots (via SQL
   or by recruiting 99 helpers — easier with SQL: insert 99
   `verified` claims).
2. Open the bounty in **5 different browser profiles / incognito
   sessions**, each with a different Twitter account.
3. All 5 click **Hunt now** at the same time → all 5 claims created
   (this is OK; claim creation doesn't reserve a slot).
4. All 5 hunters do the required actions on Twitter.
5. All 5 click **Verify** simultaneously.
6. **Expected:**
   - 1 verification succeeds → slot 100/100 reached.
   - 4 verifications get `bounty_filled` (or another 409).
   - The failing 4 claims stay in `action_claimed`; they can retry but
     verify will keep returning `bounty_filled`.

- [ ] M12 passed

---

## After the playbook

When every box above is ticked, the system is ready for the next gate
(mainnet flip). Update `security-report-<date>.md` with the
check-marks and commit it alongside the audit run.

If any scenario fails: file a follow-up, fix it, re-run that scenario
specifically. Do NOT skip a failing scenario when reporting.
