import { count, desc, eq, max, ne } from "drizzle-orm";
import { fail } from "@/lib/api/respond";
import { explorerTx, type BlockReason } from "@/lib/chain/config";
import { covers, getDb, ledger } from "@/lib/db";
import { cents, shortAddress } from "@/lib/format";
import { REFUSAL } from "@/lib/words";

/** Something that really happened on the chain, with where to check it. */
export type Trace = { at: string; receipt: string | null; note: string };
export type Proof = {
  refusals: Trace[];
  /** The most recent real instance of each step a cover goes through, by the step's name on the landing page. */
  steps: Partial<Record<"Check" | "Lock" | "Pay" | "Hedge" | "Watch" | "Settle", Trace>>;
};

type Row = typeof ledger.$inferSelect;
const trace = (row: Row, note: string): Trace => ({ at: row.at.toISOString(), receipt: explorerTx(row.txHash), note });
const dollars = (row: Row, key: string) => cents(row.args[key] as number);

/** A refusal as a passer-by would read it: the wording the owner sees says "your", and this is not theirs. */
function refusal(row: Row): Trace {
  const { action, amount, counterparty, reason } = row.args;
  const tried = action === "DrawFloat" ? `draw ${cents(amount as number)} as data spending` : `pay ${cents(amount as number)} to ${shortAddress(counterparty as string)}`;
  return trace(row, `An agent tried to ${tried}. Refused: ${REFUSAL[reason as BlockReason].replace(/\byour\b/g, "its owner's")}.`);
}

/** Evidence for the landing page: what the contracts last refused, and the latest real run of each step. */
export async function GET() {
  try {
    const db = await getDb();
    const latest = async (kind: string) => (await db.select().from(ledger).where(eq(ledger.kind, kind)).orderBy(desc(ledger.blockNumber)).limit(1))[0];
    const [refused, drawn, offered, opened, closed, [streamed], hedged] = await Promise.all([
      db.select().from(ledger).where(eq(ledger.kind, "Blocked")).orderBy(desc(ledger.blockNumber), desc(ledger.id)).limit(4),
      latest("FloatDrawn"),
      latest("Offered"),
      latest("HedgeOpened"),
      latest("HedgeClosed"),
      db.select({ n: count(), last: max(ledger.at) }).from(ledger).where(eq(ledger.via, "stream")),
      db.select({ orders: covers.orders, at: covers.createdAt }).from(covers).where(ne(covers.venue, "paper")).orderBy(desc(covers.createdAt)).limit(12),
    ]);
    const order = hedged.flatMap(({ orders, at }) => orders.filter((o) => o.id).map((o) => ({ id: o.id!, at })))[0];

    const steps: Proof["steps"] = {};
    if (drawn) steps.Check = trace(drawn, `${dollars(drawn, "amount")} paid for a forecast`);
    if (offered) steps.Lock = trace(offered, `${dollars(offered, "payout")} locked`);
    if (opened) steps.Pay = trace(opened, `${dollars(opened, "premium")} premium paid`);
    if (order) steps.Hedge = { at: order.at.toISOString(), receipt: null, note: `Gemini order ${order.id}` };
    if (streamed.last) steps.Watch = { at: streamed.last.toISOString(), receipt: null, note: `${streamed.n} events delivered` };
    if (closed) steps.Settle = trace(closed, closed.args.outcome === "Paid" ? `${dollars(closed, "payout")} paid out` : closed.args.outcome === "Refunded" ? "premium returned" : "ended, nothing to pay");

    return Response.json({ refusals: refused.map(refusal), steps } satisfies Proof);
  } catch (error) {
    return fail(error);
  }
}
