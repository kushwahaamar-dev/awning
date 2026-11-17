import { describe, expect, it } from "vitest";
import { analyze, type Day } from "./analyze";
import { parseSales } from "./sales";

/** A seeded generator for building test data. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKDAY = [1500, 950, 900, 980, 1050, 1400, 1750];

/**
 * A year of days with a seasonal temperature curve, a weekly sales rhythm and noise.
 * `monthly` lifts sales in warm months; `effect` is what the weather itself does to a day's takings.
 */
function year({ seed = 1, monthly = 0, effect = () => 0 }: { seed?: number; monthly?: number; effect?: (high: number) => number } = {}): Day[] {
  const next = random(seed);
  const bell = () => (next() + next() + next() + next() - 2) * 0.87;
  return Array.from({ length: 365 }, (_, i) => {
    const date = new Date(Date.UTC(2025, 10, 14 + i));
    const season = Math.sin(((date.getUTCMonth() - 3) / 12) * 2 * Math.PI);
    const high = Math.round(72 + 20 * season + 8 * bell());
    const amount = WEEKDAY[date.getUTCDay()] * (1 + monthly * season) + 90 * bell() + effect(high);
    return { day: date.toISOString().slice(0, 10), amount, high };
  });
}

describe("analyze", () => {
  it("finds a loss on cold days and puts a number on it", () => {
    const result = analyze(year({ effect: (high) => (high <= 62 ? -300 : 0) }));
    expect(result.finding).toMatchObject({ direction: "below" });
    expect(result.finding!.threshold).toBeGreaterThanOrEqual(60);
    expect(result.finding!.threshold).toBeLessThanOrEqual(64);
    expect(result.finding!.lossUsd).toBeGreaterThan(250);
    expect(result.finding!.lossUsd).toBeLessThan(350);
    expect(result.finding!.chance).toBeLessThan(0.01);
  });

  it("finds a loss on hot days as readily as on cold ones", () => {
    const result = analyze(year({ seed: 2, effect: (high) => (high >= 88 ? -260 : 0) }));
    expect(result.finding).toMatchObject({ direction: "above" });
    expect(result.finding!.threshold).toBeGreaterThanOrEqual(86);
    expect(result.finding!.threshold).toBeLessThanOrEqual(90);
    expect(result.finding!.lossUsd).toBeGreaterThan(200);
  });

  it("counts the days the finding applies to", () => {
    const days = year({ effect: (high) => (high <= 62 ? -300 : 0) });
    const result = analyze(days);
    const { threshold, badDays } = result.finding!;
    expect(badDays).toBe(days.filter((d) => d.high <= threshold).length);
    expect(result.finding && "days" in result ? result.days.filter((d) => d.bad).length : 0).toBe(badDays);
  });

  it("finds nothing in sales that don’t depend on the weather", () => {
    for (const seed of [3, 4, 5, 6]) expect(analyze(year({ seed })).finding).toBeNull();
  });

  it("isn’t fooled by a business that is simply busier in summer", () => {
    // Sales follow the season, so they rise with temperature across the year, but within any
    // month a warmer day is no better than a cooler one.
    for (const seed of [7, 8, 9]) expect(analyze(year({ seed, monthly: 0.3 })).finding).toBeNull();
  });

  it("gives the same answer for the same data", () => {
    const days = year({ effect: (high) => (high <= 62 ? -300 : 0) });
    expect(analyze(days)).toEqual(analyze(days));
  });

  it("asks for more data rather than guessing from a few weeks", () => {
    const result = analyze(year().slice(0, 30));
    expect(result.finding).toBeNull();
    expect(result).toMatchObject({ reason: expect.stringContaining("at least 60 days") });
  });
});

describe("parseSales", () => {
  it("reads a spreadsheet export with a header", () => {
    expect(parseSales("date,total\n2026-03-14,1204.50\n2026-03-15,980\n")).toEqual([
      { day: "2026-03-14", amount: 1204.5 },
      { day: "2026-03-15", amount: 980 },
    ]);
  });

  it("reads American dates, dollar signs and quoted thousands", () => {
    expect(parseSales('Day,Orders,Revenue\n3/14/2026,41,"$1,204.50"\n3/15/26,33,$980.00')).toEqual([
      { day: "2026-03-14", amount: 1204.5 },
      { day: "2026-03-15", amount: 980 },
    ]);
  });

  it("adds up several sales on the same day and sorts by day", () => {
    expect(parseSales("2026-03-15T09:10:00,12\n2026-03-14T18:00:00,20\n2026-03-15T17:45:00,8")).toEqual([
      { day: "2026-03-14", amount: 20 },
      { day: "2026-03-15", amount: 20 },
    ]);
  });

  it("says what a row needs when it finds none", () => {
    expect(() => parseSales("hello\nworld")).toThrow(/date and an amount/);
  });
});
