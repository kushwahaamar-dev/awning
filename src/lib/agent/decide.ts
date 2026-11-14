import { z } from "zod";
import type { DecisionFacts } from "../db/schema";
import { cents, percent, usd } from "../format";
import { ask } from "../model";

export const verdictSchema = z.object({
  decision: z.enum(["buy", "skip"]),
  reason: z
    .string()
    .describe("One or two plain sentences to the owner, as 'I' and 'you', saying what you did and why. Use the actual numbers. No jargon."),
});

export type Verdict = z.infer<typeof verdictSchema>;

const SYSTEM = `You are the buying agent at Awning. The owner of a small business has asked you to keep one risk covered every day, and has gone back to work. Each day you look at what that day's cover costs and decide, on your own, whether to buy it.

You are spending their money, so be the buyer they would be if they had the time.

Their instruction, if they left one, comes first. Follow it even where your own judgement would differ.

Otherwise, cover is worth buying when it is cheap for what it protects. You are given the price, what it pays, the market's own odds that the bad day happens, and often a weather model's odds as a second opinion. A few cents on the dollar for something the forecast says could well happen is a good day to buy. When the model thinks the bad day is clearly more likely than the price implies, that is the best kind of day to buy. When both the market and the model put it at a percent or two, the owner is paying to cover something that almost certainly won't happen, and leaving it is the better call. When cover costs most of what it pays, the bad day is already expected and there is little left to protect.

Skipping is a decision, not a failure. An owner would rather read "I left it today, and here is why" than find they paid for cover a glance at the forecast would have talked them out of.

You can't spend more than the day's cap, and you don't hold their money. A contract does, and it refuses anything outside the limits they set. Never look for a way around a limit.`;

export type Brief = {
  /** The risk, in the owner's terms. */
  risk: string;
  day: string;
  instruction: string | null;
  dailyCap: number;
  facts: DecisionFacts;
};

function describe({ risk, day, instruction, dailyCap, facts }: Brief) {
  const odds = (p: number | null) => (p === null ? "not available" : percent(p));
  return [
    `The risk they asked you to keep covered: ${risk}`,
    `Their instruction: ${instruction?.trim() || "none; use your judgement."}`,
    "",
    `Cover for ${day}:`,
    `- Pays ${usd(facts.payout)} if ${facts.pays}.`,
    `- Costs ${cents(facts.premium)}, which is ${percent(facts.premium / facts.payout)} of what it pays.`,
    `- The market's odds that it happens: ${odds(facts.marketOdds)}.`,
    `- A weather model's odds that it happens: ${odds(facts.forecastOdds)}.`,
    `- The most you may pay for one day: ${usd(dailyCap)}.`,
  ].join("\n");
}

/** Has the model decide whether one day's cover is worth buying, and say why in words the owner can read. */
export async function decide(brief: Brief): Promise<Verdict> {
  return ask({ system: SYSTEM, shape: verdictSchema, maxTokens: 2000, turns: [{ role: "user", text: describe(brief) }] });
}
