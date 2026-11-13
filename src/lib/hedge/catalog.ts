import type { MarketSource } from "./match";

export type Catalog = {
  cities: string[];
  assets: { code: string; name: string }[];
};

const TTL_MS = 10 * 60 * 1000;
let cached: { at: number; catalog: Catalog } | null = null;

/** What Gemini currently lists that a risk can be matched to. Games are found by search, so they aren't enumerated. */
export async function getCatalog(list: MarketSource): Promise<Catalog> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.catalog;

  const [weather, commodities, crypto] = await Promise.all([
    list({ status: "active", category: "Weather" }),
    list({ status: "active", category: "Commodities" }),
    list({ status: "active", category: "Crypto" }),
  ]);

  const cities = new Set<string>();
  for (const m of weather) if (m.subject.family === "temperature") cities.add(m.subject.city);

  const assets = new Map<string, string>();
  for (const m of [...commodities, ...crypto]) if (m.subject.family === "price") assets.set(m.subject.asset, m.subject.name);

  const catalog = {
    cities: [...cities].sort(),
    assets: [...assets].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code)),
  };
  cached = { at: Date.now(), catalog };
  return catalog;
}
