import { readPool, visitorGrant } from "@/lib/chain/server";
import { lastGoodMarkets } from "@/lib/gemini/lastGood";
import { liveExamples, type Example } from "@/lib/hedge/examples";
import { wake } from "@/lib/tick";

// The background pass can ride on this request, and settling waits on the chain.
export const maxDuration = 300;

const FRESH_MS = 5 * 60_000;
// An answer made from an old listing is not held on to for long: Gemini may be back.
const OLD_MS = 60_000;
let cached: { at: number; examples: Example[]; asOf: string | null } | null = null;

/**
 * Risks worth trying, priced from what Gemini is asking now. `asOf` is null when that is true, and otherwise
 * says when Gemini last answered: the prices are from then. An empty list is a fine answer: the page works without them.
 */
export async function GET(request: Request) {
  wake(request);
  if (!cached || Date.now() - cached.at > (cached.asOf ? OLD_MS : FRESH_MS)) {
    try {
      // Sized to what the pool can lock and to what a new visitor's test dollars can pay for, so on a
      // thinly funded test network the first example clicked can still be bought. A cover costs at
      // most three tenths of what it pays, and a quarter stays in the wallet for fees.
      const affordable = ((await visitorGrant()) - 0.25) / 0.3;
      const budget = await readPool().then((pool) => Math.min(pool.free, affordable), () => affordable);
      const markets = lastGoodMarkets();
      cached = { at: Date.now(), examples: await liveExamples(markets.list, new Date(), budget), asOf: markets.since() };
    } catch (error) {
      console.error("examples unavailable", error);
      return Response.json({ examples: cached?.examples ?? [], asOf: cached?.asOf ?? null });
    }
  }
  return Response.json({ examples: cached.examples, asOf: cached.asOf });
}
