# Railway cron setup — Phase 8

bounties.fm has two scheduled jobs. Railway runs them as separate **Cron
Service** deployments that each hit one of the Next.js cron endpoints.

## Required environment

Both cron services need the same `CRON_SECRET` that the web service has.
Set it once on the project and link it to all three services.

```
CRON_SECRET=<long random string, share across web + cron services>
```

## Service 1 — bounty-completion (every minute)

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Schedule         | `* * * * *`                                                                |
| Command          | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_URL/api/cron/bounty-completion` |

`$PUBLIC_URL` is the bounties.fm web service URL. Use Railway's
service-link feature so the cron service can reference the web URL.

Job picks up to 50 ended bounties per run; on a busy day this is plenty.
If the queue ever backs up we can scale by running the cron more often
or raising the `BATCH` constant in `src/app/api/cron/bounty-completion/route.ts`.

## Service 2 — refresh-token-prices (every 5 minutes)

| Field            | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Schedule         | `*/5 * * * *`                                                               |
| Command          | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_URL/api/cron/refresh-token-prices` |

Pulls fresh DexScreener data for tokens currently used by active
bounties. Skips anything refreshed in the last 5 minutes, so the
endpoint is safe to call more often if you want fresher quotes.

## Service 3 — expire-claims (hourly)

| Field            | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Schedule         | `0 * * * *`                                                            |
| Command          | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_URL/api/cron/expire-claims` |

Flips claims past their 48h claim window to `expired`. Reward stays in
the treasury and routes to the Phase-9 buyback pool.

## Local testing

```
export CRON_SECRET=dev
curl -X POST -H "Authorization: Bearer dev" http://localhost:3000/api/cron/bounty-completion
curl -X POST -H "Authorization: Bearer dev" http://localhost:3000/api/cron/expire-claims
```

A 401 means the header didn't match; a 200 + JSON body means the job
ran. Tail the dev server logs for treasury / verification output.
