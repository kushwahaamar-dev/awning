import { bigint, doublePrecision, index, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
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

/** quoted: priced and waiting for the owner. blocked: the mandate refused the premium. */
export type CoverStatus = "quoted" | "open" | "paid" | "expired" | "refunded" | "blocked";

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
