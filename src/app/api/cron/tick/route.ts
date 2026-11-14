import { fail } from "@/lib/api/respond";
import { tick } from "@/lib/tick";

// Settling and the agent's daily decisions wait on the chain and the model.
export const maxDuration = 300;

/** For hosts without a long-running process: point a cron at this. Vercel's cron calls it with GET. */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await tick(new URL(request.url).origin);
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export { run as GET, run as POST };
