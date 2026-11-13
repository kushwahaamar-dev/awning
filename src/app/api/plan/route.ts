import { z } from "zod";
import { fail, readBody } from "@/lib/api/respond";
import { listMarkets } from "@/lib/gemini/client";
import { exposureSchema } from "@/lib/hedge/exposure";
import { planCover } from "@/lib/hedge/plan";
import { recordContracts } from "@/lib/odds";

const bodySchema = z.object({
  exposure: exposureSchema,
  coverRatio: z.number().min(0.1).max(1).default(1),
});

export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  try {
    const planned = await planCover(body.exposure, listMarkets, { coverRatio: body.coverRatio });
    // Every quote adds a point to the price history of the market it looked at.
    if (planned) await recordContracts(planned.market.contracts);
    return Response.json({ plan: planned?.plan ?? null });
  } catch (error) {
    return fail(error);
  }
}
