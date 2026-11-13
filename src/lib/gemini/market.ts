import type { RawContract, RawEvent } from "./schema";

/** A contract resolves Yes when the settlement value lands in [lo, hi]; null means unbounded. */
export type Outcome =
  | { kind: "range"; lo: number | null; hi: number | null }
  | { kind: "team"; team: string; abbreviation: string }
  | { kind: "other" };

export type Contract = {
  symbol: string;
  label: string;
  outcome: Outcome;
  yesBid: number | null;
  yesAsk: number | null;
  last: number | null;
  /** Gemini accepts only resting (maker) orders on this contract right now. */
  postOnly: boolean;
  tick: number;
  minQuantity: number;
  rules: string;
  resolvedYes: boolean | null;
};

export type Subject =
  | { family: "temperature"; city: string; cityCode: string; station: string | null; day: string | null }
  | { family: "price"; asset: string; name: string }
  | { family: "game"; league: string; teams: { name: string; abbreviation: string }[] }
  | { family: "other" };

/**
 * partition: exactly one contract resolves Yes (temperature buckets).
 * ladder: nested "X or above" strikes, several can resolve Yes.
 * moneyline: one contract per team.
 */
export type Structure = "partition" | "ladder" | "moneyline" | "other";

export type Market = {
  ticker: string;
  title: string;
  category: string;
  status: string;
  subject: Subject;
  structure: Structure;
  unit: "°F" | "$" | null;
  expiresAt: string;
  startsAt: string | null;
  volume24h: number;
  contracts: Contract[];
};

type RichText = { nodeType?: string; value?: string; content?: RichText[] };

function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as RichText;
  if (n.nodeType === "text") return n.value ?? "";
  return (n.content ?? []).map(plainText).join("");
}

const number = (s: string) => Number(s.replace(/[$,°F\s]/g, ""));

function parseOutcome(raw: RawContract, event: RawEvent): Outcome {
  const strike = raw.strike;
  if (strike?.value != null && (strike.type === "above" || strike.type === "below")) {
    const v = Number(strike.value);
    return strike.type === "above" ? { kind: "range", lo: v, hi: null } : { kind: "range", lo: null, hi: v };
  }
  const between = raw.label.match(/^(\$?-?[\d.,]+)\s*°?F?\s+to\s+(\$?-?[\d.,]+)/i);
  if (between) return { kind: "range", lo: number(between[1]), hi: number(between[2]) };

  const team = event.participants?.find((p) => p.abbreviation === raw.ticker);
  if (team) return { kind: "team", team: team.name, abbreviation: team.abbreviation };
  return { kind: "other" };
}

function toContract(raw: RawContract, event: RawEvent): Contract {
  return {
    symbol: raw.instrumentSymbol,
    label: raw.label,
    outcome: parseOutcome(raw, event),
    yesBid: raw.prices?.bestBid ?? null,
    yesAsk: raw.prices?.bestAsk ?? null,
    last: raw.prices?.lastTradePrice ?? null,
    postOnly: raw.marketState === "post_only",
    tick: raw.priceIncrement ?? 0.01,
    minQuantity: raw.quantityMinimum ?? 0.01,
    rules: plainText(raw.description).trim(),
    resolvedYes: raw.resolutionSide ? raw.resolutionSide === "yes" : null,
  };
}

function parseSubject(event: RawEvent, contracts: Contract[]): Subject {
  if (event.series === "WXHIGH") {
    const city = event.title.match(/temperature in (.+?) on /i)?.[1] ?? event.ticker.split("-")[1];
    const station = contracts[0]?.rules.match(/recorded at (.+?) on /i)?.[1] ?? null;
    const date = event.title.match(/ on ([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1];
    const day = date ? new Date(`${date} UTC`).toISOString().slice(0, 10) : null;
    return { family: "temperature", city, cityCode: event.ticker.split("-")[1], station, day };
  }
  if (event.sportsMarket?.type === "moneyline" && event.participants?.length) {
    return {
      family: "game",
      league: event.ticker.split("-")[0],
      teams: event.participants.map(({ name, abbreviation }) => ({ name, abbreviation })),
    };
  }
  const isPrice = event.category === "Commodities" || event.category === "Crypto";
  const ladder = contracts.length > 1 && contracts.every((c) => c.outcome.kind === "range" && c.outcome.hi === null);
  if (isPrice && ladder) {
    const asset = event.ticker.match(/^[A-Z]+/)?.[0] ?? event.ticker;
    return { family: "price", asset, name: event.subcategory?.name ?? asset };
  }
  return { family: "other" };
}

const structures: Record<Subject["family"], Structure> = {
  temperature: "partition",
  price: "ladder",
  game: "moneyline",
  other: "other",
};

export function toMarket(event: RawEvent): Market {
  const contracts = event.contracts.map((c) => toContract(c, event));
  const subject = parseSubject(event, contracts);
  return {
    ticker: event.ticker,
    title: event.title,
    category: event.category,
    status: event.status,
    subject,
    structure: structures[subject.family],
    unit: subject.family === "temperature" ? "°F" : subject.family === "price" ? "$" : null,
    expiresAt: event.expiryDate ?? event.contracts[0]?.expiryDate ?? "",
    startsAt: event.startTime ?? null,
    volume24h: event.volume24h ?? 0,
    contracts,
  };
}
