import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { covers, getDb, odds } from "./db";
import { getMarket, listMarkets } from "./gemini/client";
import type { Contract } from "./gemini/market";
import { easternDate, marketDay } from "./hedge/match";

// A pass writes a row for every contract it watches, so passes are kept this far apart, and what is older
// than the history shown is thrown away.
const EVERY_MS = 5 * 60_000;
const HISTORY_HOURS = 48;
let lastPass = 0;

export async function recordContracts(contracts: Contract[]) {
  const at = new Date();
  const rows = contracts.filter((c) => c.yesBid !== null || c.yesAsk !== null).map((c) => ({ symbol: c.symbol, at, bid: c.yesBid, ask: c.yesAsk }));
  if (rows.length === 0) return;
  const db = await getDb();
  await db.insert(odds).values(rows).onConflictDoNothing();
}

/**
 * Gemini's API has no price history, so Awning keeps its own: a row per contract every few minutes, for every
 * city's temperature market today and on the days to come, the commodity ladders, and any market with cover in force.
 */
export async function recordOdds() {
  if (Date.now() - lastPass < EVERY_MS) return;
  lastPass = Date.now();
  const db = await getDb();
  const [weather, commodities, held] = await Promise.all([
    listMarkets({ status: "active", category: "Weather" }),
    listMarkets({ status: "active", category: "Commodities" }),
    db.selectDistinct({ ticker: covers.marketTicker }).from(covers).where(eq(covers.status, "open")),
  ]);
  const today = easternDate(new Date());
  const watched = [...weather.filter((m) => m.subject.family === "temperature" && marketDay(m) >= today), ...commodities];
  const seen = new Set(watched.map((m) => m.ticker));
  for (const { ticker } of held) {
    const market = seen.has(ticker) ? null : await getMarket(ticker);
    if (market) watched.push(market);
  }
  await recordContracts(watched.flatMap((m) => m.contracts));
  await db.delete(odds).where(lt(odds.at, new Date(Date.now() - HISTORY_HOURS * 3600_000)));
}

/** `cost` is what $1 of a cover cost to buy outright then. `odds` is what the market made the chance of it, read the way a quote reads it. */
export type CostPoint = { at: string; cost: number; odds: number };
type Side = { symbol: string; side: "yes" | "no" };
const hundredths = (n: number) => Math.round(n * 100) / 100;

/**
 * How the price of each of several covers has moved: the sum of its legs' offers, and of their middle
 * prices, pass by pass. All of them are read from the history at once.
 * @param hours how far back to look
 */
export async function costHistories<Key>(wanted: Map<Key, Side[]>, hours = HISTORY_HOURS): Promise<Map<Key, CostPoint[]>> {
  const symbols = [...new Set([...wanted.values()].flatMap((legs) => legs.map((leg) => leg.symbol)))];
  if (symbols.length === 0) return new Map();
  const db = await getDb();
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db
    .select()
    .from(odds)
    .where(and(inArray(odds.symbol, symbols), gt(odds.at, since)))
    .orderBy(asc(odds.at));
  const bySymbol = Map.groupBy(rows, (row) => row.symbol);

  const histories = new Map<Key, CostPoint[]>();
  for (const [key, legs] of wanted) {
    const passes = new Map<string, { offer: number; middle: number }[]>();
    for (const { symbol, side } of legs) {
      for (const row of bySymbol.get(symbol) ?? []) {
        // The other side of a contract is bought from whoever is bidding for this one.
        const [bid, offer] = side === "yes" ? [row.bid, row.ask] : [row.ask === null ? null : 1 - row.ask, row.bid === null ? null : 1 - row.bid];
        if (offer === null) continue;
        const at = row.at.toISOString();
        passes.set(at, [...(passes.get(at) ?? []), { offer, middle: bid === null ? offer : (bid + offer) / 2 }]);
      }
    }
    // A pass where some leg had no offer can't be priced, so it is left out rather than drawn low.
    const points = [...passes]
      .filter(([, prices]) => prices.length === legs.length)
      .map(([at, prices]) => ({
        at,
        cost: hundredths(prices.reduce((sum, p) => sum + p.offer, 0)),
        odds: Math.min(1, hundredths(prices.reduce((sum, p) => sum + p.middle, 0))),
      }));
    histories.set(key, points.sort((a, b) => a.at.localeCompare(b.at)));
  }
  return histories;
}

/** What $1 of this cover has cost to buy outright over time. */
export async function costHistory(legs: Side[]): Promise<CostPoint[]> {
  return (await costHistories(new Map([[0, legs]]))).get(0) ?? [];
}
