import { count, desc, eq, inArray, max, min, ne, sum } from "drizzle-orm";
import { fail } from "@/lib/api/respond";
import { explorerTx, type BlockReason } from "@/lib/chain/config";
import { covers, getDb, ledger, odds } from "@/lib/db";
import { FORECAST_PRICE_USD } from "@/lib/desk/x402";
import { cents, shortAddress } from "@/lib/format";
import { REFUSAL } from "@/lib/words";

/** Something that really happened, with where to check it. */
export type Trace = { at: string; receipt: string | null; note: string };
export type Proof = {
  refusals: Trace[];
  /** The latest real instance of each thing a cover goes through. A step that hasn't happened on this chain yet is left out. */
  evidence: Partial<Record<"forecast" | "locked" | "premium" | "settled" | "hedge" | "stream" | "prices", Trace>>;
  counts: { covers: number; refusals: number; paidOut: number };
};

type Row = typeof ledger.$inferSelect;
const trace = (row: Row, note: string): Trace => ({ at: row.at.toISOString(), receipt: explorerTx(row.txHash), note });
const dollars = (row: Row, key: string) => cents(row.args[key] as number);

/** How a cover came to its end, in a few words. */
function ending(row: Row) {
  if (row.args.outcome === "Paid") return `${dollars(row, "payout")} paid out`;
  return row.args.outcome === "Refunded" ? "Premium returned" : "Ended with nothing to pay";
}

/** A refusal as a passer-by would read it: the wording the owner sees says "your", and this is not theirs. */
function refusal(row: Row): Trace {
  const { action, amount, counterparty, reason } = row.args;
  const tried = action === "DrawFloat" ? `draw ${cents(amount as number)} from the data budget` : `pay ${cents(amount as number)} to ${shortAddress(counterparty as string)}`;
  return trace(row, `An agent tried to ${tried}. Refused: ${REFUSAL[reason as BlockReason].replace(/\byour\b/g, "its owner’s")}.`);
}

/** Evidence that what the site says is running really is: what the contracts last refused, the latest real run of each step, and the totals. */
export async function GET() {
  try {
    const db = await getDb();
    const recent = (kind: string, limit: number) => db.select().from(ledger).where(eq(ledger.kind, kind)).orderBy(desc(ledger.blockNumber), desc(ledger.id)).limit(limit);
    const [refused, draws, offers, premiums, closes, [streamed], hedged, [written], [paid], [everRefused], [recorded]] = await Promise.all([
      recent("Blocked", 1),
      recent("FloatDrawn", 24),
      recent("Offered", 200),
      recent("HedgeOpened", 24),
      recent("HedgeClosed", 24),
      db.select({ n: count(), last: max(ledger.at) }).from(ledger).where(eq(ledger.via, "stream")),
      db
        .select({ orders: covers.orders, venue: covers.venue, at: covers.createdAt })
        .from(covers)
        .where(ne(covers.venue, "paper"))
        .orderBy(desc(covers.createdAt))
        .limit(12),
      db.select({ n: count() }).from(covers).where(inArray(covers.status, ["open", "paid", "expired"])),
      db.select({ total: sum(covers.payout) }).from(covers).where(eq(covers.status, "paid")),
      db.select({ n: count() }).from(ledger).where(eq(ledger.kind, "Blocked")),
      db.select({ n: count(), since: min(odds.at) }).from(odds),
    ]);
    // The test on the agent page also draws data money, pays a premium and gets it back, as an attacker would.
    // Those are not the steps running: a forecast is a draw of exactly its price, and real cover is cover the pool offered.
    const offeredId = new Set(offers.map((offer) => offer.args.hedgeId));
    const drawn = draws.find((row) => row.args.amount === FORECAST_PRICE_USD);
    const opened = premiums.find((row) => offeredId.has(row.args.hedgeId));
    const offered = opened && offers.find((offer) => offer.args.hedgeId === opened.args.hedgeId);
    const closed = closes.find((row) => offeredId.has(row.args.hedgeId));
    const order = hedged.flatMap(({ orders, venue, at }) => orders.filter((o) => o.id).map((o) => ({ id: o.id!, venue, at })))[0];

    const evidence: Proof["evidence"] = {};
    if (drawn) evidence.forecast = trace(drawn, `${dollars(drawn, "amount")} paid for a forecast`);
    if (offered) evidence.locked = trace(offered, `${dollars(offered, "payout")} locked`);
    if (opened) evidence.premium = trace(opened, `${dollars(opened, "premium")} premium paid`);
    if (closed) evidence.settled = trace(closed, ending(closed));
    if (order) {
      // A Gemini order id runs to eighteen digits; its tail is enough to tell one from another on a line this short.
      const venue = order.venue === "gemini" ? "Gemini" : "Gemini sandbox";
      evidence.hedge = { at: order.at.toISOString(), receipt: null, note: `${venue} order ending ${order.id.slice(-6)}` };
    }
    // Gemini's API has no price history, so what Awning has kept of it is the evidence that odds are tracked over time.
    if (recorded.since) evidence.prices = { at: recorded.since.toISOString(), receipt: null, note: `${recorded.n.toLocaleString("en-US")} of Gemini’s prices kept` };
    if (streamed.last) evidence.stream = { at: streamed.last.toISOString(), receipt: null, note: `${streamed.n} events delivered` };

    const counts = { covers: written.n, refusals: everRefused.n, paidOut: Number(paid.total ?? 0) };
    return Response.json({ refusals: refused.map(refusal), evidence, counts } satisfies Proof);
  } catch (error) {
    return fail(error);
  }
}
