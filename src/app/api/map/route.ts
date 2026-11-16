import { VISITOR_GRANT_USD, readPool } from "@/lib/chain/server";
import { listMarkets } from "@/lib/gemini/client";
import { cityPrices, type CityPrice } from "@/lib/hedge/examples";
import { stationFor } from "@/lib/weather/stations";

export type MapCity = CityPrice & { latitude: number; longitude: number };

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; cities: MapCity[] } | null = null;

/** Every city Gemini lists tomorrow's high for, placed at the station that market settles on, with what cover costs there now. */
export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    try {
      // Sized like the examples: to what the pool can lock and a new visitor's test dollars can pay for.
      const affordable = (VISITOR_GRANT_USD - 0.25) / 0.3;
      const budget = await readPool().then((pool) => Math.min(pool.free, affordable), () => affordable);
      const priced = await cityPrices(listMarkets, new Date(), budget);
      const placed = await Promise.all(
        priced.map(async (city) => {
          const station = await stationFor(city.code).catch(() => null);
          return station && { ...city, latitude: station.latitude, longitude: station.longitude };
        }),
      );
      cached = { at: Date.now(), cities: placed.filter((city) => city !== null) };
    } catch (error) {
      console.error("map unavailable", error);
      return Response.json({ cities: cached?.cities ?? [] });
    }
  }
  return Response.json({ cities: cached.cities });
}
