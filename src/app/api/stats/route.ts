import { count, eq, inArray, max, sum } from "drizzle-orm";
import { after } from "next/server";
import { fail } from "@/lib/api/respond";
import { readPool } from "@/lib/chain/server";
import { covers, getDb, ledger } from "@/lib/db";
import { usesStreams } from "@/lib/ledger/source";
import { tickIfDue } from "@/lib/tick";

export const maxDuration = 300;

/** Public figures for the landing page: the pool as the chain reports it, and what has happened so far. */
export async function GET(request: Request) {
  // On a serverless host nothing runs between requests, so the background pass rides on this one.
  if (process.env.VERCEL) after(() => tickIfDue(new URL(request.url).origin));
  try {
    const db = await getDb();
    const [pool, [written], [paid], [refused], [streamed]] = await Promise.all([
      readPool(),
      db.select({ n: count() }).from(covers).where(inArray(covers.status, ["open", "paid", "expired"])),
      db.select({ total: sum(covers.payout) }).from(covers).where(eq(covers.status, "paid")),
      db.select({ n: count() }).from(ledger).where(eq(ledger.kind, "Blocked")),
      // Kept in the database, not in memory: on a serverless host the request that asks is rarely
      // served by the same instance that took the Stream's delivery.
      db.select({ n: count(), last: max(ledger.at) }).from(ledger).where(eq(ledger.via, "stream")),
    ]);
    const feed = { on: usesStreams, events: streamed.n, lastAt: streamed.last?.toISOString() ?? null };
    return Response.json({ pool, covers: written.n, paidOut: Number(paid.total ?? 0), refused: refused.n, feed });
  } catch (error) {
    return fail(error);
  }
}
