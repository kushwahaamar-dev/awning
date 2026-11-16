"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import useSWR from "swr";
import type { MapCity } from "@/app/api/map/route";
import { calendarDay, cents, percent, usd } from "@/lib/format";

const fetchCities = async (url: string): Promise<MapCity[]> => (await (await fetch(url)).json()).cities ?? [];

// The lower 48, drawn flat: degrees of longitude shrunk to what they span at these latitudes.
const W = 1000;
const H = 540;
const WEST = -125.5;
const EAST = -66;
const NORTH = 50;
const SOUTH = 24;
// Anchorage is off this map, so it sits in the corner the way atlases put it.
const INSET: Record<string, [number, number]> = { ANC: [86, 478] };
// Enough names to read the dots as a country; the rest are named when pointed at.
const NAMED = new Set(["SEA", "SFO", "LA", "PHX", "DEN", "DFW", "HOU", "MSP", "CHI", "ATL", "MIA", "DCA", "NYC", "BOS", "ANC"]);

const place = ({ code, latitude, longitude }: MapCity): [number, number] =>
  INSET[code] ?? [((longitude - WEST) / (EAST - WEST)) * W, ((NORTH - latitude) / (NORTH - SOUTH)) * H];

const radiusOf = (city: MapCity) => (city.example ? 5.5 + Math.min(1, (city.example.odds ?? 0.1) / 0.4) * 5 : 3.5);

type Box = { left: number; top: number; right: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Which side of its dot each city's label goes, so that no label sits on another label or on a dot.
 * The city being pointed at is placed first, then the named ones, then the rest; a label with no
 * room on either side is left off until its city is pointed at.
 */
function labelSides(cities: MapCity[], active: string | undefined) {
  const dots: Box[] = cities.map((city) => {
    const [x, y] = place(city);
    const r = radiusOf(city) + 2;
    return { left: x - r, top: y - r, right: x + r, bottom: y + r };
  });
  const rank = (city: MapCity) => (city.code === active ? 0 : NAMED.has(city.code) ? (city.example ? 1 : 3) : city.example ? 2 : 4);
  const taken: Box[] = [];
  const sides = new Map<string, "right" | "left">();
  for (const city of [...cities].sort((a, b) => rank(a) - rank(b))) {
    const named = NAMED.has(city.code) || city.code === active || !city.example;
    if (!city.example && !NAMED.has(city.code) && city.code !== active) continue;
    const [x, y] = place(city);
    const reach = radiusOf(city) + 7;
    const width = (named ? city.city.length * 6.7 : 0) + (city.example ? cents(city.example.cost).length * 7.6 + (named ? 6 : 0) : 0);
    const self = cities.indexOf(city);
    for (const side of ["right", "left"] as const) {
      const box: Box = side === "right" ? { left: x + reach, top: y - 9, right: x + reach + width, bottom: y + 7 } : { left: x - reach - width, top: y - 9, right: x - reach, bottom: y + 7 };
      const clear = box.left > 0 && box.right < W && !taken.some((other) => overlaps(box, other)) && !dots.some((dot, i) => i !== self && overlaps(box, dot));
      if (clear || (city.code === active && side === "right")) {
        sides.set(city.code, side);
        taken.push(box);
        break;
      }
    }
  }
  return sides;
}

const quoteLink = (city: MapCity) => `/app?exposure=${encodeURIComponent(JSON.stringify(city.example!.exposure))}&from=example`;

/** What cover for one city's bad day costs, as it would read on a quote. */
function Reading({ city }: { city: MapCity }) {
  const { example } = city;
  if (!example) {
    return (
      <>
        <p className="title">{city.city}</p>
        <p className="mt-3 text-muted">Gemini lists tomorrow&rsquo;s high here, but nothing on it is priced like cover right now: each outcome is either near certain or has no seller.</p>
      </>
    );
  }
  return (
    <>
      <p className="flex items-baseline justify-between gap-4 text-sm text-muted">
        <span>{city.city}</span>
        <span className="num">{calendarDay(example.day)}</span>
      </p>
      <p className="title mt-3">
        Pays {usd(example.payout)} if {example.pays}
      </p>
      <dl className="rows mt-4 border-y border-line">
        <div className="flex items-baseline justify-between gap-6 py-2.5 text-muted">
          <dt>The market&rsquo;s odds it happens</dt>
          <dd className="num text-soft">{example.odds === null ? "—" : percent(example.odds)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 py-2.5">
          <dt>What this cover costs</dt>
          <dd className="num text-xl text-accent">{cents(example.cost)}</dd>
        </div>
      </dl>
      <Link href={quoteLink(city)} className="btn btn-primary mt-5 w-full">
        Price cover in {city.city}
      </Link>
    </>
  );
}

/** Every city Gemini lists tomorrow's high for, as a map of what a bad day there costs to cover right now. */
export function PriceMap() {
  const { data: cities = [] } = useSWR("/api/map", fetchCities, { revalidateOnFocus: false });
  const [picked, setPicked] = useState<string | null>(null);
  const priced = cities.filter((city) => city.example);
  // Until someone points at a city, the reading is for the one closest to a one-in-eight day.
  const shown = cities.find((city) => city.code === picked) ?? [...priced].sort((a, b) => Math.abs(a.example!.cost / a.example!.payout - 0.12) - Math.abs(b.example!.cost / b.example!.payout - 0.12))[0];

  const sides = labelSides(cities, shown?.code);

  return (
    <div className="grid items-center gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Cities where tomorrow's high can be covered" className="pricemap w-full max-md:hidden">
        {cities.map((city, i) => {
          const [x, y] = place(city);
          const active = shown?.code === city.code;
          const radius = radiusOf(city);
          const side = sides.get(city.code);
          const named = NAMED.has(city.code) || active || !city.example;
          const label = city.example ? `${city.city}: ${cents(city.example.cost)} covers ${usd(city.example.payout)}` : `${city.city}: nothing priced as cover right now`;
          const dot = (
            <g className={city.example ? "priced" : undefined} style={{ "--i": i } as CSSProperties}>
              {/* A wide invisible target, so a dot is easy to point at. */}
              <circle cx={x} cy={y} r={16} fill="transparent" />
              {active && <circle cx={x} cy={y} r={radius + 7} fill="none" className="stroke-fg" strokeWidth={1.25} />}
              <circle cx={x} cy={y} r={radius} className={city.example ? "fill-accent" : "fill-faint"} fillOpacity={city.example ? (active ? 1 : 0.85) : 0.45} />
              {/* Every priced city wears its price where there is room for it, and its name too if it is one that places the map. */}
              {side && (
                <text x={side === "right" ? x + radius + 7 : x - radius - 7} y={y + 4} textAnchor={side === "right" ? "start" : "end"} className={`text-[12.5px] ${active ? "fill-fg" : "fill-muted"}`}>
                  {named && city.city}
                  {city.example && (
                    <tspan dx={named ? 6 : 0} className={`num ${active ? "fill-accent" : "fill-soft"}`}>
                      {cents(city.example.cost)}
                    </tspan>
                  )}
                </text>
              )}
            </g>
          );
          return city.example ? (
            <a key={city.code} href={quoteLink(city)} aria-label={label} onPointerEnter={() => setPicked(city.code)} onFocus={() => setPicked(city.code)}>
              {dot}
            </a>
          ) : (
            <g key={city.code} role="img" aria-label={label} onPointerEnter={() => setPicked(city.code)}>
              {dot}
            </g>
          );
        })}
      </svg>

      {/* A phone has no room for a map and nothing to point with, so it gets the same prices as a list. */}
      <ul className="rows border-y border-line md:hidden">
        {priced.slice(0, 7).map((city) => (
          <li key={city.code}>
            <Link href={quoteLink(city)} className="flex items-baseline justify-between gap-4 py-3.5 text-soft">
              <span>
                {usd(city.example!.payout)} if {city.example!.pays}
              </span>
              <span className="num text-accent">{cents(city.example!.cost)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="max-md:hidden">
        <div className="panel min-h-[19rem] p-6" aria-live="polite">
          {shown ? <Reading city={shown} /> : <p className="text-muted">Reading Gemini&rsquo;s prices…</p>}
        </div>
        {cities.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Point at a city to read its price. <span className="num text-soft">{priced.length}</span> of{" "}
            <span className="num text-soft">{cities.length}</span> have cover priced right now; the grey ones are near certain tomorrow, or have no
            seller.
          </p>
        )}
      </div>
    </div>
  );
}
