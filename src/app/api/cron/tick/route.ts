import { fail } from "@/lib/api/respond";
import { tick } from "@/lib/tick";

/** For hosts without a long-running process: point a cron at this once a minute. */
export async function POST(request: Request) {
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
