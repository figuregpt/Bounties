/**
 * Schema barrel — drizzle-kit reads each *.ts file directly via the glob in
 * drizzle.config.ts, but application code imports tables and JSONB payload
 * types from here.
 */

export * from "./users";
export * from "./auth";
export * from "./bounties";
export * from "./claims";
export * from "./verification";
export * from "./tokens";
export * from "./notifications";
export * from "./social";
export * from "./analytics";
export * from "./flags";
export * from "./smart-followers";
