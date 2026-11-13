import { z } from "zod";
import { address, fail, readBody } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { stopStanding } from "@/lib/agent/standing";

export async function POST(request: Request, { params }: RouteContext<"/api/standing/[id]/stop">) {
  const body = await readBody(request, z.object({ owner: address }));
  if (body instanceof Response) return body;
  try {
    await requireOwner(request, body.owner);
    await stopStanding(body.owner, Number((await params).id));
    return Response.json({ stopped: true });
  } catch (error) {
    return fail(error);
  }
}
