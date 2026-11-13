import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { hijack } from "@/lib/covers/hijack";
import { pollChain } from "@/lib/ledger/ingest";
import { usesStreams } from "@/lib/ledger/source";

export async function POST(request: Request) {
  const body = await readBody(request, z.object({ owner: address }));
  if (body instanceof Response) return body;
  try {
    const result = await hijack(body.owner);
    if (!usesStreams) await pollChain();
    return Response.json(result);
  } catch (error) {
    return fail(error);
  }
}
