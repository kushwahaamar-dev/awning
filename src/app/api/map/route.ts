import { readPool, visitorGrant } from "@/lib/chain/server";
import { lastGoodMarkets } from "@/lib/gemini/lastGood";
import { cityPrices, type CityPrice } from "@/lib/hedge/examples";
import { costHistories } from "@/lib/odds";
import { wake } from "@/lib/tick";
import { stationFor } from "@/lib/weather/stations";

/**
 * `trace` is what the market has made the odds of this city's bad day through the last day, oldest first, from
 * Awning's own record of Gemini's prices. It is empty until that record reaches back far enough to show a move.
 */
export type MapCity = CityPrice & { latitude: number; longitude: number; trace: { at: string; odds: number }[] };

// The background pass can ride on this request, and settling waits on the chain.
export const maxDuration = 300;

const FRESH_MS = 5 * 60_000;
// An answer made from an old listing is not held on to for long: Gemini may be back.
const OLD_MS = 60_000;
// A move is only worth reporting over a stretch of time, and within the day. A trace is drawn an inch wide,
// so it is sent as no more points than that can show.
const MOVED_OVER_MS = 30 * 60_000;
const DAY_HOURS = 24;
const TRACE_POINTS = 40;
let cached: { at: number; cities: MapCity[]; asOf: string | null } | null = null;

/** For each priced city, how the market's odds of its bad day have moved through the last day. */
async function traces(cities: CityPrice[]): Promise<Map<string, MapCity["trace"]>> {
  const priced = cities.filter((city) => city.example);
  const histories = await costHistories(new Map(priced.map((city) => [city.code, city.example!.legs])), DAY_HOURS);
  return new Map(
    priced.map(({ code }) => {
      const points = histories.get(code) ?? [];
      if (points.length < 2 || new Date(points.at(-1)!.at).getTime() - new Date(points[0].at).getTime() < MOVED_OVER_MS) return [code, []];
      // Thinned from the newest point back, so the trace always ends on the latest price.
      const every = Math.ceil(points.length / TRACE_POINTS);
      return [code, points.filter((_, i) => (points.length - 1 - i) % every === 0).map(({ at, odds }) => ({ at, odds }))];
    }),
  );
}

/**
 * Every city Gemini lists tomorrow's high for, placed at the station that market settles on, with what cover
 * costs there now. `asOf` is null when the prices are Gemini's of this minute, and otherwise says when it last answered.
 */
export async function GET(request: Request) {
  wake(request);
  if (!cached || Date.now() - cached.at > (cached.asOf ? OLD_MS : FRESH_MS)) {
    try {
      // Sized like the examples: to what the pool can lock and a new visitor's test dollars can pay for.
      const affordable = ((await visitorGrant()) - 0.25) / 0.3;
      const budget = await readPool().then((pool) => Math.min(pool.free, affordable), () => affordable);
      const markets = lastGoodMarkets();
      const priced = await cityPrices(markets.list, new Date(), budget);
      // The map is worth showing without its history, so a failure to read that is not a failure of the map.
      const traced = await traces(priced).catch((error) => {
        console.error("price history unavailable", error);
        return new Map<string, MapCity["trace"]>();
      });
      const placed = await Promise.all(
        priced.map(async (city) => {
          const station = await stationFor(city.code).catch(() => null);
          return station && { ...city, latitude: station.latitude, longitude: station.longitude, trace: traced.get(city.code) ?? [] };
        }),
      );
      cached = { at: Date.now(), cities: placed.filter((city) => city !== null), asOf: markets.since() };
    } catch (error) {
      console.error("map unavailable", error);
      return Response.json({ cities: cached?.cities ?? [], asOf: cached?.asOf ?? null });
    }
  }
  return Response.json({ cities: cached.cities, asOf: cached.asOf });
}
