import { z } from "zod";
import { fail, hex, readBody } from "@/lib/api/respond";
import { openCover } from "@/lib/covers/service";
import { pollChain } from "@/lib/ledger/ingest";
import { usesStreams } from "@/lib/ledger/source";

const bodySchema = z.object({ deadline: z.number().int().positive(), signature: hex.nullable() });

export async function POST(request: Request, { params }: RouteContext<"/api/covers/[id]/open">) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    const { id } = await params;
    const result = await openCover(id as `0x${string}`, body);
    if (!usesStreams) await pollChain();
    return Response.json(result);
  } catch (error) {
    return fail(error);
  }
}
