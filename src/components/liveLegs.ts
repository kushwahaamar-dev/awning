"use client";

import { useEffect, useState } from "react";
import type { Leg } from "@/lib/hedge/legs";

// Gemini's public market data socket. It needs no key, and it carries the live exchange's book
// for every prediction market contract, a tick at a time.
const SOCKET = "wss://ws.gemini.com";

type Tick = { s?: string; b?: string; a?: string };
/** The Yes side of each contract's book, which is the side Gemini quotes. */
type Book = Record<string, { yesBid: number | null; yesAsk: number | null }>;

const price = (text: string | undefined) => (text ? Number(text) : null);
const cents = (n: number) => Math.round(n * 100) / 100;

/** A leg at the feed's prices. A No leg reads the Yes book mirrored, as it does when first priced. */
function current(leg: Leg, { yesBid, yesAsk }: Book[string]): Leg {
  return {
    ...leg,
    bid: leg.side === "yes" ? yesBid : yesAsk === null ? null : cents(1 - yesAsk),
    ask: leg.side === "yes" ? yesAsk : yesBid === null ? null : cents(1 - yesBid),
  };
}

/**
 * The legs of a cover with their bid and ask kept current from Gemini's own feed, so a quote on
 * screen moves when the market does. Until the first tick arrives, and whenever the socket can't
 * be reached, the legs are returned as they were priced and `live` stays false.
 */
export function useLiveLegs(legs: Leg[]): { legs: Leg[]; live: boolean } {
  const [book, setBook] = useState<Book>({});
  const symbols = legs.map((leg) => leg.symbol).join(",");

  useEffect(() => {
    if (!symbols || typeof WebSocket === "undefined") return;
    const socket = new WebSocket(SOCKET);
    socket.onopen = () => socket.send(JSON.stringify({ id: "legs", method: "subscribe", params: symbols.split(",").map((symbol) => `${symbol}@bookTicker`) }));
    socket.onmessage = (event) => {
      let tick: Tick;
      try {
        tick = JSON.parse(String(event.data));
      } catch {
        return;
      }
      // Symbols come back in lower case; acknowledgements have no symbol at all.
      const symbol = tick.s?.toUpperCase();
      if (symbol) setBook((known) => ({ ...known, [symbol]: { yesBid: price(tick.b), yesAsk: price(tick.a) } }));
    };
    return () => {
      // A socket closed before it opens logs a harmless warning in some browsers; closing is still right.
      socket.onmessage = null;
      socket.close();
      setBook({});
    };
  }, [symbols]);

  const live = legs.length > 0 && legs.every((leg) => book[leg.symbol.toUpperCase()]);
  return { legs: live ? legs.map((leg) => current(leg, book[leg.symbol.toUpperCase()])) : legs, live };
}
