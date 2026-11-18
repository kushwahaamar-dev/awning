import { tickIfDue } from "@/lib/tick";

// Settling and the agent's daily decisions wait on the chain and the model.
export const maxDuration = 300;

/**
 * Wakes the background pass on a host with no long-running process: settle what has resolved, let the agent
 * look at its standing orders, note where prices are. It takes nothing from whoever calls it and does at most
 * one pass a minute, the same as loading a page does, so it needs no secret. A schedule calls it.
 */
export async function GET(request: Request) {
  await tickIfDue(new URL(request.url).origin);
  return Response.json({ ok: true });
}
