import { fail } from "@/lib/api/respond";
import { forecastBuckets } from "@/lib/desk/forecast";
import { sell } from "@/lib/desk/x402";
import { getMarket } from "@/lib/gemini/client";

const PRICE_USD = 0.02;

/**
 * An x402 endpoint any agent can buy from: bucket-by-bucket probabilities for one of Gemini's
 * daily temperature markets, from a weather model ensemble. GET /api/desk/forecast?ticker=WXHIGH-AUS-…
 */
export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker");
  if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
  try {
    return await sell(request, PRICE_USD, `Ensemble forecast for Gemini market ${ticker}`, async () => {
      const market = await getMarket(ticker);
      if (!market) throw new Error(`No market ${ticker}`);
      return forecastBuckets(market);
    });
  } catch (error) {
    return fail(error);
  }
}
