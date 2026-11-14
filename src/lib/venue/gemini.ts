import { createHmac } from "node:crypto";
import type { Order } from "../db/schema";
import type { Venue } from "./index";

// Trading defaults to Gemini's sandbox. Point this at https://api.gemini.com to trade for real.
const BASE = process.env.GEMINI_TRADING_URL ?? "https://api.sandbox.gemini.com";

type GeminiOrder = { orderId: string; status: "open" | "filled" | "cancelled"; filledQuantity: string };

// Gemini's order ids are integers too large for a JavaScript number: read as one, the last digits
// change and the order can no longer be found or cancelled. They are kept as text on this side
// and written back as bare integers on the wire.
const idsAsText = (json: string) => json.replace(/"orderId":\s*(\d+)/g, '"orderId":"$1"');
const idsAsIntegers = (json: string) => json.replace(/"orderId":"(\d+)"/g, '"orderId":$1');

/**
 * Gemini's private REST convention: the parameters travel base64-encoded in a header, signed with
 * HMAC-SHA384, and the HTTP body stays empty. Keys must be provisioned with time-based nonces.
 */
async function signed<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.GEMINI_API_KEY!;
  const secret = process.env.GEMINI_API_SECRET!;
  const payload = Buffer.from(idsAsIntegers(JSON.stringify({ request: path, nonce: Math.floor(Date.now() / 1000), ...params }))).toString("base64");
  const signature = createHmac("sha384", secret).update(payload).digest("hex");

  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "0",
      "Cache-Control": "no-cache",
      "X-GEMINI-APIKEY": key,
      "X-GEMINI-PAYLOAD": payload,
      "X-GEMINI-SIGNATURE": signature,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini ${path} responded ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(idsAsText(text)) as T;
}

async function find(order: Order): Promise<GeminiOrder | undefined> {
  const { orders: active } = await signed<{ orders: GeminiOrder[] }>("POST", "/v1/prediction-markets/orders/active", { symbol: order.symbol });
  const live = active.find((o) => o.orderId === order.id);
  if (live) return live;
  // An order that left the book either filled or was cancelled; history is queried by which.
  for (const status of ["filled", "cancelled"] as const) {
    const { orders } = await signed<{ orders: GeminiOrder[] }>("POST", "/v1/prediction-markets/orders/history", { symbol: order.symbol, status });
    const closed = orders.find((o) => o.orderId === order.id);
    if (closed) return closed;
  }
}

/** Whether the exchange this key trades on lists every one of these contracts. */
export async function lists(ticker: string, symbols: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/v1/prediction-markets/events/${encodeURIComponent(ticker)}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    const event = (await res.json()) as { contracts?: { instrumentSymbol?: string }[] };
    const listed = new Set(event.contracts?.map((contract) => contract.instrumentSymbol));
    return symbols.every((symbol) => listed.has(symbol));
  } catch {
    return false;
  }
}

/** Places and tracks real orders through Gemini's prediction markets trading API. */
export const geminiVenue: Venue = {
  name: BASE.includes("sandbox") ? "gemini-sandbox" : "gemini",

  async place(orders, mode) {
    const terms = await signed<{ hasAcceptedLatest: boolean }>("GET", "/v1/prediction-markets/terms/status");
    if (!terms.hasAcceptedLatest) {
      throw new Error("This Gemini account hasn't accepted the prediction market terms yet. Accept them in Gemini once, then try again.");
    }

    const placed: Order[] = [];
    try {
      for (const order of orders) placed.push(await placeOne(order, mode));
    } catch (error) {
      // The caller refunds the whole premium on failure, so no leg may be left working on the book.
      for (const order of placed) {
        await signed("POST", "/v1/prediction-markets/order/cancel", { orderId: order.id }).catch(() => {});
      }
      throw error;
    }
    return placed;
  },

  async refresh(orders) {
    const refreshed: Order[] = [];
    // One at a time: the signed requests carry a time-based nonce.
    for (const order of orders) {
      const current = order.id === null || order.filled >= order.quantity ? undefined : await find(order);
      refreshed.push(current ? { ...order, filled: Number(current.filledQuantity) } : order);
    }
    return refreshed;
  },
};

async function placeOne(order: Order, mode: "now" | "resting"): Promise<Order> {
  const result = await signed<GeminiOrder>("POST", "/v1/prediction-markets/order", {
    symbol: order.symbol,
    orderType: "limit",
    side: "buy",
    outcome: order.side,
    quantity: String(order.quantity),
    price: order.price.toFixed(2),
    // Buying now takes what is on offer and cancels the rest; a resting order must not take at all.
    timeInForce: mode === "now" ? "immediate-or-cancel" : "good-til-cancel",
    makerOrCancel: mode === "resting",
  });
  return { ...order, id: result.orderId, filled: Number(result.filledQuantity) };
}
