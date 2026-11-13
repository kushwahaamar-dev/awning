import { and, desc, eq, inArray } from "drizzle-orm";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { closeHedge, openHedge, readAllowance, venueAddress } from "../chain/server";
import { covers, getDb, type Order } from "../db";
import { getMarket, listMarkets } from "../gemini/client";
import type { Market } from "../gemini/market";
import type { Exposure } from "../hedge/exposure";
import { planCover, type CoverPlan } from "../hedge/plan";
import { contractFor, getVenue } from "../venue";

/** A problem the person can do something about; shown to them as-is. */
export class CoverError extends Error {}

const APPROVAL_WINDOW_SECONDS = 15 * 60;
const cents = (n: number) => Math.round(n * 100) / 100;

/** Binds an onchain hedge to the exact Gemini contracts and sides it was priced on. */
function marketRef(plan: CoverPlan): Hex {
  const legs = plan.coverage.legs.map((l) => `${l.symbol}:${l.side}`).join(",");
  return keccak256(toHex(`gemini:${plan.market.ticker}:${legs}`));
}

export type CoverTerms = {
  id: Hex;
  venue: Address;
  premium: number;
  maxPayout: number;
  marketRef: Hex;
  deadline: number;
  needsApproval: boolean;
};

export async function quoteCover(input: { owner: Address; exposure: Exposure; coverRatio: number; mode: "now" | "resting" }): Promise<CoverTerms> {
  const plan = await planCover(input.exposure, listMarkets, { coverRatio: input.coverRatio });
  if (!plan) throw new CoverError("Gemini no longer lists a market for this.");

  const pricing = input.mode === "now" ? plan.quote.now : plan.quote.resting;
  if (!pricing) throw new CoverError(input.mode === "now" ? "Nobody is selling this right now. Leave an order instead." : "There is no price to anchor an order on yet.");

  const allowance = await readAllowance(input.owner);
  const id = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const orders: Order[] = plan.coverage.legs.map((leg, i) => ({
    symbol: leg.symbol,
    side: leg.side,
    price: pricing.prices[i],
    quantity: plan.quote.contracts,
    id: null,
    filled: 0,
  }));

  const db = await getDb();
  await db.insert(covers).values({
    id,
    owner: input.owner.toLowerCase(),
    status: "quoted",
    plan,
    mode: input.mode,
    venue: getVenue().name,
    premium: pricing.total,
    maxPayout: plan.quote.payout,
    orders,
    marketTicker: plan.market.ticker,
    expiresAt: new Date(plan.market.expiresAt),
  });

  return {
    id,
    venue: venueAddress(),
    premium: pricing.total,
    maxPayout: plan.quote.payout,
    marketRef: marketRef(plan),
    deadline: Math.floor(Date.now() / 1000) + APPROVAL_WINDOW_SECONDS,
    needsApproval: pricing.total > allowance.approvalThreshold,
  };
}

/** The agent asks the mandate for the premium, and only places orders if the mandate paid it. */
export async function openCover(id: Hex, approval: { deadline: number; signature: Hex | null }) {
  const db = await getDb();
  const [cover] = await db.select().from(covers).where(eq(covers.id, id));
  if (!cover) throw new CoverError("That quote doesn't exist.");
  if (cover.status !== "quoted") throw new CoverError("That quote has already been used.");

  const attempt = await openHedge({
    owner: cover.owner as Address,
    hedgeId: id,
    venue: venueAddress(),
    premium: cover.premium,
    maxPayout: cover.maxPayout,
    marketRef: marketRef(cover.plan),
    deadline: approval.deadline,
    ownerSignature: approval.signature ?? "0x",
  });

  if (!attempt.ok) {
    await db.update(covers).set({ status: "blocked", note: attempt.reason, openTx: attempt.txHash, closedAt: new Date() }).where(eq(covers.id, id));
    return { status: "blocked" as const, reason: attempt.reason, txHash: attempt.txHash };
  }

  const orders = await getVenue().place(cover.orders, cover.mode);
  await db.update(covers).set({ status: "open", orders, openTx: attempt.txHash }).where(eq(covers.id, id));
  return { status: "open" as const, txHash: attempt.txHash };
}

export async function listCovers(owner: string) {
  const db = await getDb();
  return db
    .select()
    .from(covers)
    .where(and(eq(covers.owner, owner.toLowerCase()), inArray(covers.status, ["open", "paid", "expired", "refunded", "blocked"])))
    .orderBy(desc(covers.createdAt))
    .limit(50);
}

type Settlement = { outcome: "Paid" | "Expired" | "Refunded"; payout: number };

/**
 * What the venue owes the owner once every leg has resolved. A winning contract pays $1;
 * premium that never bought anything, because a resting order didn't fill, goes back.
 * Returns null while any leg is still unresolved.
 */
export function settlement(orders: Order[], premium: number, market: Market): Settlement | null {
  let winnings = 0;
  let filled = 0;
  let wanted = 0;
  for (const order of orders) {
    const resolvedYes = contractFor(order, market)?.resolvedYes;
    if (resolvedYes == null) return null;
    if ((order.side === "yes") === resolvedYes) winnings += order.filled;
    filled += order.filled;
    wanted += order.quantity;
  }
  const unspent = cents(premium * (1 - filled / wanted));
  const payout = cents(winnings + unspent);
  return { outcome: winnings > 0 ? "Paid" : unspent > 0 ? "Refunded" : "Expired", payout };
}

/** Checks every open cover against Gemini: updates fills, and pays out or closes the ones that have resolved. */
export async function settleOpenCovers() {
  const db = await getDb();
  const open = await db.select().from(covers).where(eq(covers.status, "open"));

  for (const cover of open) {
    const market = await getMarket(cover.marketTicker);
    if (!market) continue;

    const orders = await getVenue().refresh(cover.orders, market);
    const result = settlement(orders, cover.premium, market);
    if (!result) {
      await db.update(covers).set({ orders }).where(eq(covers.id, cover.id));
      continue;
    }

    const evidence = keccak256(toHex(JSON.stringify(market.contracts.map((c) => [c.symbol, c.resolvedYes]))));
    const closeTx = await closeHedge(cover.id as Hex, result.outcome, result.payout, evidence);
    const status = result.outcome === "Paid" ? "paid" : result.outcome === "Refunded" ? "refunded" : "expired";
    await db.update(covers).set({ status, orders, payout: result.payout, closeTx, closedAt: new Date() }).where(eq(covers.id, cover.id));
  }
}
