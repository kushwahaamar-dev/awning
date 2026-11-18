import { expect, test } from "vitest";
import { answerTo } from "./voice";

// What is heard over a quote can buy it, so what counts as "yes" is pinned down here.
test("a short go-ahead buys", () => {
  for (const said of ["Cover it.", "cover it please", "Yes, cover it", "Buy it", "Yes.", "Okay, go ahead and buy it.", "Sure", "cover me", "Do it!", "Approve"]) {
    expect([said, answerTo(said)]).toEqual([said, "yes"]);
  }
});

test("a refusal anywhere in it wins", () => {
  for (const said of ["No, not now.", "Never mind", "cancel", "don't buy it", "No thanks, don't cover it", "Wait"]) {
    expect([said, answerTo(said)]).toEqual([said, "no"]);
  }
});

test("a new bad day is not an answer, even when it starts with “cover”", () => {
  for (const said of [
    "Cover my bakery against rain",
    "Cover my bakery",
    "If Austin is under 60 tomorrow my patio loses $300",
    "A heat wave in Houston kills soup sales",
    "cover a cold day in Denver for the patio",
  ]) {
    expect([said, answerTo(said)]).toEqual([said, null]);
  }
});
