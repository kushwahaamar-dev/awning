import { z } from "zod";
import { ask, type Turn } from "../model";
import type { Catalog } from "./catalog";
import { exposureSchema } from "./exposure";

export const interpretationSchema = z.object({
  status: z.enum(["ready", "needs_detail", "unlisted"]),
  exposure: exposureSchema.nullable().describe("Set only when status is ready"),
  question: z.string().nullable().describe("When status is needs_detail: the one question that would let you finish"),
  wanted: z
    .string()
    .nullable()
    .describe("When status is unlisted: a short name for the market the user would have needed, e.g. 'Rainfall in Austin'"),
});

export type Interpretation = z.infer<typeof interpretationSchema>;
export type { Turn };

const SYSTEM = `You work the intake desk at Awning, a service that lets small business owners and ordinary people offset a real-world risk using Gemini prediction markets. People describe, in their own words, something that could cost them money. Your job is to turn that into a structured exposure that can be matched to a listed market.

These people are not traders. They will say things like "a cold snap kills my patio business" or "if diesel keeps climbing my delivery margins are gone". Read for the underlying risk: what has to happen, where and when, and roughly what it costs them.

Only three kinds of market exist, and the user message lists exactly what is available today:
- temperature: the daily high in a listed city. These are one-day markets, so a risk that spans a season is covered one day at a time; set recurring to true when the user describes an ongoing condition rather than a single date.
- price: a listed commodity or crypto asset being at or above, or at or below, a level on a date.
- game: a team winning or losing a specific game. Use the name the user gave for the team.

Choosing a status:
- ready: you know the trigger and the dollar loss. Fill in the exposure.
- needs_detail: a market family fits but something essential is missing, usually the dollar amount or the level at which it starts to hurt. Ask one short, concrete question in plain language. Don't ask for anything you can reasonably infer.
- unlisted: nothing listed tracks this risk even loosely (rain, snowfall, a city or asset that isn't listed, interest rates, a competitor opening). Say what market they would have needed.

When the listed market only approximates the real risk, still use it, and say so in proxyNote in one honest sentence. Diesel hedged with crude oil is a proxy. A food truck's heating bill hedged with natural gas futures is a proxy. A patio's foot traffic hedged with the airport's recorded high is close enough that no note is needed.

Set "on" whenever the user ties the risk to a time: a named day becomes that date, and a span like "next week" becomes the last day of the span, so the cover is still in force at the end of it. Leave it null only when they mean "the next one" or an ongoing condition.

Temperatures are whole degrees Fahrenheit, as the weather service reports them, so "under 76" is a threshold of 75 with direction "below", and "over 90" is 91 with direction "above".

Direction is about when the user loses money: "below" means the loss happens when the reading is at or below the threshold. Amounts are US dollars per occurrence: for a recurring daily risk, lossUsd is the loss on one bad day.`;

function describeCatalog(catalog: Catalog, today: string) {
  return [
    `Today is ${today}.`,
    `Cities with a daily high temperature market: ${catalog.cities.join(", ")}.`,
    `Assets with a price market: ${catalog.assets.map((a) => `${a.code} (${a.name})`).join(", ")}.`,
    "Games: college and pro football, college and pro basketball, hockey, and UFC, by team name.",
  ].join("\n");
}

export async function interpret(turns: Turn[], catalog: Catalog, today: string): Promise<Interpretation> {
  const [first, ...rest] = turns;
  // What is listed today travels with the first thing the person said, so every later turn is read against it.
  return ask({
    system: SYSTEM,
    shape: interpretationSchema,
    maxTokens: 4000,
    turns: [{ role: "user", text: `${describeCatalog(catalog, today)}\n\n${first.text}` }, ...rest],
  });
}
