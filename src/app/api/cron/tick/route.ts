import { fail } from "@/lib/api/respond";
import { tick } from "@/lib/tick";

/** For hosts without a long-running process: point a cron at this once a minute. */
export async function POST() {
  try {
    await tick();
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
