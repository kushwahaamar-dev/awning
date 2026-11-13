import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { fundLocally } from "@/lib/chain/server";

export async function POST(request: Request) {
  const body = await readBody(request, z.object({ owner: address }));
  if (body instanceof Response) return body;
  try {
    await fundLocally(body.owner, 5_000);
    return Response.json({ funded: 5_000 });
  } catch (error) {
    return fail(error);
  }
}
