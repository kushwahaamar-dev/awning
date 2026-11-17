import { usd } from "../format";
import type { Market } from "../gemini/market";
import type { Exposure, Trigger } from "./exposure";
import { buildCoverage } from "./legs";
import { easternDate, marketDay, soonest, type MarketSource } from "./match";
import { quoteCover } from "./quote";

/** A risk that Gemini is pricing sensibly right now, said the way an owner would say it. */
export type Example = {
  kind: string;
  text: string;
  exposure: Exposure;
  /** Completes "Pays if …". */
  pays: string;
  day: string;
  payout: number;
  cost: number;
  odds: number | null;
};

// Cover is worth showing when the bad day is unlikely but real, so it costs a small share of what it pays.
const CHEAPEST = 0.04;
const DEAREST = 0.3;
const IDEAL = 0.12;

type Wording = { kind: string; loss: number; say: (subject: string, level: number, when: string, loss: string) => { text: string; summary: string } };

const COLD: Wording = {
  kind: "Cold snap",
  loss: 300,
  say: (city, t, when, loss) => ({
    text: `If ${city}’s high ${when} is ${t}°F or below, my patio is out about ${loss}.`,
    summary: `You lose about ${loss} on your patio if ${city}’s high ${when} is ${t}°F or below.`,
  }),
};
const WARM: Wording = {
  kind: "Warm day",
  loss: 400,
  say: (city, t, when, loss) => ({
    text: `If ${city}’s high ${when} is ${t}°F or above, my soup counter sells about ${loss} less.`,
    summary: `Your soup counter sells about ${loss} less if ${city}’s high ${when} is ${t}°F or above.`,
  }),
};
const FUEL: Wording = {
  kind: "Fuel",
  loss: 1500,
  say: (_, price, when, loss) => ({
    text: `If oil is at ${usd(price)} a barrel or more ${when}, my delivery vans cost me about ${loss} more.`,
    summary: `Your delivery vans cost you about ${loss} more if oil is at ${usd(price)} a barrel or more ${when}.`,
  }),
};

// A pool on a test network can be small. An example is no use if the pool can't back it, so its
// size comes down to a round figure the pool can lock.
const ROUND = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const sized = (usual: number, budget: number) => (budget >= usual ? usual : (ROUND.find((n) => n <= budget * 0.9) ?? 1));

type Scored = Example & { share: number; subject: string };

type Range = readonly [cheapest: number, dearest: number];
const WORTH_SHOWING: Range = [CHEAPEST, DEAREST];
// The map shows every city it can put a fair price on, so it takes likelier and rarer days than an example would.
const WORTH_MAPPING: Range = [0.02, 0.6];

function candidate(market: Market, trigger: Trigger, wording: Wording, subject: string, when: string, budget: number, [cheapest, dearest] = WORTH_SHOWING): Scored | null {
  const coverage = buildCoverage(market, trigger);
  // An example has to read the same in the quote as it does in the sentence, so the level must be one the market lists.
  if (!coverage || coverage.legs.length === 0 || coverage.snappedTo !== null || trigger.family === "game") return null;
  const loss = sized(wording.loss, budget);
  const quote = quoteCover(coverage, loss);
  // Someone has to be selling right now, or the example ends in "nobody is quoting this".
  if (!quote.now) return null;
  const share = quote.now.total / quote.payout;
  if (share < cheapest || share > dearest) return null;

  const day = marketDay(market);
  const { text, summary } = wording.say(subject, trigger.threshold, when, usd(loss));
  return {
    kind: wording.kind,
    text,
    exposure: { summary, trigger, lossUsd: loss, on: day, recurring: false, proxyNote: null },
    pays: coverage.pays,
    day,
    payout: quote.payout,
    cost: quote.now.total,
    odds: quote.marketOdds,
    share,
    subject,
  };
}

const closest = (a: Scored, b: Scored) => Math.abs(a.share - IDEAL) - Math.abs(b.share - IDEAL);
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

/** Every risk on a day still to come that Gemini is selling at a sensible price right now, by kind. */
async function scan(list: MarketSource, now: Date, budget: number, range = WORTH_SHOWING) {
  const [weather, commodities] = await Promise.all([list({ status: "active", category: "Weather" }), list({ status: "active", category: "Commodities" })]);
  const today = easternDate(now);
  const tomorrow = easternDate(new Date(now.getTime() + 86_400_000));
  const when = (day: string) => (day === tomorrow ? "tomorrow" : `on ${weekday(day)}`);

  // Each city's next full day.
  const next = new Map<string, Market>();
  for (const market of [...weather].sort(soonest)) {
    if (market.subject.family === "temperature" && marketDay(market) > today && !next.has(market.subject.city)) next.set(market.subject.city, market);
  }

  const cold: Scored[] = [];
  const warm: Scored[] = [];
  for (const [city, market] of next) {
    for (const { outcome } of market.contracts) {
      if (outcome.kind !== "range") continue;
      const day = when(marketDay(market));
      if (outcome.hi !== null) {
        const found = candidate(market, { family: "temperature", city, direction: "below", threshold: outcome.hi }, COLD, city, day, budget, range);
        if (found) cold.push(found);
      }
      if (outcome.lo !== null) {
        const found = candidate(market, { family: "temperature", city, direction: "above", threshold: outcome.lo }, WARM, city, day, budget, range);
        if (found) warm.push(found);
      }
    }
  }

  const fuel: Scored[] = [];
  const oil = [...commodities].sort(soonest).find((m) => m.subject.family === "price" && m.subject.asset === "WTI" && marketDay(m) > today);
  for (const { outcome } of oil?.contracts ?? []) {
    if (outcome.kind !== "range" || outcome.lo === null) continue;
    const found = candidate(oil!, { family: "price", asset: "WTI", direction: "above", threshold: outcome.lo }, FUEL, "oil", when(marketDay(oil!)), budget);
    if (found) fuel.push(found);
  }
  const cities = [...next].map(([city, market]) => ({ city, code: market.subject.family === "temperature" ? market.subject.cityCode : city }));
  return { cold: cold.sort(closest), warm: warm.sort(closest), fuel: fuel.sort(closest), cities };
}

/** One city on the map: where Gemini lists tomorrow's high, and the most telling cover there, if any is priced sensibly. */
export type CityPrice = { city: string; code: string; example: Example | null };

/** Every city with a market for its next full day, each with the cover closest to a one-in-eight day. */
export async function cityPrices(list: MarketSource, now = new Date(), budget = Infinity): Promise<CityPrice[]> {
  const { cold, warm, cities } = await scan(list, now, budget, WORTH_MAPPING);
  const ranked = [...cold, ...warm].sort(closest);
  return cities.map(({ city, code }) => {
    const best = ranked.find((c) => c.subject === city);
    if (!best) return { city, code, example: null };
    const { kind, text, exposure, pays, day, payout, cost, odds } = best;
    return { city, code, example: { kind, text, exposure, pays, day, payout, cost, odds } };
  });
}

/**
 * Up to three risks worth trying, read off what Gemini lists and is asking this minute. Each is
 * for a day still to come and costs a small share of what it pays, so none ends in a bad price.
 * @param budget what the pool has free to lock, when that should limit how large the examples are
 */
export async function liveExamples(list: MarketSource, now = new Date(), budget = Infinity): Promise<Example[]> {
  const { cold, warm, fuel } = await scan(list, now, budget);
  // One of each kind where there is one, and never the same city twice.
  const picked: Scored[] = [];
  for (const kind of [cold, warm, fuel, cold, warm]) {
    const best = kind.find((c) => !picked.some((p) => p.subject === c.subject));
    if (best && picked.length < 3) picked.push(best);
  }
  return picked.map(({ kind, text, exposure, pays, day, payout, cost, odds }) => ({ kind, text, exposure, pays, day, payout, cost, odds }));
}

/** Cities whose next market prices a cold day as unlikely but real, most typical first, with the level cold starts at. */
export async function coldSpots(list: MarketSource, now = new Date()): Promise<{ city: string; level: number }[]> {
  const { cold } = await scan(list, now, Infinity);
  const spots = new Map<string, number>();
  for (const { subject, exposure } of cold) {
    if (!spots.has(subject) && exposure.trigger.family === "temperature") spots.set(subject, exposure.trigger.threshold);
  }
  return [...spots].map(([city, level]) => ({ city, level }));
}
