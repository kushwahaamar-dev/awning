import { eq } from "drizzle-orm";
import { getDb, listings } from "../db";
import type { MarketSource } from "../hedge/match";
import { listMarkets } from "./client";
import type { Market } from "./market";

// A listing is large and only wanted for the hour Gemini goes quiet, so it is written down this often and no more.
const KEEP_EVERY_MS = 5 * 60_000;
const keptAt = new Map<string, number>();
const due = (query: string) => Date.now() - (keptAt.get(query) ?? 0) >= KEEP_EVERY_MS;
// What reading a sentence and pricing it ask Gemini for.
const CATEGORIES = ["Weather", "Commodities", "Crypto"];

async function keep(query: string, markets: Market[]) {
  if (!due(query)) return;
  keptAt.set(query, Date.now());
  const db = await getDb();
  const at = new Date();
  await db.insert(listings).values({ query, markets, at }).onConflictDoUpdate({ target: listings.query, set: { markets, at } });
}

/**
 * A way of reading Gemini's listings, for one request, that survives Gemini going quiet. Each listing is
 * asked for as usual and written down; when Gemini fails, the one it last gave is used in its place.
 * `since()` says when the oldest listing used was taken, or null when every one of them was fresh.
 *
 * For showing prices only. Nothing is sold, decided by the agent or settled on a listing that may be old:
 * those read Gemini itself, and fail when it does.
 */
export function lastGoodMarkets(): { list: MarketSource; since: () => string | null } {
  let oldest: string | null = null;
  const list: MarketSource = async (query) => {
    const key = JSON.stringify(query);
    try {
      const markets = await listMarkets(query);
      // Keeping a copy must never cost the answer it is a copy of.
      await keep(key, markets).catch((error) => console.error("could not keep a listing", error));
      return markets;
    } catch (failure) {
      const [last] = await (await getDb()).select().from(listings).where(eq(listings.query, key));
      if (!last) throw failure;
      const at = last.at.toISOString();
      if (!oldest || at < oldest) oldest = at;
      return last.markets;
    }
  };
  return { list, since: () => oldest };
}

/**
 * Writes down what Gemini lists now. Part of the background pass, so there is something to go back to
 * however quiet the site has been, and whatever its visitors happened to ask for.
 */
export async function keepListings() {
  const { list } = lastGoodMarkets();
  const queries = CATEGORIES.map((category) => ({ status: "active" as const, category })).filter((query) => due(JSON.stringify(query)));
  await Promise.all(queries.map((query) => list(query)));
}
