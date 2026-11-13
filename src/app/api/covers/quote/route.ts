import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { quoteCover } from "@/lib/covers/service";
import { exposureSchema } from "@/lib/hedge/exposure";

const bodySchema = z.object({
  owner: address,
  exposure: exposureSchema,
  coverRatio: z.number().min(0.1).max(1),
  mode: z.enum(["now", "resting"]),
});

export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    return Response.json(await quoteCover({ ...body, origin: new URL(request.url).origin }));
  } catch (error) {
    return fail(error);
  }
}
