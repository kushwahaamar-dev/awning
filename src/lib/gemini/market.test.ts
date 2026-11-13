import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/events.json";
import { toMarket } from "./market";
import { rawEventSchema } from "./schema";

const markets = fixture.active.map((e) => toMarket(rawEventSchema.parse(e)));
const byTicker = (prefix: string) => markets.find((m) => m.ticker.startsWith(prefix))!;

describe("toMarket", () => {
  it("reads a daily temperature market as a partition of buckets", () => {
    const austin = byTicker("WXHIGH-AUS");
    expect(austin.structure).toBe("partition");
    expect(austin.unit).toBe("°F");
    expect(austin.subject).toEqual({
      family: "temperature",
      city: "Austin",
      cityCode: "AUS",
      station: "Austin-Bergstrom International Airport, TX",
      day: "2026-11-13",
    });

    const outcomes = Object.fromEntries(austin.contracts.map((c) => [c.label, c.outcome]));
    expect(outcomes["79°F to 80°F"]).toEqual({ kind: "range", lo: 79, hi: 80 });
    expect(outcomes["83°F or above"]).toEqual({ kind: "range", lo: 83, hi: null });
    expect(outcomes["74°F or below"]).toEqual({ kind: "range", lo: null, hi: 74 });
  });

  it("keeps an empty side of the book as null rather than zero", () => {
    const coldest = byTicker("WXHIGH-AUS").contracts.find((c) => c.label === "74°F or below")!;
    expect(coldest.yesBid).toBeNull();
    expect(coldest.yesAsk).toBe(0.01);
  });

  it("reads commodity and hourly crypto strikes as ladders", () => {
    const wti = byTicker("WTI");
    expect(wti.structure).toBe("ladder");
    expect(wti.subject).toEqual({ family: "price", asset: "WTI", name: "Oil (WTI)" });
    expect(wti.contracts[0].outcome).toEqual({ kind: "range", lo: 81, hi: null });

    expect(byTicker("BTC26").subject).toMatchObject({ family: "price", asset: "BTC" });
  });

  it("does not mistake up/down or spread markets for something it can hedge with", () => {
    expect(byTicker("BTC05M").structure).toBe("other");
    expect(markets.find((m) => m.ticker.endsWith("-S"))!.structure).toBe("other");
  });

  it("reads a moneyline with one contract per team", () => {
    const game = byTicker("NCAAF-2611150030-TEX-LSU-M");
    expect(game.structure).toBe("moneyline");
    expect(game.contracts.map((c) => c.outcome)).toEqual([
      { kind: "team", team: "LSU Tigers", abbreviation: "LSU" },
      { kind: "team", team: "Texas Longhorns", abbreviation: "TEX" },
    ]);
  });

  it("carries the resolution of settled contracts", () => {
    const settled = toMarket(rawEventSchema.parse(fixture.settled[0]));
    const yes = settled.contracts.filter((c) => c.resolvedYes);
    expect(yes.map((c) => c.label)).toEqual(["80°F or above"]);
    expect(settled.contracts.every((c) => c.resolvedYes !== null)).toBe(true);
  });
});
