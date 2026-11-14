import { eventListSchema, rawEventSchema } from "./schema";
import { toMarket, type Market } from "./market";

const BASE = process.env.GEMINI_API_URL ?? "https://api.gemini.com";

// Full pages of sports events run past 10 MB and get cut off mid-response, so every
// query here is narrowed by category or search and capped well below the 500 maximum.
const PAGE = 100;

type Query = {
  status?: "active" | "settled";
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

async function get(path: string, query: Record<string, string | number | undefined> = {}) {
  const url = new URL(`/v1/prediction-markets/${path}`, BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Gemini now and then sits on a request for half a minute; giving up and asking again is quicker.
      const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`Gemini responded ${res.status}`);
      if (!res.ok) throw new GeminiError(res.status, await res.text());
      return await res.json();
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw lastError;
}

export class GeminiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`Gemini responded ${status}: ${body.slice(0, 200)}`);
    this.status = status;
  }
}

// Every quote reads a whole category. These markets move slowly, so a listing is reused for a few
// seconds: long enough that one visitor's quote, slider and purchase share it, short enough to stay current.
const FRESH_MS = 15_000;
const listings = new Map<string, { at: number; markets: Promise<Market[]> }>();

/** The markets Gemini lists for a query. The result is shared between callers, so it must not be changed in place. */
export function listMarkets(query: Query): Promise<Market[]> {
  const key = JSON.stringify(query);
  const recent = listings.get(key);
  if (recent && Date.now() - recent.at < FRESH_MS) return recent.markets;

  const markets = fetchMarkets(query);
  listings.set(key, { at: Date.now(), markets });
  markets.catch(() => listings.delete(key));
  return markets;
}

async function fetchMarkets(query: Query): Promise<Market[]> {
  const markets: Market[] = [];
  const limit = query.limit ?? Infinity;
  let offset = query.offset ?? 0;

  while (markets.length < limit) {
    const page = eventListSchema.parse(
      await get("events", { ...query, limit: Math.min(PAGE, limit - markets.length), offset }),
    );
    markets.push(...page.data.map(toMarket));
    offset += page.data.length;
    if (page.data.length === 0 || offset >= page.pagination.total) break;
  }
  return markets;
}

export async function getMarket(ticker: string): Promise<Market | null> {
  try {
    return toMarket(rawEventSchema.parse(await get(`events/${encodeURIComponent(ticker)}`)));
  } catch (error) {
    if (error instanceof GeminiError && error.status === 404) return null;
    throw error;
  }
}
