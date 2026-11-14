import { describe, expect, it } from "vitest";
import fixture from "../gemini/__fixtures__/events.json";
import { toMarket } from "../gemini/market";
import { rawEventSchema } from "../gemini/schema";
import { stationFor } from "./stations";

describe("stationFor", () => {
  it("puts the cities a name search got wrong where they really are", async () => {
    // Looked up by name, these three came back as England, Tennessee and Peru.
    expect(await stationFor("BHM")).toMatchObject({ id: "KBHM", timezone: "America/Chicago" });
    expect(await stationFor("PHL")).toMatchObject({ id: "KPHL", timezone: "America/New_York" });
    const sfo = await stationFor("SFO");
    expect(sfo.latitude).toBeCloseTo(37.62, 1);
    expect(sfo.longitude).toBeCloseTo(-122.37, 1);
  });

  it("knows the stations that don't follow the airport-code rule", async () => {
    expect((await stationFor("CHI")).name).toMatch(/Midway/);
    expect((await stationFor("NYC")).name).toMatch(/Central Park/);
    expect((await stationFor("LA")).id).toBe("KLAX");
    expect((await stationFor("ANC")).id).toBe("PANC");
  });

  it("has a station inside the United States for every temperature market in the recorded Gemini data", async () => {
    const codes = new Set<string>();
    for (const raw of [...fixture.active, ...fixture.settled]) {
      const { subject } = toMarket(rawEventSchema.parse(raw));
      if (subject.family === "temperature") codes.add(subject.cityCode);
    }
    expect(codes.size).toBeGreaterThan(0);
    for (const code of codes) {
      const { latitude, longitude } = await stationFor(code);
      expect(latitude, code).toBeGreaterThan(24);
      expect(latitude, code).toBeLessThan(72);
      expect(longitude, code).toBeGreaterThan(-170);
      expect(longitude, code).toBeLessThan(-66);
    }
  });
});
