import { describe, expect, it } from "vitest";
import type { Order } from "../db/schema";
import fixture from "../gemini/__fixtures__/events.json";
import { toMarket } from "../gemini/market";
import { rawEventSchema } from "../gemini/schema";
import { resolution } from "./settlement";

// Albuquerque, 22 October: the high came in at 80°F or above.
const settled = toMarket(rawEventSchema.parse(fixture.settled[0]));
const live = toMarket(rawEventSchema.parse(fixture.active[0]));
const symbol = (label: string) => settled.contracts.find((c) => c.label === label)!.symbol;

const order = (label: string, side: Order["side"]): Order => ({ symbol: symbol(label), side, price: 0.2, quantity: 100, id: "test", filled: 0 });

describe("resolution", () => {
  it("happened when any bucket in the basket came in", () => {
    expect(resolution([order("78°F to 79°F", "yes"), order("80°F or above", "yes")], settled)).toBe("happened");
  });

  it("missed when none of the user's sides came in", () => {
    expect(resolution([order("69°F or below", "yes")], settled)).toBe("missed");
  });

  it("reads a No side from a contract that resolved No", () => {
    expect(resolution([order("70°F to 71°F", "no")], settled)).toBe("happened");
    expect(resolution([order("80°F or above", "no")], settled)).toBe("missed");
  });

  // The pool pays on the event, not on whether its own hedge filled on Gemini.
  it("does not depend on fills", () => {
    expect(resolution([{ ...order("80°F or above", "yes"), filled: 0 }], settled)).toBe("happened");
  });

  it("waits while any contract is unresolved", () => {
    const open: Order = { symbol: live.contracts[0].symbol, side: "yes", price: 0.4, quantity: 100, id: "test", filled: 100 };
    expect(resolution([open], live)).toBeNull();
  });
});
