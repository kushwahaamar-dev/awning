import { describe, expect, it } from "vitest";
import { listMarkets } from "../gemini/client";
import { getCatalog } from "./catalog";
import { interpret } from "./interpret";
import { planCover } from "./plan";

// Hits the Gemini exchange and Google's Gemini model (needs GOOGLE_AI_API_KEY). Run with: LIVE=1 npx vitest run src/lib/hedge/live.test.ts
describe.skipIf(!process.env.LIVE)("live: sentence to priced cover", () => {
  const today = new Date().toISOString().slice(0, 10);

  it("lists what Gemini offers today", async () => {
    const catalog = await getCatalog(listMarkets);
    console.log(catalog.cities.length, "cities;", catalog.assets.map((a) => a.code).join(" "));
    expect(catalog.cities).toContain("Austin");
    expect(catalog.assets.map((a) => a.code)).toContain("WTI");
  }, 60_000);

  const cases = [
    "I run an ice cream truck in Austin. Any day the high stays under 80 I'm out about three hundred bucks.",
    "My delivery vans burn diesel. If oil goes above 90 dollars a barrel next week it costs me around 1500.",
    "I own a bar near campus in Austin, and if the Longhorns lose this weekend I make about $4,000 less.",
    "If it rains on my farmers market Saturday I lose $800.",
    "A cold snap would really hurt my patio restaurant in Denver.",
  ];

  it.each(cases)("%s", async (sentence) => {
    const catalog = await getCatalog(listMarkets);
    const result = await interpret([{ role: "user", text: sentence }], catalog, today);
    console.log(JSON.stringify(result, null, 1));
    if (result.status !== "ready") return;

    const plan = (await planCover(result.exposure!, listMarkets))?.plan;
    console.log(
      JSON.stringify(
        plan && { market: plan.market.title, pays: plan.coverage.pays, legs: plan.coverage.legs, quote: plan.quote, basis: plan.basis },
        null,
        1,
      ),
    );
    expect(plan).toBeDefined();
  }, 120_000);
});
