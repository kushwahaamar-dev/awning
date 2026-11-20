import type { Market } from "../gemini/market";
import type { Exposure } from "./exposure";

export type MarketSource = (query: { status: "active"; category?: string; search?: string; limit?: number }) => Promise<Market[]>;

export const soonest = (a: Market, b: Market) => a.expiresAt.localeCompare(b.expiresAt);

const easternDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day a market is about, as Gemini lists it: an 8pm Eastern kickoff belongs to that evening, not the next UTC day. */
export function marketDay(market: Pick<Market, "subject" | "startsAt" | "expiresAt">): string {
  if (market.subject.family === "temperature" && market.subject.day) return market.subject.day;
  return easternDay.format(new Date(market.startsAt ?? market.expiresAt));
}

/** The calendar day it is, or will be, on the US east coast, where Gemini dates its markets. */
export const easternDate = (at: Date) => easternDay.format(at);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Finds the listed market that settles on the thing the user is exposed to, or null if Gemini has none. */
export async function findMarket(exposure: Exposure, list: MarketSource, now = new Date()): Promise<Market | null> {
  const { trigger, on } = exposure;

  if (trigger.family === "temperature") {
    const markets = (await list({ status: "active", category: "Weather" }))
      .filter((m) => m.subject.family === "temperature" && (same(m.subject.city, trigger.city) || same(m.subject.cityCode, trigger.city)))
      .sort(soonest);
    // With no day named, cover the next full day: by the time anyone asks, today's high is mostly decided.
    const today = easternDate(now);
    return markets.find((m) => marketDay(m) === on) ?? markets.find((m) => marketDay(m) > today) ?? markets[0] ?? null;
  }

  if (trigger.family === "price") {
    const [commodities, crypto] = await Promise.all([
      list({ status: "active", category: "Commodities" }),
      list({ status: "active", category: "Crypto" }),
    ]);
    const markets = [...commodities, ...crypto]
      .filter((m) => m.subject.family === "price" && same(m.subject.asset, trigger.asset))
      .sort(soonest);
    // Crypto lists a new ladder every hour; take the first one that outlives the requested date.
    return markets.find((m) => !on || marketDay(m) >= on) ?? markets.at(-1) ?? null;
  }

  const wanted = trigger.team.toLowerCase();
  const rank = (m: Market) => {
    if (m.contracts.some((c) => same(c.label, wanted))) return 0;
    if (m.subject.family === "game" && m.subject.teams.some((t) => same(t.name, wanted) || same(t.abbreviation, wanted) || t.name.toLowerCase().startsWith(`${wanted} `))) return 1;
    return 2;
  };
  const games = (await list({ status: "active", search: trigger.team, limit: 50 }))
    .filter(
      (m) =>
        m.subject.family === "game" &&
        m.subject.teams.some((t) => t.name.toLowerCase().includes(wanted) || same(t.abbreviation, wanted)),
    )
    .sort((a, b) => rank(a) - rank(b) || (a.startsAt ?? a.expiresAt).localeCompare(b.startsAt ?? b.expiresAt));
  return games.find((m) => !on || marketDay(m) >= on) ?? games[0] ?? null;
}
