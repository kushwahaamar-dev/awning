import { coldSpots } from "../hedge/examples";
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
  if (!market || market.subject.family !== "temperature") throw new Error(`Gemini doesn’t list a temperature market for ${city}.`);
  return stationFor(market.subject.cityCode);
}

const SAMPLE_HOME = "Austin";
const SAMPLE_TRIES = 4;

const join = (rows: Sale[], highs: Map<string, number>) =>
  rows.flatMap(({ day, amount }) => {
    const high = highs.get(day);
    return high === undefined ? [] : [{ day, amount, high }];
  });

/**
 * Where the sample truck trades and where its bad days start. Both are made up either way, so they
 * are put where a market prices tomorrow's cold as unlikely but real, and the walk-through ends on
 * a cover worth buying. A city is kept only if the analysis, run in full, lands on that very level:
 * a degree to either side falls between the market's steps and prices as a different risk. If no
 * city fits, the truck stays home and the sample picks its own idea of cold.
 */
async function sampleSetting(list: MarketSource, from: string, to: string) {
  const spots = await coldSpots(list).catch(() => []);
  const homeFirst = [...spots.filter((s) => s.city === SAMPLE_HOME), ...spots.filter((s) => s.city !== SAMPLE_HOME)];
  for (const { city, level } of homeFirst.slice(0, SAMPLE_TRIES)) {
    const station = await settlementStation(city, list);
    const highs = await dailyHighs(station, from, to);
    const rows = sampleSales(highs, level);
    const found = analyze(join(rows, highs)).finding;
    if (found?.direction === "below" && found.threshold === level) return { city, station, highs, rows };
  }
  const station = await settlementStation(SAMPLE_HOME, list);
  const highs = await dailyHighs(station, from, to);
  return { city: SAMPLE_HOME, station, highs, rows: sampleSales(highs) };
}

/**
 * Finds the weather that costs a business money: joins its daily sales to the daily high at the
 * station its city's market settles on, and looks for the temperature at which takings drop.
 * With no sales given it runs on a labelled sample: made-up takings over the last year's real weather,
 * in whichever city makes a fair demonstration that day.
 */
export async function discover(where: string, sales: Sale[] | null, list: MarketSource): Promise<Discovery> {
  const from = sales ? sales[0].day : daysAgo(366);
  const to = sales ? [sales.at(-1)!.day, daysAgo(1)].sort()[0] : daysAgo(1);
  if (from > to) throw new Error("Those sales are all in the future.");

  let city = where;
  let station: Station;
  let highs: Map<string, number>;
  let rows: Sale[];
  if (sales) {
    station = await settlementStation(city, list);
    highs = await dailyHighs(station, from, to);
    rows = sales;
  } else {
    ({ city, station, highs, rows } = await sampleSetting(list, from, to));
  }
  const joined = join(rows, highs);

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
      summary: `You take in about ${usd(finding.lossUsd)} less on any day ${city}’s high is ${finding.threshold}°F or ${finding.direction === "below" ? "below" : "above"}.`,
      trigger: { family: "temperature", city, direction: finding.direction, threshold: finding.threshold },
      lossUsd: finding.lossUsd,
      on: null,
      recurring: true,
      proxyNote: null,
    },
  };
}
