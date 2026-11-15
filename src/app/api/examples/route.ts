import { VISITOR_GRANT_USD, readPool } from "@/lib/chain/server";
import { listMarkets } from "@/lib/gemini/client";
import { liveExamples, type Example } from "@/lib/hedge/examples";

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; examples: Example[] } | null = null;

/** Risks worth trying, priced from what Gemini is asking now. An empty list is a fine answer: the page works without them. */
export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    try {
      // Sized to what the pool can lock and to what a new visitor's test dollars can pay for, so on a
      // thinly funded test network the first example clicked can still be bought. A cover costs at
      // most three tenths of what it pays, and a quarter stays in the wallet for fees.
      const affordable = (VISITOR_GRANT_USD - 0.25) / 0.3;
      const budget = await readPool().then((pool) => Math.min(pool.free, affordable), () => affordable);
      cached = { at: Date.now(), examples: await liveExamples(listMarkets, new Date(), budget) };
    } catch (error) {
      console.error("examples unavailable", error);
      return Response.json({ examples: cached?.examples ?? [] });
    }
  }
  return Response.json({ examples: cached.examples });
}
