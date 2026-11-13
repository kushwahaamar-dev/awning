import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { covers, getDb, odds } from "./db";
import { getMarket, listMarkets } from "./gemini/client";
import type { Contract } from "./gemini/market";

const WATCHED_CITIES = (process.env.AWNING_WATCH_CITIES ?? "Austin").split(",").map((c) => c.trim().toLowerCase());
const HISTORY_HOURS = 48;

export async function recordContracts(contracts: Contract[]) {
  const at = new Date();
  const rows = contracts.filter((c) => c.yesBid !== null || c.yesAsk !== null).map((c) => ({ symbol: c.symbol, at, bid: c.yesBid, ask: c.yesAsk }));
  if (rows.length === 0) return;
  const db = await getDb();
  await db.insert(odds).values(rows).onConflictDoNothing();
}

/**
 * Gemini's API has no price history, so Awning keeps its own: one row per contract per pass for
 * commodity ladders, the watched cities' temperature markets, and any market with cover in force.
 */
export async function recordOdds() {
  const db = await getDb();
  const [weather, commodities, held] = await Promise.all([
    listMarkets({ status: "active", category: "Weather" }),
    listMarkets({ status: "active", category: "Commodities" }),
    db.selectDistinct({ ticker: covers.marketTicker }).from(covers).where(eq(covers.status, "open")),
  ]);
  const watched = [
    ...weather.filter((m) => m.subject.family === "temperature" && WATCHED_CITIES.includes(m.subject.city.toLowerCase())),
    ...commodities,
  ];
  const seen = new Set(watched.map((m) => m.ticker));
  for (const { ticker } of held) {
    const market = seen.has(ticker) ? null : await getMarket(ticker);
    if (market) watched.push(market);
  }
  await recordContracts(watched.flatMap((m) => m.contracts));
}

export type CostPoint = { at: string; cost: number };

/** What $1 of this cover has cost to buy outright over time: the sum of each leg's offer. */
export async function costHistory(legs: { symbol: string; side: "yes" | "no" }[]): Promise<CostPoint[]> {
  const db = await getDb();
  const since = new Date(Date.now() - HISTORY_HOURS * 3600_000);
  const rows = await db
    .select()
    .from(odds)
    .where(and(inArray(odds.symbol, legs.map((l) => l.symbol)), gt(odds.at, since)))
    .orderBy(asc(odds.at));

  const side = new Map(legs.map((l) => [l.symbol, l.side]));
  const passes = new Map<string, number[]>();
  for (const row of rows) {
    const offer = side.get(row.symbol) === "yes" ? row.ask : row.bid === null ? null : 1 - row.bid;
    if (offer === null) continue;
    const at = row.at.toISOString();
    passes.set(at, [...(passes.get(at) ?? []), offer]);
  }
  // A pass where some leg had no offer can't be priced, so it is left out rather than drawn low.
  return [...passes]
    .filter(([, offers]) => offers.length === legs.length)
    .map(([at, offers]) => ({ at, cost: Math.round(offers.reduce((sum, o) => sum + o, 0) * 100) / 100 }));
}
