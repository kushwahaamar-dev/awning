import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Address } from "viem";
import { readAllowance } from "../chain/server";
import { CoverError, openCover, quoteCover } from "../covers/service";
import { decisions, getDb, standing, type DecisionFacts, type DecisionKind } from "../db";
import { secondOpinion } from "../desk/second-opinion";
import { cents, usd } from "../format";
import { listMarkets } from "../gemini/client";
import type { Exposure } from "../hedge/exposure";
import { easternDate, marketDay } from "../hedge/match";
import { planCover } from "../hedge/plan";
import { offerPrice } from "../hedge/quote";
import { REFUSAL } from "../words";
import { decide } from "./decide";

type Order = typeof standing.$inferSelect;

const DAY_MS = 24 * 3600 * 1000;

/** Leaves a risk with the agent to cover every day, and has it deal with the days already listed. */
export async function createStanding(input: { owner: Address; exposure: Exposure; coverRatio: number; dailyCap: number; instruction: string | null }, origin: string) {
  if (input.exposure.trigger.family !== "temperature") {
    throw new CoverError("Standing cover is for risks with a market every day, which today means daily temperatures.");
  }
  const db = await getDb();
  const [order] = await db
    .insert(standing)
    .values({ ...input, owner: input.owner.toLowerCase(), instruction: input.instruction?.trim() || null })
    .returning();
  await work(order, origin);
  return order;
}

export async function stopStanding(owner: Address, id: number) {
  const db = await getDb();
  await db.update(standing).set({ active: false }).where(and(eq(standing.id, id), eq(standing.owner, owner.toLowerCase())));
}

/** An owner's standing orders, each with what the agent has done about it lately. */
export async function listStanding(owner: string) {
  const db = await getDb();
  const orders = await db.select().from(standing).where(and(eq(standing.owner, owner.toLowerCase()), eq(standing.active, true))).orderBy(desc(standing.id));
  if (orders.length === 0) return [];
  const log = await db
    .select()
    .from(decisions)
    .where(and(inArray(decisions.standingId, orders.map((o) => o.id)), ne(decisions.kind, "deciding")))
    .orderBy(desc(decisions.day), desc(decisions.id))
    .limit(60);
  return orders.map((order) => ({ ...order, decisions: log.filter((d) => d.standingId === order.id) }));
}

/** The background pass: every active order gets a look, and one that can't be dealt with now waits for the next. */
export async function runStanding(origin: string) {
  const db = await getDb();
  for (const order of await db.select().from(standing).where(eq(standing.active, true))) {
    await work(order, origin).catch((error) => console.error(`standing order ${order.id} could not run`, error));
  }
}

async function work(order: Order, origin: string) {
  // Today's market and tomorrow's: close enough for the forecast to mean something.
  for (const day of [easternDate(new Date()), easternDate(new Date(Date.now() + DAY_MS))]) {
    await considerDay(order, day, origin);
  }
}

const NOTHING: DecisionFacts = { pays: "", payout: 0, premium: 0, marketOdds: null, forecastOdds: null };

/**
 * Decides one day of one order, at most once. The day is claimed in the database before anything
 * else happens, and the unique index on (order, day) is the lock: a second pass, another process,
 * or a restart finds the claim and leaves the day alone. A claim is only given back when nothing
 * can have been bought, so the worst a crash can do is skip a day, never buy it twice.
 */
async function considerDay(order: Order, day: string, origin: string) {
  const db = await getDb();
  const [claim] = await db
    .insert(decisions)
    .values({ standingId: order.id, owner: order.owner, day, kind: "deciding", reason: "", facts: NOTHING })
    .onConflictDoNothing()
    .returning({ id: decisions.id });
  if (!claim) return;

  const mine = eq(decisions.id, claim.id);
  let facts = NOTHING;
  const giveBack = async () => {
    await db.delete(decisions).where(mine);
  };
  const record = async (kind: DecisionKind, reason: string, coverId: string | null = null) => {
    await db.update(decisions).set({ kind, reason, facts, coverId, at: new Date() }).where(mine);
  };

  const owner = order.owner as Address;
  const exposure = { ...order.exposure, on: day };
  let terms;
  let verdict;
  try {
    const planned = await planCover(exposure, listMarkets, {
      coverRatio: order.coverRatio,
      // The agent pays for this itself, out of the owner's daily data allowance.
      fairValue: async (market) => {
        const opinion = await secondOpinion(owner, market, origin).catch(() => null);
        return opinion && { ...opinion.forecast, paid: opinion.paid };
      },
    });
    const offer = planned && marketDay(planned.market) === day ? offerPrice(planned.plan.quote) : null;
    // Not listed yet, already closed, or nobody quoting. There is nothing to decide; look again next pass.
    if (!planned || !offer) return giveBack();
    const { plan } = planned;

    facts = {
      pays: plan.coverage.pays,
      payout: plan.quote.payout,
      premium: offer.pricing.total,
      marketOdds: plan.quote.marketOdds,
      forecastOdds: plan.forecast?.odds ?? null,
    };

    // Limits the agent can check for itself come before asking the model anything.
    const { approvalThreshold } = await readAllowance(owner);
    if (facts.premium >= facts.payout) return record("skipped", `Cover costs ${cents(facts.premium)} for a ${usd(facts.payout)} payout, so there was nothing left to protect. I left it.`);
    if (facts.premium > order.dailyCap) return record("skipped", `Cover costs ${cents(facts.premium)}, over the ${usd(order.dailyCap)} a day you set. I left it.`);
    if (facts.premium > approvalThreshold) {
      return record("skipped", `Cover costs ${cents(facts.premium)}, above the ${usd(approvalThreshold)} I may spend without asking you. I left it; buy it yourself from the Cover page if you want it.`);
    }

    verdict = await decide({ risk: order.exposure.summary, day, instruction: order.instruction, dailyCap: order.dailyCap, facts });
    if (verdict.decision === "skip") return record("skipped", verdict.reason);

    terms = await quoteCover({ owner, exposure, coverRatio: order.coverRatio, origin });
  } catch (error) {
    // The pool or the market turning the cover down is an answer for the day. Anything else
    // (the model or Gemini being unreachable) is worth another try.
    if (error instanceof CoverError) return record("skipped", `I decided to buy, but couldn’t: ${error.message}`);
    await giveBack();
    throw error;
  }

  // The price can move between deciding and buying. If it moved past a limit, the decision no longer holds.
  if (terms.premium > order.dailyCap || terms.needsApproval) {
    return record("skipped", `The price moved to ${cents(terms.premium)} as I went to buy, past what I may spend on my own. I left it.`);
  }

  // Past this line money may move, so the claim is never given back, whatever goes wrong.
  try {
    const result = await openCover(terms.id, { deadline: terms.deadline, signature: null });
    if (result.status === "blocked") return record("refused", `I tried to buy it for ${cents(terms.premium)}, but your allowance refused: ${REFUSAL[result.reason]}.`, terms.id);
    await record("bought", verdict.reason, terms.id);
  } catch (error) {
    await record("skipped", `Something went wrong as I was buying, so I stopped for the day rather than risk buying twice. ${error instanceof CoverError ? error.message : "Check Your cover to see whether it went through."}`, terms.id);
    if (!(error instanceof CoverError)) throw error;
  }
}
