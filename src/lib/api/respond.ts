import { z } from "zod";
import { CoverError } from "../covers/service";
import { Unauthorized } from "./session";

/** Parses a JSON body against a schema; a mismatch becomes a 400 that says which field was wrong. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return parsed.data;
  return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
}

export function fail(error: unknown) {
  if (error instanceof Unauthorized) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof CoverError) return Response.json({ error: error.message }, { status: 409 });
  console.error(error);
  return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
}

export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/) as unknown as z.ZodType<`0x${string}`>;
export const hex = z.string().regex(/^0x[0-9a-fA-F]*$/) as unknown as z.ZodType<`0x${string}`>;
