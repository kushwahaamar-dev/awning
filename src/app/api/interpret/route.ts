import { z } from "zod";
import { fail, readBody } from "@/lib/api/respond";
import { getDb, gaps } from "@/lib/db";
import { listMarkets } from "@/lib/gemini/client";
import { getCatalog } from "@/lib/hedge/catalog";
import { interpret } from "@/lib/hedge/interpret";

const bodySchema = z.object({
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(2000) })).min(1).max(12),
});

export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  try {
    const catalog = await getCatalog(listMarkets);
    const today = new Date().toISOString().slice(0, 10);
    const result = await interpret(body.turns, catalog, today);

    if (result.status === "unlisted" && result.wanted) {
      const db = await getDb();
      await db.insert(gaps).values({ wanted: result.wanted, sentence: body.turns.findLast((t) => t.role === "user")!.text });
    }
    return Response.json(result);
  } catch (error) {
    return fail(error);
  }
}
