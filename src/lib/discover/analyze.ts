/** One day of takings, with the high recorded that day. */
export type Day = { day: string; amount: number; high: number };

export type Finding = {
  /** Whether the loss comes on days at or below the threshold, or at or above it. */
  direction: "below" | "above";
  /** Daily high in whole °F at which the loss starts. */
  threshold: number;
  /** What such a day costs, against other days in the same month and on the same weekday. */
  lossUsd: number;
  /** The range the loss plausibly lies in: two standard errors either side. */
  range: [number, number];
  /** How many of the days in the data were like that. */
  badDays: number;
  days: number;
  /** Chance of an effect this strong turning up in sales that don't depend on the weather at all. */
  chance: number;
};

/** Each day's takings against what that weekday in that month normally brings in. */
export type Deviation = Day & { deviation: number; bad: boolean };

export type Analysis = { finding: Finding; days: Deviation[] } | { finding: null; reason: string };

const MIN_DAYS = 60;
const SHUFFLES = 800;
const ROUNDS = 12;

const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const month = (day: string) => day.slice(0, 7);

/** Numbers each distinct key 0, 1, 2… so groups can be indexed by array. */
function index(keys: (string | number)[]): { of: number[]; count: number } {
  const seen = new Map<string | number, number>();
  const of = keys.map((key) => seen.get(key) ?? (seen.set(key, seen.size), seen.size - 1));
  return { of, count: seen.size };
}

type Groups = { of: number[]; count: number }[];

/**
 * Takes the weekday pattern and the month-to-month level out of a series, leaving what is particular
 * to each day. With two groupings there is no closed form, so it removes each group's mean in turn
 * until nothing is left to remove (alternating projections).
 */
function within(values: number[], groups: Groups): number[] {
  const out = values.slice();
  for (let round = 0; round < ROUNDS; round++) {
    for (const { of, count } of groups) {
      const sum = new Float64Array(count);
      const n = new Float64Array(count);
      for (let i = 0; i < out.length; i++) {
        sum[of[i]] += out[i];
        n[of[i]]++;
      }
      for (let i = 0; i < out.length; i++) out[i] -= sum[of[i]] / n[of[i]];
    }
  }
  return out;
}

/**
 * For each candidate threshold, how much takings change on days at or below it, and how sure that is.
 * A day at or above T+1 is exactly a day not at or below T, so one pass covers both directions:
 * a negative effect is a loss in the cold, a positive one a loss in the heat.
 */
function scan(highs: number[], sales: number[], groups: Groups, thresholds: number[], minSide: number, freedom: number) {
  let best: { threshold: number; effect: number; error: number; t: number } | null = null;
  for (const threshold of thresholds) {
    const cold = highs.map((h) => (h <= threshold ? 1 : 0));
    const count = cold.reduce<number>((a, b) => a + b, 0);
    if (count < minSide || highs.length - count < minSide) continue;

    const x = within(cold, groups);
    let xx = 0;
    let xy = 0;
    for (let i = 0; i < x.length; i++) {
      xx += x[i] * x[i];
      xy += x[i] * sales[i];
    }
    // A threshold that only ever separates whole months says nothing once months are accounted for.
    if (xx < minSide / 4) continue;

    const effect = xy / xx;
    let left = 0;
    for (let i = 0; i < x.length; i++) left += (sales[i] - effect * x[i]) ** 2;
    const error = Math.sqrt(left / freedom / xx);
    const t = effect / error;
    if (!best || Math.abs(t) > Math.abs(best.t)) best = { threshold, effect, error, t };
  }
  return best;
}

/** A small seeded generator, so the same data always gives the same answer. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reorders the highs among the days of each month, which keeps the seasons and breaks any day-to-day link with sales. */
function shuffleWithinMonths(highs: number[], months: { of: number[]; count: number }, next: () => number) {
  const slots: number[][] = Array.from({ length: months.count }, () => []);
  months.of.forEach((m, i) => slots[m].push(i));
  const out = highs.slice();
  for (const days of slots) {
    for (let i = days.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[days[i]], out[days[j]]] = [out[days[j]], out[days[i]]];
    }
  }
  return out;
}

/**
 * Looks for the daily high at which takings drop.
 *
 * Every day is compared with other days in the same month and on the same weekday, so a busy
 * Saturday or a slow January isn't mistaken for weather. Because many thresholds are tried, the
 * strongest one would look significant by luck alone; the chance reported is how often shuffled
 * weather produces an effect at least as strong at its own best threshold.
 */
export function analyze(input: Day[], seed = 7): Analysis {
  const days = input.filter((d) => Number.isFinite(d.amount) && Number.isFinite(d.high)).map((d) => ({ ...d, high: Math.round(d.high) }));
  if (days.length < MIN_DAYS)
    return { finding: null, reason: `This needs at least ${MIN_DAYS} days of sales with weather on record. There are ${days.length}.` };

  const weekdays = index(days.map((d) => weekday(d.day)));
  const months = index(days.map((d) => month(d.day)));
  const groups = [weekdays, months];
  const highs = days.map((d) => d.high);
  const sales = within(
    days.map((d) => d.amount),
    groups,
  );

  const sorted = [...highs].sort((a, b) => a - b);
  const lowest = sorted[Math.floor(sorted.length * 0.05)];
  const highest = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const thresholds = Array.from({ length: Math.max(0, highest - lowest) }, (_, i) => lowest + i);
  const minSide = Math.max(8, Math.ceil(days.length * 0.04));
  const freedom = days.length - weekdays.count - months.count;

  const best = freedom > 0 ? scan(highs, sales, groups, thresholds, minSide, freedom) : null;
  if (!best) return { finding: null, reason: "The weather didn't vary enough within each month to compare like with like." };

  const next = random(seed);
  let asStrong = 0;
  for (let i = 0; i < SHUFFLES; i++) {
    const shuffled = scan(shuffleWithinMonths(highs, months, next), sales, groups, thresholds, minSide, freedom);
    if (shuffled && Math.abs(shuffled.t) >= Math.abs(best.t)) asStrong++;
  }
  const chance = (asStrong + 1) / (SHUFFLES + 1);

  const typical = days.reduce((sum, d) => sum + d.amount, 0) / days.length;
  const loss = Math.abs(best.effect);
  // One file in a hundred with no weather effect at all will still pass this. That is the price of
  // finding real ones, and why the page shows the chance instead of hiding it.
  if (chance > 0.01 || loss < typical * 0.03) {
    return { finding: null, reason: "There's no clear link between the daily high and your sales in this data." };
  }

  const direction = best.effect < 0 ? "below" : "above";
  const threshold = direction === "below" ? best.threshold : best.threshold + 1;
  const isBad = (high: number) => (direction === "below" ? high <= threshold : high >= threshold);
  return {
    finding: {
      direction,
      threshold,
      lossUsd: Math.round(loss),
      range: [Math.max(0, Math.round(loss - 2 * best.error)), Math.round(loss + 2 * best.error)],
      badDays: highs.filter(isBad).length,
      days: days.length,
      chance,
    },
    days: days.map((d, i) => ({ ...d, deviation: sales[i], bad: isBad(d.high) })),
  };
}
