import { z } from "zod";
import { fail, readBody } from "@/lib/api/respond";
import { discover } from "@/lib/discover/discover";
import { parseSales } from "@/lib/discover/sales";
import { listMarkets } from "@/lib/gemini/client";
import { getCatalog } from "@/lib/hedge/catalog";

const bodySchema = z.object({
  city: z.string().min(1).max(60),
  /** A spreadsheet export of daily sales. Left out, the analysis runs on the labelled sample. */
  csv: z.string().max(600_000).optional(),
});

/** The cities whose weather can be covered, which are the ones worth looking for a weather effect in. */
export async function GET() {
  try {
    const { cities } = await getCatalog(listMarkets);
    return Response.json({ cities });
  } catch (error) {
    return fail(error);
  }
}

/** Looks for the weather that costs a business money, in its own sales. */
export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  let sales = null;
  try {
    if (body.csv !== undefined) sales = parseSales(body.csv);
  } catch (error) {
    // A file we can't read is the sender's to fix, and the message says how.
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  try {
    return Response.json(await discover(body.city, sales, listMarkets));
  } catch (error) {
    return fail(error);
  }
}
