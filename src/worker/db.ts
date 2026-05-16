import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

/**
 * Worker-only Drizzle client.
 *
 * The Next.js side uses `@/lib/db` which is decorated with `server-only`.
 * That import poisons any module that runs in Node directly (tsx, the
 * worker entry), so the worker maintains its own thin wrapper.
 *
 * Same postgres-js driver, same schema, same options as the web side —
 * just without the `server-only` taint.
 */

let cached: PostgresJsDatabase<typeof schema> | null = null;
let cachedClient: ReturnType<typeof postgres> | null = null;

export function workerDb(): PostgresJsDatabase<typeof schema> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  cachedClient = postgres(url, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  cached = drizzle(cachedClient, { schema });
  return cached;
}

export async function closeWorkerDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end({ timeout: 5 });
    cachedClient = null;
    cached = null;
  }
}
