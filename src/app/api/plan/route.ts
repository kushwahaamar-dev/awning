import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { secondOpinion } from "@/lib/desk/second-opinion";
import { lastGoodMarkets } from "@/lib/gemini/lastGood";
import { exposureSchema } from "@/lib/hedge/exposure";
import { planCover } from "@/lib/hedge/plan";
import { recordContracts } from "@/lib/odds";

const bodySchema = z.object({
  exposure: exposureSchema,
  coverRatio: z.number().min(0.1).max(1).default(1),
  /** When given, the agent may spend this owner's data allowance on a forecast to check the price against. */
  owner: address.optional(),
});

export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  try {
    const { owner } = body;
    if (owner) await requireOwner(request, owner);
    const origin = new URL(request.url).origin;
    // A quote can still be shown from Gemini's last answer when it has gone quiet. `asOf` says so, and the page
    // then holds back the way to buy: cover is only ever sold at a price Gemini is giving now.
    const markets = lastGoodMarkets();
    const planned = await planCover(body.exposure, markets.list, {
      coverRatio: body.coverRatio,
      fairValue: owner && (async (market) => {
        const opinion = await secondOpinion(owner, market, origin).catch((error) => {
          // A quote is still worth giving when the forecast can't be bought.
          console.error("forecast purchase failed", error);
          return null;
        });
        return opinion && { ...opinion.forecast, paid: opinion.paid };
      }),
    });
    // Every quote adds a point to the price history of the market it looked at.
    if (planned && !markets.since()) await recordContracts(planned.market.contracts);
    return Response.json({ plan: planned?.plan ?? null, asOf: markets.since() });
  } catch (error) {
    return fail(error);
  }
}
