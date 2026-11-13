import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { poolAddress } from "../chain/config";
import { PoolFull, coverTaken, hedgeState, lapseOffer, offerCover, offerState, openHedge, readAllowance, rejectPremium, settleCover } from "../chain/server";
import { covers, getDb, type Order } from "../db";
import { secondOpinion } from "../desk/second-opinion";
import { getMarket, listMarkets } from "../gemini/client";
import type { Exposure } from "../hedge/exposure";
import { planCover, type CoverPlan } from "../hedge/plan";
import { offerPrice } from "../hedge/quote";
import { getVenue } from "../venue";
import { resolution } from "./settlement";

/** A problem the person can do something about; shown to them as-is. */
export class CoverError extends Error {}

// A quote is a price at a moment. Past this it has to be asked for again, or it becomes a free
// option on wherever the market went. The pool's offer lapses at the same moment.
const QUOTE_LIFETIME_SECONDS = 5 * 60;
// How long after an offer's deadline the background pass waits before tidying up, so a request
// still in flight, or a clock a few seconds out, isn't cut across.
const SETTLE_DOWN_MS = 60 * 1000;
// If no result has been reported this long after the market closes, the owner can claim the payout.
const RESOLVE_GRACE_SECONDS = 3 * 24 * 3600;

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

/** Prices a cover and has the pool offer it, which locks the payout before the owner pays anything. */
export async function quoteCover(input: {
  owner: Address;
  exposure: Exposure;
  coverRatio: number;
  /** Where this server is reachable, for buying from its own data desk. */
  origin: string;
}): Promise<CoverTerms> {
  const planned = await planCover(input.exposure, listMarkets, {
    coverRatio: input.coverRatio,
    // Reuses the forecast bought for the quote the owner just saw, so the offer is at the price shown.
    fairValue: async (market) => {
      const opinion = await secondOpinion(input.owner, market, input.origin).catch(() => null);
      return opinion && { ...opinion.forecast, paid: opinion.paid };
    },
  });
  if (!planned) throw new CoverError("Gemini no longer lists a market for this.");
  const { plan } = planned;

  const price = offerPrice(plan.quote);
  if (!price) throw new CoverError("Nobody is quoting this market right now, so there is no price to offer.");
  const { pricing, mode } = price;
  if (pricing.total >= plan.quote.payout) {
    throw new CoverError("The market treats this as all but certain, so cover would cost as much as it pays. Try a threshold that is less likely to be hit.");
  }

  const allowance = await readAllowance(input.owner);
  const terms: CoverTerms = {
    id: toHex(crypto.getRandomValues(new Uint8Array(32))),
    venue: poolAddress,
    premium: pricing.total,
    maxPayout: plan.quote.payout,
    marketRef: marketRef(plan),
    deadline: Math.floor(Date.now() / 1000) + QUOTE_LIFETIME_SECONDS,
    needsApproval: pricing.total > allowance.approvalThreshold,
  };

  // The row goes in first, so an offer can never be locked onchain with nothing here to release it.
  const db = await getDb();
  await db.insert(covers).values({
    id: terms.id,
    owner: input.owner.toLowerCase(),
    status: "quoted",
    plan,
    mode,
    venue: (await getVenue()).name,
    premium: terms.premium,
    maxPayout: terms.maxPayout,
    // What the pool will buy on Gemini to lay off the risk it is about to take on.
    orders: plan.coverage.legs.map((leg, i) => ({ symbol: leg.symbol, side: leg.side, price: pricing.prices[i], quantity: plan.quote.contracts, id: null, filled: 0 })),
    marketTicker: plan.market.ticker,
    expiresAt: new Date(plan.market.expiresAt),
  });

  try {
    await offerCover({
      hedgeId: terms.id,
      owner: input.owner,
      premium: terms.premium,
      payout: terms.maxPayout,
      marketRef: terms.marketRef,
      takeBy: terms.deadline,
      resolveBy: Math.floor(new Date(plan.market.expiresAt).getTime() / 1000) + RESOLVE_GRACE_SECONDS,
    });
  } catch (error) {
    if (!(error instanceof PoolFull)) throw error;
    // The pool said no before anything was sent, so there is nothing onchain to tidy.
    await db.delete(covers).where(eq(covers.id, terms.id));
    throw new CoverError("The pool can't back a payout that large on this market right now. Cover less of the loss.");
  }
  return terms;
}

export async function coverOwner(id: Hex): Promise<Address> {
  const db = await getDb();
  const [cover] = await db.select({ owner: covers.owner }).from(covers).where(eq(covers.id, id));
  if (!cover) throw new CoverError("That quote doesn't exist.");
  return cover.owner as Address;
}

/** The agent asks the mandate for the premium. If the mandate pays it, the cover is in force. */
export async function openCover(id: Hex, approval: { deadline: number; signature: Hex | null }) {
  const db = await getDb();
  // Claiming the quote in one statement means a double click, or two tabs, can only open it once.
  const [cover] = await db.update(covers).set({ status: "opening" }).where(and(eq(covers.id, id), eq(covers.status, "quoted"))).returning();
  if (!cover) throw new CoverError("That quote has already been used.");

  // Anything that stops here hands the row back as a plain quote, and reconcile() unlocks its offer.
  const release = () => db.update(covers).set({ status: "quoted" }).where(eq(covers.id, id));

  const age = Date.now() - cover.createdAt.getTime();
  if (age > QUOTE_LIFETIME_SECONDS * 1000 || cover.expiresAt.getTime() <= Date.now()) {
    await release();
    throw new CoverError("That price has expired. Ask for a fresh quote.");
  }

  const owner = cover.owner as Address;
  const attempt = await openHedge({
    owner,
    hedgeId: id,
    venue: poolAddress,
    premium: cover.premium,
    maxPayout: cover.maxPayout,
    marketRef: marketRef(cover.plan),
    deadline: approval.deadline,
    ownerSignature: approval.signature ?? "0x",
  }).catch(async (error) => {
    // A revert moved nothing, so this is a plain quote again. Anything less certain stays claimed
    // for reconcile(), which reads the chain to see what really happened.
    if ((await hedgeState(owner, id)) === "none") await release();
    throw error;
  });

  if (!attempt.ok) {
    await db.update(covers).set({ status: "blocked", note: attempt.reason, openTx: attempt.txHash, closedAt: new Date() }).where(eq(covers.id, id));
    return { status: "blocked" as const, reason: attempt.reason, txHash: attempt.txHash };
  }

  // The premium is only worth paying if it met a live offer. One that lapsed a moment earlier gets it sent straight back.
  if (!(await coverTaken(id))) {
    const closeTx = await rejectPremium(owner, id);
    await db
      .update(covers)
      .set({ status: "refunded", payout: cover.premium, offerOpen: false, openTx: attempt.txHash, closeTx, closedAt: new Date() })
      .where(eq(covers.id, id));
    throw new CoverError("That price expired as you bought it, so your premium was returned. Ask for a fresh quote.");
  }

  // From here the cover is in force: the payout is locked in the pool whatever happens next.
  await db.update(covers).set({ status: "open", openTx: attempt.txHash }).where(eq(covers.id, id));
  await layOff(cover);
  return { status: "open" as const, txHash: attempt.txHash };
}

/**
 * The pool buys the same position on Gemini so it isn't carrying the risk alone. This is the pool's
 * own business: if the order can't be placed the pool is simply unhedged, and the owner's cover stands.
 */
async function layOff(cover: typeof covers.$inferSelect) {
  const db = await getDb();
  try {
    const orders = await (await getVenue()).place(cover.orders, cover.mode);
    await db.update(covers).set({ orders }).where(eq(covers.id, cover.id));
  } catch (error) {
    console.error(`could not lay off cover ${cover.id} on Gemini`, error);
  }
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
 * Tidies up after quotes that went nowhere and requests that died mid-way. The chain is the record:
 * each row is resolved by what the pool and the mandate say about it, and a row only stops being
 * looked at once the pool's offer is closed, so a failed attempt is simply tried again next pass.
 */
async function reconcile() {
  const db = await getDb();
  const due = await db
    .select()
    .from(covers)
    .where(
      and(
        eq(covers.offerOpen, true),
        inArray(covers.status, ["quoted", "opening", "blocked"]),
        lt(covers.createdAt, new Date(Date.now() - QUOTE_LIFETIME_SECONDS * 1000 - SETTLE_DOWN_MS)),
      ),
    );

  for (const cover of due) {
    // One row that can't be dealt with right now must not hold up the others.
    await tidy(cover).catch((error) => console.error(`could not reconcile cover ${cover.id}`, error));
  }
}

async function tidy(cover: typeof covers.$inferSelect) {
  const db = await getDb();
  const id = cover.id as Hex;
  const owner = cover.owner as Address;
  const row = eq(covers.id, id);

  if ((await offerState(id)) === "live") {
    if (await coverTaken(id)) {
      // The premium was paid in time and the request died before saying so. The cover has been in force all along.
      await db.update(covers).set({ status: "open" }).where(row);
      await layOff(cover);
      return;
    }
    if ((await hedgeState(owner, id)) === "open") {
      // Paid, but too late or on other terms, so it bought nothing. It goes back.
      const closeTx = await rejectPremium(owner, id);
      await db.update(covers).set({ status: "refunded", payout: cover.premium, offerOpen: false, closeTx, closedAt: new Date() }).where(row);
      return;
    }
    await lapseOffer(id);
  }

  // The offer is closed (or was never made), so nothing is locked for this row any more.
  if (cover.status === "blocked") await db.update(covers).set({ offerOpen: false }).where(row);
  else await db.delete(covers).where(row);
}

/** Checks every open cover against Gemini, and has the pool pay or close the ones that have resolved. */
export async function settleOpenCovers() {
  await reconcile().catch((error) => console.error("could not reconcile covers", error));
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

  // Keeps the record of the pool's own hedge up to date; it has no bearing on what the owner is paid.
  const orders: Order[] = await (await getVenue()).refresh(cover.orders, market);
  const result = resolution(orders, market);
  if (!result) {
    await db.update(covers).set({ orders }).where(eq(covers.id, cover.id));
    return;
  }
  const payout = result === "happened" ? cover.maxPayout : 0;

  // If an earlier pass settled the cover but died before recording it, the chain is the record to follow.
  const state = await hedgeState(cover.owner as Address, cover.id as Hex);
  if (state !== "open") {
    if (state !== "none") await db.update(covers).set({ status: state, orders, payout, offerOpen: false, closedAt: new Date() }).where(eq(covers.id, cover.id));
    return;
  }

  // What Gemini resolved, so anyone can check the pool's report against Gemini's public record.
  const evidence = keccak256(toHex(JSON.stringify(market.contracts.map((c) => [c.symbol, c.resolvedYes]))));
  const closeTx = await settleCover(cover.id as Hex, result === "happened", evidence);
  await db
    .update(covers)
    .set({ status: result === "happened" ? "paid" : "expired", orders, payout, offerOpen: false, closeTx, closedAt: new Date() })
    .where(eq(covers.id, cover.id));
}
