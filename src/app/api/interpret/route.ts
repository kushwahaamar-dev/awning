import { z } from "zod";
import { fail, readBody } from "@/lib/api/respond";
import { getDb, gaps } from "@/lib/db";
import { lastGoodMarkets } from "@/lib/gemini/lastGood";
import { getCatalog } from "@/lib/hedge/catalog";
import { interpret } from "@/lib/hedge/interpret";
import { easternDate } from "@/lib/hedge/match";

const bodySchema = z.object({
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(2000) })).min(1).max(12),
});

export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  try {
    // What can be covered changes slowly, so a sentence can still be read when Gemini has gone quiet.
    const catalog = await getCatalog(lastGoodMarkets().list);
    // Today on the US east coast, where Gemini dates its markets. By the world's clock it is already tomorrow
    // there every evening, and "tomorrow" would be read a day late.
    const result = await interpret(body.turns, catalog, easternDate(new Date()));

    if (result.status === "unlisted" && result.wanted) {
      const db = await getDb();
      await db.insert(gaps).values({ wanted: result.wanted, sentence: body.turns.findLast((t) => t.role === "user")!.text });
    }
    return Response.json(result);
  } catch (error) {
    return fail(error);
  }
}
