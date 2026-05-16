# bounties.fm

Bounty-to-earn on Solana. Campaign creators escrow tokens (USDC, SOL, $BNTY,
bags creator tokens) and pay them out for verified Twitter actions
(like, retweet, reply). Built on top of bags.fm.

## Stack

Next.js 16 (App Router · Turbopack) · TypeScript · Tailwind v4 · Drizzle ORM ·
Privy (X OAuth + Solana embedded wallets) · twitterapi.io · @bagsfm/bags-sdk ·
Jupiter · shadcn/ui · framer-motion.

## Local dev

```bash
cp .env.example .env.local        # fill in DATABASE_URL + keys
npm install --legacy-peer-deps    # Privy currently pins lucide @ ~0.5
npm run db:push                   # apply schema to your dev DB
npm run dev                       # http://localhost:3000
```

`/design-system` is the canonical visual reference and includes a live
`DB Connected` badge that hits `/api/health`.

## Database

Drizzle schema lives in [src/lib/db/schema.ts](src/lib/db/schema.ts).
Inferred row types are re-exported from [src/types/database.ts](src/types/database.ts).

| Command                  | What it does                                                |
| ------------------------ | ----------------------------------------------------------- |
| `npm run db:generate`    | Generate a new SQL migration from the current schema diff   |
| `npm run db:push`        | **Dev**: sync schema directly to the DB (no migration file) |
| `npm run db:migrate`     | **Prod**: apply all migrations in `./drizzle/`              |
| `npm run db:studio`      | Open Drizzle Studio against the configured DB               |

Generated migrations live in `./drizzle/`. On Railway, run `db:migrate` as a
release step (or wire it into the `Procfile` / `railway.json` build).

## Deploy

`railway.json` builds with Nixpacks and runs `npm run start`. Set
`DATABASE_URL`, `PRIVY_*`, `TWITTER_API_KEY`, `BAGS_API_KEY`,
`SOLANA_RPC_URL`, and `NEXT_PUBLIC_APP_URL` in the Railway service.
