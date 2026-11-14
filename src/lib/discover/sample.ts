import type { Sale } from "./sales";

// What an ice cream truck might take on each weekday, Sunday first, and how the months compare.
const BY_WEEKDAY = [1500, 950, 900, 980, 1050, 1400, 1750];
const BY_MONTH = [0.88, 0.9, 0.97, 1.02, 1.08, 1.14, 1.16, 1.15, 1.07, 1.0, 0.93, 0.89];
// The truck's bad days are the coldest eighth of the year, wherever it trades.
const COLD_SHARE = 0.12;

/** A seeded generator, so the sample is the same every time. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Made-up takings for an ice cream truck, laid over real weather: a weekly rhythm, a seasonal
 * level, day-to-day noise, and about $310 lost on any day at or under a cold level: the one given,
 * or else the coldest eighth of the year. It exists so the analysis can be tried without a sales
 * file, and it is always labelled as a sample.
 */
export function sampleSales(highs: Map<string, number>, coldAt?: number): Sale[] {
  const sorted = [...highs.values()].map(Math.round).sort((a, b) => a - b);
  const cold = coldAt ?? sorted[Math.floor(sorted.length * COLD_SHARE)];
  const next = random(20261113);
  // Two uniform draws make a bell-shaped one, near enough for noise.
  const bell = () => (next() + next() + next() + next() - 2) * 0.87;
  return [...highs].map(([day, high]) => {
    const date = new Date(`${day}T00:00:00Z`);
    const usual = BY_WEEKDAY[date.getUTCDay()] * BY_MONTH[date.getUTCMonth()] * (1 + 0.09 * bell());
    const lost = Math.round(high) <= cold ? 310 + 70 * bell() : 0;
    return { day, amount: Math.max(0, Math.round(usual - lost)) };
  });
}
