import { count, eq, inArray, sum } from "drizzle-orm";
import { fail } from "@/lib/api/respond";
import { readPool } from "@/lib/chain/server";
import { covers, getDb, ledger } from "@/lib/db";

/** Public figures for the landing page: the pool as the chain reports it, and what has happened so far. */
export async function GET() {
  try {
    const db = await getDb();
    const [pool, [written], [paid], [refused]] = await Promise.all([
      readPool(),
      db.select({ n: count() }).from(covers).where(inArray(covers.status, ["open", "paid", "expired"])),
      db.select({ total: sum(covers.payout) }).from(covers).where(eq(covers.status, "paid")),
      db.select({ n: count() }).from(ledger).where(eq(ledger.kind, "Blocked")),
    ]);
    return Response.json({ pool, covers: written.n, paidOut: Number(paid.total ?? 0), refused: refused.n });
  } catch (error) {
    return fail(error);
  }
}
