import { describe, expect, it } from "vitest";
import fixture from "../gemini/__fixtures__/events.json";
import { toMarket, type Market } from "../gemini/market";
import { rawEventSchema } from "../gemini/schema";
import { assessBasis } from "./basis";
import type { Exposure } from "./exposure";
import { buildCoverage } from "./legs";
import { findMarket } from "./match";
import { quoteCover } from "./quote";

const markets = fixture.active.map((e) => toMarket(rawEventSchema.parse(e)));
const byTicker = (prefix: string) => markets.find((m) => m.ticker.startsWith(prefix))!;
const austin = byTicker("WXHIGH-AUS");
const wti = byTicker("WTI");
const game = byTicker("NCAAF-2611150030-TEX-LSU-M");

const list = async (q: { category?: string; search?: string }) =>
  markets.filter((m: Market) => (q.category ? m.category === q.category : true));

const coldDay: Exposure = {
  summary: "A cool day costs the ice cream truck about $300.",
  trigger: { family: "temperature", city: "Austin", direction: "below", threshold: 78 },
  lossUsd: 300,
  on: null,
  recurring: true,
  proxyNote: null,
};

describe("buildCoverage", () => {
  it("covers a cold day with every bucket at or below the threshold", () => {
    const coverage = buildCoverage(austin, coldDay.trigger)!;
    expect(coverage.legs.map((l) => l.label)).toEqual(["74°F or below", "75°F to 76°F", "77°F to 78°F"]);
    expect(coverage.legs.every((l) => l.side === "yes")).toBe(true);
    expect(coverage.pays).toBe("Austin's high is 78°F or below");
    expect(coverage.snappedTo).toBeNull();
  });

  it("covers a hot day with every bucket at or above the threshold", () => {
    const coverage = buildCoverage(austin, { family: "temperature", city: "Austin", direction: "above", threshold: 81 })!;
    expect(coverage.legs.map((l) => l.label)).toEqual(["81°F to 82°F", "83°F or above"]);
  });

  it("snaps to the bucket edge that protects more when the threshold falls between two", () => {
    const below = buildCoverage(austin, { family: "temperature", city: "Austin", direction: "below", threshold: 77 })!;
    expect(below.snappedTo).toBe(78);
    const above = buildCoverage(austin, { family: "temperature", city: "Austin", direction: "above", threshold: 78 })!;
    expect(above.snappedTo).toBe(77);
  });

  it("uses a Yes for a price rise and a No for a price fall on a ladder", () => {
    const rise = buildCoverage(wti, { family: "price", asset: "WTI", direction: "above", threshold: 88 })!;
    expect(rise.legs).toMatchObject([{ label: "$87 or above", side: "yes" }]);
    expect(rise.snappedTo).toBe(87);

    const fall = buildCoverage(wti, { family: "price", asset: "WTI", direction: "below", threshold: 81 })!;
    expect(fall.legs).toMatchObject([{ label: "$81 or above", side: "no" }]);
    expect(fall.pays).toBe("WTI oil is below $81");
  });

  it("prices a No leg from the mirrored Yes book", () => {
    const coverage = buildCoverage(game, { family: "game", team: "Texas", outcome: "loses" })!;
    expect(coverage.legs).toMatchObject([{ label: "Texas", side: "no", bid: 0.61, ask: 0.63 }]);
    expect(coverage.pays).toBe("the Texas Longhorns don't win");
  });

  it("refuses a trigger the market cannot express", () => {
    expect(buildCoverage(game, coldDay.trigger)).toBeNull();
    expect(buildCoverage(austin, { family: "game", team: "Texas", outcome: "loses" })).toBeNull();
  });
});

describe("quoteCover", () => {
  const coverage = buildCoverage(austin, coldDay.trigger)!;

  it("charges the sum of the asks plus the taker fee when buying now", () => {
    const quote = quoteCover(coverage, 300);
    expect(quote.contracts).toBe(300);
    expect(quote.payout).toBe(300);
    // asks 0.01 + 0.05 + 0.12; fee 300 × 0.07 × (0.0099 + 0.0475 + 0.1056)
    expect(quote.now).toEqual({ prices: [0.01, 0.05, 0.12], premium: 54, fees: 3.42, total: 57.42 });
  });

  it("rests inside the spread and never above the offer", () => {
    const { resting } = quoteCover(coverage, 300);
    // 74-or-below has only a 1¢ offer; 75–76 is 1/5; 77–78 is 6/12
    expect(resting!.prices).toEqual([0.01, 0.03, 0.09]);
    expect(resting!.total).toBeLessThan(quoteCover(coverage, 300).now!.total);
  });

  it("moves the resting order to the fair price when one is supplied, without crossing", () => {
    const { resting } = quoteCover(coverage, 300, 1, [null, 0.02, 0.5]);
    expect(resting!.prices).toEqual([0.01, 0.02, 0.11]);
  });

  it("scales with the share of the loss covered", () => {
    expect(quoteCover(coverage, 300, 0.5).now!.premium).toBe(27);
  });

  it("offers no immediate price when nobody is selling, and no resting price without something to anchor on", () => {
    const oil = buildCoverage(wti, { family: "price", asset: "WTI", direction: "above", threshold: 87 })!;
    const blind = quoteCover(oil, 1500);
    expect(blind.now).toBeNull();
    expect(blind.resting).toBeNull();
    expect(blind.marketOdds).toBeNull();
    expect(quoteCover(oil, 1500, 1, [0.3]).resting).toMatchObject({ prices: [0.3], premium: 450 });
  });

  it("reports the market's odds from the middle of each leg's book", () => {
    const quote = quoteCover(buildCoverage(game, { family: "game", team: "Texas", outcome: "loses" })!, 1000);
    expect(quote.marketOdds).toBe(0.62);
  });
});

describe("assessBasis", () => {
  it("names the settlement station and stays close for a direct match", () => {
    const basis = assessBasis(coldDay, austin, buildCoverage(austin, coldDay.trigger)!);
    expect(basis.notes[0]).toContain("Austin-Bergstrom International Airport");
    expect(basis.level).toBe("close");
  });

  it("marks a proxy hedge on an unquoted, snapped strike as loose", () => {
    const diesel: Exposure = {
      summary: "Diesel above $4 costs the delivery fleet $1,500 a week.",
      trigger: { family: "price", asset: "WTI", direction: "above", threshold: 88 },
      lossUsd: 1500,
      on: null,
      recurring: false,
      proxyNote: "Diesel isn't listed; crude oil moves with it, but not one for one.",
    };
    const basis = assessBasis(diesel, wti, buildCoverage(wti, diesel.trigger)!);
    expect(basis.level).toBe("loose");
    expect(basis.notes).toContain(diesel.proxyNote);
    expect(basis.notes.some((n) => n.includes("$87 instead of your $88"))).toBe(true);
    expect(basis.notes.some((n) => n.includes("may not fill"))).toBe(true);
  });
});

describe("findMarket", () => {
  it("finds the city's temperature market", async () => {
    expect((await findMarket(coldDay, list))?.ticker).toBe(austin.ticker);
  });

  it("finds the asset's ladder and ignores up/down markets on the same asset", async () => {
    const btc: Exposure = { ...coldDay, trigger: { family: "price", asset: "BTC", direction: "below", threshold: 67000 } };
    expect((await findMarket(btc, list))?.ticker).toBe("BTC2611130700");
  });

  it("finds a team's game by a partial name", async () => {
    const texas: Exposure = { ...coldDay, trigger: { family: "game", team: "Texas", outcome: "loses" } };
    expect((await findMarket(texas, list))?.ticker).toBe(game.ticker);
  });

  it("returns null when nothing is listed", async () => {
    const tulsa: Exposure = { ...coldDay, trigger: { family: "temperature", city: "Reykjavik", direction: "below", threshold: 40 } };
    expect(await findMarket(tulsa, list)).toBeNull();
  });
});
