/**
 * Entry point for the Layer 2 worker.
 *
 * Started locally with `npm run worker` (tsx + dotenv). In production it
 * runs as a separate Railway service so the Next.js process can scale
 * independently — and so a Next deploy doesn't drop the websocket.
 *
 * Lifecycle:
 *   1. Reconcile filter rules from active bounties (one-shot at boot).
 *   2. Start the websocket subscriber.
 *   3. Reconcile every `RECONCILE_INTERVAL_MS` to pick up new bounties
 *      and prune ended ones.
 *
 * On SIGINT/SIGTERM: stop the socket, await any in-flight event
 * processing, close the DB pool.
 */

import { startStreamClient } from "./stream-client";
import { reconcileRules } from "./rule-manager";
import { closeWorkerDb } from "./db";

const RECONCILE_INTERVAL_MS = 60_000;

async function main(): Promise<void> {
  console.log("[worker] starting");

  try {
    const summary = await reconcileRules();
    console.log(
      `[worker] initial reconcile — added=${summary.added} removed=${summary.removed} unchanged=${summary.unchanged}`,
    );
  } catch (err) {
    console.warn(
      "[worker] initial reconcile failed (continuing):",
      errorMessage(err),
    );
  }

  const stream = startStreamClient();

  const reconcileTimer = setInterval(() => {
    void reconcileRules()
      .then((summary) => {
        if (summary.added || summary.removed) {
          console.log(
            `[worker] reconcile — +${summary.added} -${summary.removed} = ${summary.unchanged}`,
          );
        }
      })
      .catch((err) => {
        console.warn("[worker] reconcile failed:", errorMessage(err));
      });
  }, RECONCILE_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down`);
    clearInterval(reconcileTimer);
    await stream.stop();
    await closeWorkerDb();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("[worker] unhandledRejection", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[worker] uncaughtException", err);
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

void main();
