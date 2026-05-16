import { NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/health — quick liveness check used by the design system page
 * (and Railway, eventually). Performs a single `COUNT(*)` against `users`,
 * which exercises both the connection pool and the migration state.
 */
export async function GET() {
  try {
    const db = getDb();
    const [row] = await db.select({ value: count() }).from(users);
    return NextResponse.json({
      ok: true,
      userCount: Number(row?.value ?? 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 503 },
    );
  }
}
