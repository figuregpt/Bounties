# Railway cron setup

bounties.fm has three scheduled jobs. Railway runs them as separate
**Cron Service** deployments that each hit one of the Next.js cron
endpoints.

## Required environment

Every cron service needs the same `CRON_SECRET` that the web service
has. Set it once on the project and link it to all services.

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

ALWAYS refreshes the $ANSEM row (the $1 creation fee is converted from
this cached price at launch time — it must never go stale), plus any
token still referenced by an active legacy bounty. Skips anything
refreshed in the last 5 minutes, so the endpoint is safe to call more
often if you want fresher quotes.

## Service 3 — recover-stuck-claims (every 10 minutes)

| Field            | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Schedule         | `*/10 * * * *`                                                         |
| Command          | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_URL/api/cron/recover-stuck-claims` |

Claims stuck in `claiming` (route crashed mid-payout) either recover
their landed tx hash from the audit log or roll back to `verified` so
the hunter can retry.

> The old `expire-claims` service is dead — the `/api/cron/expire-claims`
> route was removed with claim windows. Delete the Railway service if it
> still exists; it curls a 404 every hour.

## Local testing

```
export CRON_SECRET=dev
curl -X POST -H "Authorization: Bearer dev" http://localhost:3000/api/cron/bounty-completion
curl -X POST -H "Authorization: Bearer dev" http://localhost:3000/api/cron/refresh-token-prices
```

A 401 means the header didn't match; a 200 + JSON body means the job
ran. Tail the dev server logs for treasury / verification output.
