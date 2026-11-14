import type { Station } from "../weather/stations";

/**
 * The daily high at a station for each day in a span, in °F, from Open-Meteo's archive. This is a
 * reanalysis for the station's location, not the station's own log, so a day can differ from the
 * official reading by a degree or two.
 */
export async function dailyHighs(station: Station, from: string, to: string): Promise<Map<string, number>> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.search = new URLSearchParams({
    latitude: String(station.latitude),
    longitude: String(station.longitude),
    start_date: from,
    end_date: to,
    daily: "temperature_2m_max",
    temperature_unit: "fahrenheit",
    timezone: station.timezone,
  }).toString();

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`The weather archive responded ${res.status}`);
  const { daily } = (await res.json()) as { daily: { time: string[]; temperature_2m_max: (number | null)[] } };

  const highs = new Map<string, number>();
  daily.time.forEach((day, i) => {
    const high = daily.temperature_2m_max[i];
    if (high !== null) highs.set(day, high);
  });
  return highs;
}
