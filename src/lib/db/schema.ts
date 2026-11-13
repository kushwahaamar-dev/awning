import { bigint, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Exposure } from "../hedge/exposure";
import type { CoverPlan } from "../hedge/plan";

export type Order = {
  symbol: string;
  side: "yes" | "no";
  price: number;
  quantity: number;
  /** Venue order id, once placed. */
  id: string | null;
  filled: number;
};

/**
 * quoted: priced and waiting for the owner. opening: claimed by one request, premium being paid.
 * blocked: the mandate refused the premium.
 */
export type CoverStatus = "quoted" | "opening" | "open" | "paid" | "expired" | "refunded" | "blocked";

export const covers = pgTable(
  "covers",
  {
    /** The bytes32 hedge id used onchain. */
    id: text().primaryKey(),
    owner: text().notNull(),
    status: text().$type<CoverStatus>().notNull(),
    plan: jsonb().$type<CoverPlan>().notNull(),
    mode: text().$type<"now" | "resting">().notNull(),
    venue: text().notNull(),
    premium: doublePrecision().notNull(),
    maxPayout: doublePrecision().notNull(),
    payout: doublePrecision(),
    orders: jsonb().$type<Order[]>().notNull(),
    marketTicker: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    openTx: text(),
    closeTx: text(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.owner), index().on(t.status)],
);

export const ledger = pgTable(
  "ledger",
  {
    /** txHash:logIndex, so replayed deliveries are idempotent. */
    id: text().primaryKey(),
    owner: text().notNull(),
    kind: text().notNull(),
    args: jsonb().$type<Record<string, string | number | boolean>>().notNull(),
    blockNumber: bigint({ mode: "number" }).notNull(),
    txHash: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.owner, t.blockNumber)],
);

export const odds = pgTable(
  "odds",
  {
    symbol: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    bid: doublePrecision(),
    ask: doublePrecision(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.at] })],
);

/** Risks people asked about that no listed market tracks. */
export const gaps = pgTable("gaps", {
  id: serial().primaryKey(),
  wanted: text().notNull(),
  sentence: text().notNull(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** A risk the owner wants covered every day it can be, left with the agent to look after. */
export const standing = pgTable(
  "standing",
  {
    id: serial().primaryKey(),
    owner: text().notNull(),
    exposure: jsonb().$type<Exposure>().notNull(),
    coverRatio: doublePrecision().notNull(),
    /** Most the agent may pay for one day's cover. */
    dailyCap: doublePrecision().notNull(),
    /** The owner's own words on when to buy and when not to. */
    instruction: text(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.owner)],
);

/** What the agent saw when it decided. Kept so the owner can check its reasoning against the numbers. */
export type DecisionFacts = {
  pays: string;
  payout: number;
  premium: number;
  marketOdds: number | null;
  forecastOdds: number | null;
};

/** refused: the agent chose to buy and the mandate said no. */
export type DecisionKind = "bought" | "skipped" | "refused";

/** One day of one standing order: what the agent did about it, and why, in its own words. */
export const decisions = pgTable(
  "decisions",
  {
    id: serial().primaryKey(),
    standingId: integer().notNull(),
    owner: text().notNull(),
    /** The market day this is about, YYYY-MM-DD. */
    day: text().notNull(),
    kind: text().$type<DecisionKind>().notNull(),
    reason: text().notNull(),
    facts: jsonb().$type<DecisionFacts>().notNull(),
    coverId: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.standingId, t.day), index().on(t.owner)],
);
