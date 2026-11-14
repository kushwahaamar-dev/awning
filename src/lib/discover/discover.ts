import type { MarketSource } from "../hedge/match";
import type { Exposure } from "../hedge/exposure";
import { usd } from "../format";
import { analyze, type Deviation, type Finding } from "./analyze";
import { dailyHighs } from "./history";
import { sampleSales } from "./sample";
import { stationFor, type Station } from "../weather/stations";
import type { Sale } from "./sales";

export type Discovery =
  | {
      finding: Finding;
      days: Deviation[];
      city: string;
      station: string;
      /** The risk as the rest of Awning understands it, ready to be priced. */
      exposure: Exposure;
      /** How many such days a year the data suggests, and what they add up to. */
      perYear: number;
      yearly: number;
    }
  | { finding: null; reason: string; city: string; station: string };

const isoDay = (at: Date) => at.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));

/** The station Gemini settles a city's temperature market on, so the history is for the place that decides a payout. */
async function settlementStation(city: string, list: MarketSource): Promise<Station> {
  const markets = await list({ status: "active", category: "Weather" });
  const market = markets.find((m) => m.subject.family === "temperature" && m.subject.city === city);
  if (!market || market.subject.family !== "temperature") throw new Error(`Gemini doesn't list a temperature market for ${city}.`);
  return stationFor(market.subject.cityCode);
}

/**
 * Finds the weather that costs a business money: joins its daily sales to the daily high at the
 * station its city's market settles on, and looks for the temperature at which takings drop.
 * With no sales given it runs on a labelled sample: made-up takings over the last year's real weather.
 */
export async function discover(city: string, sales: Sale[] | null, list: MarketSource): Promise<Discovery> {
  const station = await settlementStation(city, list);
  const from = sales ? sales[0].day : daysAgo(366);
  const to = sales ? [sales.at(-1)!.day, daysAgo(1)].sort()[0] : daysAgo(1);
  if (from > to) throw new Error("Those sales are all in the future.");

  const highs = await dailyHighs(station, from, to);
  const rows = sales ?? sampleSales(highs);
  const joined = rows.flatMap(({ day, amount }) => {
    const high = highs.get(day);
    return high === undefined ? [] : [{ day, amount, high }];
  });

  const result = analyze(joined);
  if (!result.finding) return { ...result, city, station: station.name };

  const { finding } = result;
  const perYear = Math.round((finding.badDays / finding.days) * 365);
  return {
    ...result,
    city,
    station: station.name,
    perYear,
    yearly: perYear * finding.lossUsd,
    exposure: {
      summary: `You take in about ${usd(finding.lossUsd)} less on any day ${city}'s high is ${finding.threshold}°F or ${finding.direction === "below" ? "below" : "above"}.`,
      trigger: { family: "temperature", city, direction: finding.direction, threshold: finding.threshold },
      lossUsd: finding.lossUsd,
      on: null,
      recurring: true,
      proxyNote: null,
    },
  };
}
