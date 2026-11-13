import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { createStanding } from "@/lib/agent/standing";
import { exposureSchema } from "@/lib/hedge/exposure";
import { catchUp } from "@/lib/ledger/ingest";

const bodySchema = z.object({
  owner: address,
  exposure: exposureSchema,
  coverRatio: z.number().min(0.1).max(1),
  dailyCap: z.number().positive(),
  instruction: z.string().max(500).nullable(),
});

/** Leaves a risk with the agent. It answers once the agent has dealt with the days already listed. */
export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await requireOwner(request, body.owner);
    const order = await createStanding(body, new URL(request.url).origin);
    await catchUp({ fresh: true });
    return Response.json({ id: order.id });
  } catch (error) {
    return fail(error);
  }
}
