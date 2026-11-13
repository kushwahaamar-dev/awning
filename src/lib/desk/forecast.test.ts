import { describe, expect, it } from "vitest";
import fixture from "../gemini/__fixtures__/events.json";
import { toMarket } from "../gemini/market";
import { rawEventSchema } from "../gemini/schema";
import { bucketProbabilities } from "./forecast";

const austin = toMarket(rawEventSchema.parse(fixture.active[0]));
const bySymbol = (label: string) => austin.contracts.find((c) => c.label === label)!.symbol;

describe("bucketProbabilities", () => {
  // 31 members, the shape of a real GFS ensemble run for Austin
  const highs = [76, 76, 76, 77, 77, 77, 77, 77, 78, 78, 78, 78, 78, 78, 79, 79, 79, 79, 79, 79, 79, 79, 79, 79, 80, 80, 80, 80, 80, 81, 81];
  const p = bucketProbabilities(austin, highs);

  it("counts members into the bucket that contains them, edges included", () => {
    // 77–78 holds 11 of 31; six buckets each get half a member of smoothing
    expect(p[bySymbol("77°F to 78°F")]).toBeCloseTo(11.5 / 34);
    expect(p[bySymbol("79°F to 80°F")]).toBeCloseTo(15.5 / 34);
    expect(p[bySymbol("81°F to 82°F")]).toBeCloseTo(2.5 / 34);
  });

  it("never calls a bucket impossible", () => {
    expect(p[bySymbol("74°F or below")]).toBeCloseTo(0.5 / 34);
    expect(p[bySymbol("83°F or above")]).toBeGreaterThan(0);
  });

  it("sums to one across the partition", () => {
    expect(Object.values(p).reduce((sum, v) => sum + v, 0)).toBeCloseTo(1);
  });
});
