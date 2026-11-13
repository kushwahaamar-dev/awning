import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { closeHedge, hedgeState, openHedge, readAllowance, venueAddress } from "../chain/server";
import { covers, getDb, type Order } from "../db";
import { secondOpinion } from "../desk/second-opinion";
import { getMarket, listMarkets } from "../gemini/client";
import type { Exposure } from "../hedge/exposure";
import { planCover, type CoverPlan } from "../hedge/plan";
import { getVenue } from "../venue";
import { settlement } from "./settlement";

/** A problem the person can do something about; shown to them as-is. */
export class CoverError extends Error {}

// A quote is a price at a moment. Past this it has to be asked for again, or it becomes a free
// option on wherever the market went.
const QUOTE_LIFETIME_SECONDS = 5 * 60;
// How long a cover may sit half-opened before the background pass decides a request died mid-way.
const STALLED_AFTER_MS = 2 * 60 * 1000;

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

export async function quoteCover(input: {
  owner: Address;
  exposure: Exposure;
  coverRatio: number;
  mode: "now" | "resting";
  /** Where this server is reachable, for buying from its own data desk. */
  origin: string;
}): Promise<CoverTerms> {
  const planned = await planCover(input.exposure, listMarkets, {
    coverRatio: input.coverRatio,
    // Reuses the forecast bought for the quote the owner just saw, so the order goes in at the price shown.
    fairValue: async (market) => {
      const opinion = await secondOpinion(input.owner, market, input.origin).catch(() => null);
      return opinion && { ...opinion.forecast, paid: opinion.paid };
    },
  });
  if (!planned) throw new CoverError("Gemini no longer lists a market for this.");
  const { plan } = planned;

  const pricing = input.mode === "now" ? plan.quote.now : plan.quote.resting;
  if (!pricing) throw new CoverError(input.mode === "now" ? "Nobody is selling this right now. Leave an order instead." : "There is no price to anchor an order on yet.");
  if (pricing.total >= plan.quote.payout) {
    throw new CoverError("The market treats this as all but certain, so cover would cost as much as it pays. Try a threshold that is less likely to be hit.");
  }

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
    venue: (await getVenue()).name,
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
    deadline: Math.floor(Date.now() / 1000) + QUOTE_LIFETIME_SECONDS,
    needsApproval: pricing.total > allowance.approvalThreshold,
  };
}

export async function coverOwner(id: Hex): Promise<Address> {
  const db = await getDb();
  const [cover] = await db.select({ owner: covers.owner }).from(covers).where(eq(covers.id, id));
  if (!cover) throw new CoverError("That quote doesn't exist.");
  return cover.owner as Address;
}

/** The agent asks the mandate for the premium, and only places orders if the mandate paid it. */
export async function openCover(id: Hex, approval: { deadline: number; signature: Hex | null }) {
  const db = await getDb();
  // Claiming the quote in one statement means a double click, or two tabs, can only open it once.
  const [cover] = await db.update(covers).set({ status: "opening" }).where(and(eq(covers.id, id), eq(covers.status, "quoted"))).returning();
  if (!cover) throw new CoverError("That quote has already been used.");

  const age = Date.now() - cover.createdAt.getTime();
  if (age > QUOTE_LIFETIME_SECONDS * 1000 || cover.expiresAt.getTime() <= Date.now()) {
    await db.delete(covers).where(eq(covers.id, id));
    throw new CoverError("That price has expired. Ask for a fresh quote.");
  }

  const attempt = await openHedge({
    owner: cover.owner as Address,
    hedgeId: id,
    venue: venueAddress(),
    premium: cover.premium,
    maxPayout: cover.maxPayout,
    marketRef: marketRef(cover.plan),
    deadline: approval.deadline,
    ownerSignature: approval.signature ?? "0x",
  }).catch(async (error) => {
    // A revert moved nothing, so the quote is simply dead. Anything less certain is left for reconcile().
    if ((await hedgeState(id)) === "none") await db.delete(covers).where(eq(covers.id, id));
    throw error;
  });

  if (!attempt.ok) {
    await db.update(covers).set({ status: "blocked", note: attempt.reason, openTx: attempt.txHash, closedAt: new Date() }).where(eq(covers.id, id));
    return { status: "blocked" as const, reason: attempt.reason, txHash: attempt.txHash };
  }

  let orders: Order[];
  try {
    orders = await (await getVenue()).place(cover.orders, cover.mode);
  } catch (error) {
    // The premium has already left the vault, so a venue that can't place the order has to send it back.
    const reason = error instanceof Error ? error.message : String(error);
    const closeTx = await closeHedge(id, "Refunded", cover.premium, keccak256(toHex(reason)));
    await db
      .update(covers)
      .set({ status: "refunded", payout: cover.premium, note: reason, openTx: attempt.txHash, closeTx, closedAt: new Date() })
      .where(eq(covers.id, id));
    throw new CoverError(`The order couldn't be placed, so your premium was returned. ${reason}`);
  }
  await db.update(covers).set({ status: "open", orders, openTx: attempt.txHash }).where(eq(covers.id, id));
  return { status: "open" as const, txHash: attempt.txHash };
}

export async function listCovers(owner: string) {
  const db = await getDb();
  return db
    .select()
    .from(covers)
    .where(and(eq(covers.owner, owner.toLowerCase()), inArray(covers.status, ["opening", "open", "paid", "expired", "refunded", "blocked"])))
    .orderBy(desc(covers.createdAt))
    .limit(50);
}

/**
 * Finishes what an interrupted request left behind: a cover claimed for opening whose request never
 * completed. If the premium reached the venue it is sent back; if it never left, the quote is dropped.
 */
async function reconcile() {
  const db = await getDb();
  const stalled = await db
    .select()
    .from(covers)
    .where(and(eq(covers.status, "opening"), lt(covers.createdAt, new Date(Date.now() - QUOTE_LIFETIME_SECONDS * 1000 - STALLED_AFTER_MS))));

  // Quotes nobody took are just clutter after a while.
  await db.delete(covers).where(and(eq(covers.status, "quoted"), lt(covers.createdAt, new Date(Date.now() - 3600_000))));

  for (const cover of stalled) {
    const id = cover.id as Hex;
    const state = await hedgeState(id);
    if (state === "none") {
      await db.delete(covers).where(eq(covers.id, id));
      continue;
    }
    const note = "The request was interrupted before an order was placed, so the premium was returned.";
    const closeTx = state === "open" ? await closeHedge(id, "Refunded", cover.premium, keccak256(toHex(note))) : null;
    await db.update(covers).set({ status: "refunded", payout: cover.premium, note, closeTx, closedAt: new Date() }).where(eq(covers.id, id));
  }
}

/** Checks every open cover against Gemini: updates fills, and pays out or closes the ones that have resolved. */
export async function settleOpenCovers() {
  await reconcile().catch((error) => console.error("could not reconcile stalled covers", error));
  const db = await getDb();
  const open = await db.select().from(covers).where(eq(covers.status, "open"));

  for (const cover of open) {
    // One cover that can't be checked right now must not hold up the others.
    await settle(cover).catch((error) => console.error(`could not settle cover ${cover.id}`, error));
  }
}

async function settle(cover: typeof covers.$inferSelect) {
  const db = await getDb();
  const market = await getMarket(cover.marketTicker);
  if (!market) return;

  const orders = await (await getVenue()).refresh(cover.orders, market);
  const result = settlement(orders, cover.premium, market);
  if (!result) {
    await db.update(covers).set({ orders }).where(eq(covers.id, cover.id));
    return;
  }

  // If an earlier pass closed the hedge but died before recording it, the chain is the record to follow.
  const state = await hedgeState(cover.id as Hex);
  if (state !== "open") {
    if (state !== "none") await db.update(covers).set({ status: state, orders, payout: result.payout, closedAt: new Date() }).where(eq(covers.id, cover.id));
    return;
  }

  const evidence = keccak256(toHex(JSON.stringify(market.contracts.map((c) => [c.symbol, c.resolvedYes]))));
  const closeTx = await closeHedge(cover.id as Hex, result.outcome, result.payout, evidence);
  const status = result.outcome === "Paid" ? "paid" : result.outcome === "Refunded" ? "refunded" : "expired";
  await db.update(covers).set({ status, orders, payout: result.payout, closeTx, closedAt: new Date() }).where(eq(covers.id, cover.id));
}
