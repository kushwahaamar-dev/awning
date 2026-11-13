import { z } from "zod";

// Gemini sends prices as decimal strings and omits or nulls them when a side of the book is empty.
const price = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || v === "" ? null : Number(v)));

const numeric = z.union([z.string(), z.number()]).transform(Number);

export const rawContractSchema = z.object({
  id: z.string(),
  label: z.string(),
  ticker: z.string(),
  instrumentSymbol: z.string(),
  status: z.string(),
  marketState: z.string().nullish(),
  expiryDate: z.string(),
  description: z.unknown().optional(),
  prices: z
    .object({ bestBid: price, bestAsk: price, lastTradePrice: price })
    .nullish(),
  strike: z
    .object({ type: z.string(), value: z.union([z.string(), z.number()]).nullish() })
    .nullish(),
  priceIncrement: numeric.nullish(),
  quantityMinimum: numeric.nullish(),
  resolutionSide: z.string().nullish(),
});

export const rawEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  ticker: z.string(),
  category: z.string(),
  type: z.string(),
  status: z.string(),
  series: z.string().nullish(),
  template: z.string().nullish(),
  expiryDate: z.string().nullish(),
  startTime: z.string().nullish(),
  resolvedAt: z.string().nullish(),
  volume24h: numeric.nullish(),
  subcategory: z.object({ name: z.string() }).nullish(),
  participants: z
    .array(z.object({ name: z.string(), abbreviation: z.string(), side: z.string().nullish() }))
    .nullish(),
  sportsMarket: z.object({ type: z.string().nullish() }).nullish(),
  contracts: z.array(rawContractSchema),
});

export const eventListSchema = z.object({
  data: z.array(rawEventSchema),
  pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number() }),
});

export type RawEvent = z.infer<typeof rawEventSchema>;
export type RawContract = z.infer<typeof rawContractSchema>;
