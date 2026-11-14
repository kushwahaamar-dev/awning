import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export type Turn = { role: "user" | "assistant"; text: string };

// Google's Gemini models. They share a name with the exchange the markets are on and nothing
// else, so the key has a variable of its own that can't be mistaken for the exchange's trading key.
const MODEL = process.env.AWNING_MODEL ?? "gemini-3.8-flash";

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
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("Reading a typed risk isn't switched on here. Pick one of the examples, or find a risk in your sales.");

  const reply = await new GoogleGenAI({ apiKey }).interactions.create({
    model: MODEL,
    system_instruction: system,
    input: turns.map(({ role, text }) =>
      role === "user" ? { type: "user_input" as const, content: said(text) } : { type: "model_output" as const, content: said(text) },
    ),
    response_format: { type: "text", mime_type: "application/json", schema: replySchema(shape) },
    generation_config: { max_output_tokens: maxTokens, thinking_level: "low" },
    // Each request carries everything it needs, so there is nothing for Google to keep between them.
    store: false,
  });
  if (reply.status !== "completed" || !reply.output_text) throw new Error(`The model didn't finish its answer (${reply.status}).`);
  return shape.parse(JSON.parse(reply.output_text));
}
