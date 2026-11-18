import type { Station } from "../weather/stations";

type Daily = { time: string[]; temperature_2m_max: (number | null)[] };
const TRIES = 3;
// The archive has been seen to fail on a whole year asked for at once and answer for a few months, so a span is asked for in stretches of this many days.
const STRETCH_DAYS = 120;
const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A span of days cut into stretches short enough for the archive, each as its first and last day. */
function stretches(from: string, to: string) {
  const out: [from: string, to: string][] = [];
  const end = Date.parse(to);
  for (let start = Date.parse(from); start <= end; start += STRETCH_DAYS * DAY_MS) out.push([isoDay(start), isoDay(Math.min(end, start + (STRETCH_DAYS - 1) * DAY_MS))]);
  return out;
}

/**
 * The archive is a free public service. Now and then it answers with an error, or with words where the
 * figures should be, and answers properly when asked again; so it is asked up to three times.
 */
async function ask(url: URL): Promise<Daily> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    const body: { daily?: Daily } | null = res?.ok ? await res.json().catch(() => null) : null;
    if (body?.daily) return body.daily;
    if (attempt === TRIES) throw new Error("The weather archive isn’t answering right now. Try again in a minute.");
    await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
  }
}

/**
 * The daily high at a station for each day in a span, in °F, from Open-Meteo's archive. This is a
 * reanalysis for the station's location, not the station's own log, so a day can differ from the
 * official reading by a degree or two.
 */
export async function dailyHighs(station: Station, from: string, to: string): Promise<Map<string, number>> {
  const parts = await Promise.all(
    stretches(from, to).map(([start, end]) => {
      const url = new URL("https://archive-api.open-meteo.com/v1/archive");
      url.search = new URLSearchParams({
        latitude: String(station.latitude),
        longitude: String(station.longitude),
        start_date: start,
        end_date: end,
        daily: "temperature_2m_max",
        temperature_unit: "fahrenheit",
        timezone: station.timezone,
      }).toString();
      return ask(url);
    }),
  );

  const highs = new Map<string, number>();
  for (const daily of parts) {
    daily.time.forEach((day, i) => {
      const high = daily.temperature_2m_max[i];
      if (high !== null) highs.set(day, high);
    });
  }
  return highs;
}
