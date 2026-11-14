import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { fundVisitor } from "@/lib/chain/server";

/** Test dollars for the device that asks, so the app can be tried without leaving it. */
export async function POST(request: Request) {
  const body = await readBody(request, z.object({ owner: address }));
  if (body instanceof Response) return body;
  try {
    await requireOwner(request, body.owner);
    return Response.json({ funded: await fundVisitor(body.owner) });
  } catch (error) {
    return fail(error);
  }
}
