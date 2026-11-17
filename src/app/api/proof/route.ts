import { desc, eq } from "drizzle-orm";
import { fail } from "@/lib/api/respond";
import { explorerTx, type BlockReason } from "@/lib/chain/config";
import { getDb, ledger } from "@/lib/db";
import { cents, shortAddress } from "@/lib/format";
import { REFUSAL } from "@/lib/words";

/** Something that really happened on the chain, with where to check it. */
export type Trace = { at: string; receipt: string | null; note: string };
export type Proof = { refusals: Trace[] };

type Row = typeof ledger.$inferSelect;

/** A refusal as a passer-by would read it: the wording the owner sees says "your", and this is not theirs. */
function refusal(row: Row): Trace {
  const { action, amount, counterparty, reason } = row.args;
  const tried = action === "DrawFloat" ? `draw ${cents(amount as number)} from the data budget` : `pay ${cents(amount as number)} to ${shortAddress(counterparty as string)}`;
  return {
    at: row.at.toISOString(),
    receipt: explorerTx(row.txHash),
    note: `An agent tried to ${tried}. Refused: ${REFUSAL[reason as BlockReason].replace(/\byour\b/g, "its owner’s")}.`,
  };
}

/** Evidence for the landing page: what the contracts last refused. */
export async function GET() {
  try {
    const db = await getDb();
    const refused = await db.select().from(ledger).where(eq(ledger.kind, "Blocked")).orderBy(desc(ledger.blockNumber), desc(ledger.id)).limit(1);
    return Response.json({ refusals: refused.map(refusal) } satisfies Proof);
  } catch (error) {
    return fail(error);
  }
}
