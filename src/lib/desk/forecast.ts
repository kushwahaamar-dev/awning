import type { Market } from "../gemini/market";

export type BucketForecast = {
  ticker: string;
  station: string;
  day: string;
  model: string;
  members: number;
  /** Probability that each contract resolves Yes, by instrument symbol. Sums to 1 across a partition. */
  probability: Record<string, number>;
};

const MODEL = "gfs_seamless";

type Place = { latitude: number; longitude: number; timezone: string };
const places = new Map<string, Place>();

async function json(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

/** Gemini names the settlement station in each contract's rules; this finds where that station is. */
async function locate(station: string): Promise<Place> {
  const known = places.get(station);
  if (known) return known;
  // The rules say "Austin-Bergstrom International Airport, TX"; the gazetteer wants the name alone.
  const name = station.replace(/,\s*[A-Z]{2}$/, "");
  const found = (await json(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name)}`)).results?.[0];
  if (!found) throw new Error(`Could not locate ${station}`);
  const place = { latitude: found.latitude, longitude: found.longitude, timezone: found.timezone };
  places.set(station, place);
  return place;
}

/** The highest reading each ensemble member forecasts for the station's local day, as NWS would report it: whole degrees. */
async function memberHighs(place: Place, day: string): Promise<number[]> {
  const url = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    hourly: "temperature_2m",
    models: MODEL,
    temperature_unit: "fahrenheit",
    timezone: place.timezone,
    start_date: day,
    end_date: day,
  }).toString();
  const { hourly } = (await json(url.toString())) as { hourly: Record<string, (number | null)[]> };

  return Object.entries(hourly)
    .filter(([key]) => key.startsWith("temperature_2m"))
    .map(([, readings]) => Math.round(Math.max(...readings.filter((r): r is number => r !== null))))
    .filter(Number.isFinite);
}

/**
 * Share of ensemble members landing in each bucket. Half a member is added to every bucket so that
 * none comes out as impossible or certain on the strength of 31 model runs.
 */
export function bucketProbabilities(market: Market, highs: number[]): Record<string, number> {
  const buckets = market.contracts.flatMap((c) => (c.outcome.kind === "range" ? [{ symbol: c.symbol, ...c.outcome }] : []));
  const total = highs.length + 0.5 * buckets.length;
  return Object.fromEntries(
    buckets.map((b) => {
      const count = highs.filter((h) => (b.lo === null || h >= b.lo) && (b.hi === null || h <= b.hi)).length;
      return [b.symbol, (count + 0.5) / total];
    }),
  );
}

/** An independent read on a temperature market: what a weather model ensemble says each bucket is worth. */
export async function forecastBuckets(market: Market): Promise<BucketForecast> {
  const { subject } = market;
  if (subject.family !== "temperature" || !subject.station || !subject.day) {
    throw new Error("Forecasts are only available for daily temperature markets.");
  }
  const highs = await memberHighs(await locate(subject.station), subject.day);
  if (highs.length === 0) throw new Error("The forecast model returned no members for that day.");
  return {
    ticker: market.ticker,
    station: subject.station,
    day: subject.day,
    model: `${MODEL} ensemble via Open-Meteo`,
    members: highs.length,
    probability: bucketProbabilities(market, highs),
  };
}
