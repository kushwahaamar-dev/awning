import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { quoteCover } from "@/lib/covers/service";
import { exposureSchema } from "@/lib/hedge/exposure";

const bodySchema = z.object({
  owner: address,
  exposure: exposureSchema,
  coverRatio: z.number().min(0.1).max(1),
});

export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await requireOwner(request, body.owner);
    return Response.json(await quoteCover({ ...body, origin: new URL(request.url).origin }));
  } catch (error) {
    return fail(error);
  }
}
