import { z } from "zod";

export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/) as unknown as z.ZodType<`0x${string}`>;
export const hex = z.string().regex(/^0x[0-9a-fA-F]*$/) as unknown as z.ZodType<`0x${string}`>;
