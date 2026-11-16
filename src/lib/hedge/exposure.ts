import { z } from "zod";

export const triggerSchema = z.discriminatedUnion("family", [
  z.object({
    family: z.literal("temperature"),
    city: z.string().describe("City name exactly as listed in the catalog"),
    direction: z.enum(["above", "below"]).describe("Whether the loss happens when the daily high is at or above, or at or below, the threshold"),
    threshold: z.number().describe("Daily high temperature in °F"),
  }),
  z.object({
    family: z.literal("price"),
    asset: z.string().describe("Asset code exactly as listed in the catalog, e.g. WTI"),
    direction: z.enum(["above", "below"]),
    threshold: z.number().describe("Price level in US dollars"),
  }),
  z.object({
    family: z.literal("game"),
    team: z.string().describe("Team name"),
    outcome: z.enum(["wins", "loses"]).describe("The result that costs the user money"),
  }),
]);

export const exposureSchema = z.object({
  summary: z.string().describe("One plain sentence restating the risk back to the person, addressed to them as 'you' and 'your'. Say any date the way a person would ('tomorrow', 'on Tuesday', 'on November 17'), never as 2026-11-17"),
  trigger: triggerSchema,
  lossUsd: z.number().positive().describe("What the event costs the user, in US dollars"),
  on: z.string().nullable().describe("ISO date (YYYY-MM-DD) the risk applies to, or null for the next listed market"),
  recurring: z.boolean().describe("True when the user wants this covered every day it can be"),
  proxyNote: z
    .string()
    .nullable()
    .describe("If the listed market only approximates the user's real risk, one sentence saying how. Otherwise null."),
});

export type Trigger = z.infer<typeof triggerSchema>;
export type Exposure = z.infer<typeof exposureSchema>;
