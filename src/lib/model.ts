import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export type Turn = { role: "user" | "assistant"; text: string };

// Google's Gemini models. They share a name with the exchange the markets are on and nothing
// else, so the key has a variable of its own that can't be mistaken for the exchange's trading key.
// The first model reads best: given a vague risk it asks rather than inventing a level. On a free
// key any one model can refuse for being busy, or sit silent for a minute, while another answers in
// a second. So there are two more to turn to, none is waited on for long, and a list that was busy
// all the way down is gone through once more, because busy rarely lasts.
const MODELS = process.env.AWNING_MODEL ? [process.env.AWNING_MODEL] : ["gemini-3.5-flash-lite", "gemini-4-hydrogen", "gemini-3.6-flash"];
// A model that is going to answer does so in a few seconds; one that hasn't by now is stuck, and the next is asked.
const PATIENCE_MS = 9_000;
const ROUNDS = 2;
const BETWEEN_ROUNDS_MS = 1_200;
// However the attempts fall, nobody is kept waiting past this.
const GIVE_UP_MS = 40_000;

type Json = { [key: string]: unknown };

/**
 * A Zod shape as the JSON Schema Google enforces. Its subset has no `oneOf`, `const` or exclusive
 * bounds, so those are restated in terms it does have. Zod still checks the whole reply afterwards.
 */
export function replySchema(shape: z.ZodType): Json {
  const restate = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(restate);
    if (!node || typeof node !== "object") return node;
    const out: Json = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$schema" || key === "exclusiveMinimum" || key === "exclusiveMaximum") continue;
      // Under "properties" the keys are the caller's own field names, not schema words.
      if (key === "properties") out.properties = Object.fromEntries(Object.entries(value as Json).map(([name, field]) => [name, restate(field)]));
      else if (key === "oneOf") out.anyOf = restate(value);
      else if (key === "const") out.enum = [value];
      else out[key] = restate(value);
    }
    return out;
  };
  return restate(z.toJSONSchema(shape)) as Json;
}

const said = (text: string) => [{ type: "text" as const, text }];

/** One question to the language model, answered as data of a known shape. */
export async function ask<T>({ system, turns, shape, maxTokens }: { system: string; turns: Turn[]; shape: z.ZodType<T>; maxTokens: number }): Promise<T> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) throw new Error("Reading a typed risk isn’t switched on here. Pick one of the examples, or find a risk in your sales.");
  const client = new GoogleGenAI({ apiKey });

  const started = Date.now();
  const left = () => GIVE_UP_MS - (Date.now() - started);

  /** Each model in turn, until one answers or the time is up. */
  async function goDownTheList(): Promise<T | undefined> {
    for (const model of MODELS) {
      if (left() < 2_000) return undefined;
      try {
        const reply = await client.interactions.create(
          {
            model,
            system_instruction: system,
            input: turns.map(({ role, text }) =>
              role === "user" ? { type: "user_input" as const, content: said(text) } : { type: "model_output" as const, content: said(text) },
            ),
            response_format: { type: "text", mime_type: "application/json", schema: replySchema(shape) },
            generation_config: { max_output_tokens: maxTokens, thinking_level: "low" },
            // Each request carries everything it needs, so there is nothing for Google to keep between them.
            store: false,
          },
          { timeout: Math.min(PATIENCE_MS, left()), maxRetries: 0 },
        );
        if (reply.status !== "completed" || !reply.output_text) throw new Error(`it stopped early (${reply.status})`);
        return shape.parse(JSON.parse(reply.output_text));
      } catch (error) {
        console.error(`${model} could not answer`, error);
      }
    }
    return undefined;
  }

  for (let round = 0; round < ROUNDS && left() > BETWEEN_ROUNDS_MS; round++) {
    if (round > 0) await new Promise((resolve) => setTimeout(resolve, BETWEEN_ROUNDS_MS));
    const answer = await goDownTheList();
    if (answer !== undefined) return answer;
  }
  throw new Error("The model that reads sentences is busy right now. Try again in a moment, or pick one of the examples.");
}
