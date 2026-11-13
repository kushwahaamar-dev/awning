import { fail } from "@/lib/api/respond";
import { costHistory } from "@/lib/odds";

/** GET /api/odds?legs=SYMBOL:yes,SYMBOL:no */
export async function GET(request: Request) {
  const legs = (new URL(request.url).searchParams.get("legs") ?? "")
    .split(",")
    .map((leg) => leg.split(":"))
    .filter((parts): parts is [string, "yes" | "no"] => parts.length === 2 && (parts[1] === "yes" || parts[1] === "no"))
    .map(([symbol, side]) => ({ symbol, side }));
  if (legs.length === 0) return Response.json({ error: "legs is required" }, { status: 400 });

  try {
    return Response.json({ points: await costHistory(legs) });
  } catch (error) {
    return fail(error);
  }
}
