import { and, asc, gt, inArray } from "drizzle-orm";
import { getDb, odds } from "./db";
import { listMarkets } from "./gemini/client";

const WATCHED_CITIES = (process.env.AWNING_WATCH_CITIES ?? "Austin").split(",").map((c) => c.trim().toLowerCase());

/**
 * Gemini's API has no price history, so Awning keeps its own: one row per contract per pass
 * for commodity ladders and the watched cities' temperature markets.
 */
export async function recordOdds() {
  const [weather, commodities] = await Promise.all([
    listMarkets({ status: "active", category: "Weather" }),
    listMarkets({ status: "active", category: "Commodities" }),
  ]);
  const watched = [
    ...weather.filter((m) => m.subject.family === "temperature" && WATCHED_CITIES.includes(m.subject.city.toLowerCase())),
    ...commodities,
  ];

  const at = new Date();
  const rows = watched.flatMap((m) =>
    m.contracts.filter((c) => c.yesBid !== null || c.yesAsk !== null).map((c) => ({ symbol: c.symbol, at, bid: c.yesBid, ask: c.yesAsk })),
  );
  if (rows.length === 0) return;
  const db = await getDb();
  await db.insert(odds).values(rows).onConflictDoNothing();
}

export async function oddsHistory(symbols: string[], sinceHours = 48) {
  const db = await getDb();
  const since = new Date(Date.now() - sinceHours * 3600_000);
  return db.select().from(odds).where(and(inArray(odds.symbol, symbols), gt(odds.at, since))).orderBy(asc(odds.at));
}
