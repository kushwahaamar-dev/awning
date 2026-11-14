import { readPool } from "@/lib/chain/server";
import { listMarkets } from "@/lib/gemini/client";
import { liveExamples, type Example } from "@/lib/hedge/examples";

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; examples: Example[] } | null = null;

/** Risks worth trying, priced from what Gemini is asking now. An empty list is a fine answer: the page works without them. */
export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    try {
      // Sized to what the pool can lock, so on a thinly funded test network they can still be bought.
      const budget = await readPool().then((pool) => pool.free, () => Infinity);
      cached = { at: Date.now(), examples: await liveExamples(listMarkets, new Date(), budget) };
    } catch (error) {
      console.error("examples unavailable", error);
      return Response.json({ examples: cached?.examples ?? [] });
    }
  }
  return Response.json({ examples: cached.examples });
}
