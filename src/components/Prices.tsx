"use client";

import Link from "next/link";
import useSWR from "swr";
import type { MapCity } from "@/app/api/map/route";
import { cents, usd } from "@/lib/format";
import { quoteLink } from "./Risks";

const fetchCities = async (url: string): Promise<MapCity[]> => (await (await fetch(url)).json()).cities ?? [];

/** Every city where a bad day tomorrow can be covered right now, with what it costs. Each is a way in to its quote. */
export function Prices() {
  const { data: cities } = useSWR("/api/map", fetchCities, { revalidateOnFocus: false });
  const priced = (cities ?? []).filter((city) => city.example !== null).sort((a, b) => a.city.localeCompare(b.city));

  if (cities && priced.length === 0) return <p className="copy">Nothing is priced sensibly this minute. Gemini lists tomorrow’s high in {cities.length} cities; try again shortly.</p>;

  return (
    // Until the prices are read the table holds the room it will need, so what is under it stays put.
    <div className="min-h-[38rem]" aria-busy={!cities}>
      <ul className="gap-x-10 sm:columns-2">
        {priced.map(({ city, example }) => {
          const { trigger } = example!.exposure;
          return (
            <li key={city} className="break-inside-avoid border-b border-line">
              <Link href={quoteLink(example!)} className="grid grid-cols-[1fr_auto] gap-x-4 py-2.5 leading-snug">
                <span className="link justify-self-start">{city}</span>
                <span className="num text-right">{cents(example!.cost)}</span>
                <span className="text-sm text-muted">{trigger.family === "temperature" && `${trigger.threshold}°F or ${trigger.direction}`}</span>
                <span className="num text-right text-sm text-muted">pays {usd(example!.payout)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {cities && (
        <p className="copy mt-4">
          {priced.length} of the {cities.length} cities Gemini lists have a bad day worth covering tomorrow. In the rest it is near certain, or nobody is selling.
        </p>
      )}
    </div>
  );
}
