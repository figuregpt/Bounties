import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Drizzle ORM client for bounties.fm.
 *
 * Design notes:
 * - Lazy-initialized so `next build` (and any server code that doesn't
 *   touch the DB) works without DATABASE_URL set.
 * - Reuses a single `postgres` connection pool across hot-reloads in dev
 *   via `globalThis` — avoids leaking sockets every time a route file changes.
 * - Exported as both a `db` proxy (for ergonomic `db.select(...)`) and an
 *   explicit `getDb()` for callers that want the eager value.
 */

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __bountyPg?: ReturnType<typeof postgres>;
  __bountyDb?: Db;
};

function init(): Db {
  if (globalForDb.__bountyDb) return globalForDb.__bountyDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example → .env.local and fill it in.",
    );
  }

  const client =
    globalForDb.__bountyPg ??
    postgres(url, {
      max: 10,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });

  const instance = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__bountyPg = client;
    globalForDb.__bountyDb = instance;
  }
  return instance;
}

export function getDb(): Db {
  return globalForDb.__bountyDb ?? init();
}

/**
 * Ergonomic singleton. Safe to import at module load — it defers the
 * actual connection until you call a method on it.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
}) as Db;

export { schema };
