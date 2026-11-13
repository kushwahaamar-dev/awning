import { z } from "zod";
import { fail, hex, readBody } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { coverOwner, openCover } from "@/lib/covers/service";
import { catchUp } from "@/lib/ledger/ingest";

const bodySchema = z.object({ deadline: z.number().int().positive(), signature: hex.nullable() });

export async function POST(request: Request, { params }: RouteContext<"/api/covers/[id]/open">) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    const { id } = await params;
    await requireOwner(request, await coverOwner(id as `0x${string}`));
    const result = await openCover(id as `0x${string}`, body);
    await catchUp({ fresh: true });
    return Response.json(result);
  } catch (error) {
    return fail(error);
  }
}
