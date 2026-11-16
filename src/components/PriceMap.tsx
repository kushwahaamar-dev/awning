"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import useSWR from "swr";
import type { MapCity } from "@/app/api/map/route";
import { calendarDay, cents, percent, usd } from "@/lib/format";

const NONE: MapCity[] = [];
const fetchCities = async (url: string): Promise<MapCity[]> => (await (await fetch(url)).json()).cities ?? NONE;

// The lower 48, drawn flat: degrees of longitude shrunk to what they span at these latitudes.
const W = 1000;
const H = 540;
// Set a little east of the coast: the Pacific side has room to spare, and the north-east needs it for its labels.
const WEST = -123.8;
const EAST = -64.3;
const NORTH = 50;
const SOUTH = 24;
// Anchorage is off this map, so it sits in the corner the way atlases put it.
const INSET: Record<string, [number, number]> = { ANC: [86, 478] };
// Cities named even when nothing is priced there, so the dots read as a country.
const NAMED = new Set(["SEA", "SFO", "LA", "PHX", "DEN", "DFW", "HOU", "MSP", "CHI", "ATL", "MIA", "DCA", "NYC", "BOS", "ANC"]);

const place = ({ code, latitude, longitude }: MapCity): [number, number] =>
  INSET[code] ?? [((longitude - WEST) / (EAST - WEST)) * W, ((NORTH - latitude) / (NORTH - SOUTH)) * H];

const radiusOf = (city: MapCity) => (city.example ? 5.5 + Math.min(1, (city.example.odds ?? 0.1) / 0.4) * 5 : 3.5);

type Box = { left: number; top: number; right: number; bottom: number };
type Spot = { x: number; y: number; anchor: "start" | "end" | "middle"; box: Box };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const onTheMap = ({ left, top, right, bottom }: Box) => left >= 4 && right <= W - 4 && top >= 2 && bottom <= H - 2;

function dotBox(city: MapCity): Box {
  const [x, y] = place(city);
  const r = radiusOf(city) + 2;
  return { left: x - r, top: y - r, right: x + r, bottom: y + r };
}

/** The places a city's label can go, best first: right of its dot, left, above, below, then nudged off each of those. A label is the name, and the price if there is one. */
function spots(city: MapCity): Spot[] {
  const [x, y] = place(city);
  // Clear of the ring drawn round a dot that is being pointed at.
  const reach = radiusOf(city) + 11;
  const corner = reach * 0.6;
  const width = city.city.length * 8.7 + (city.example ? 6 + cents(city.example.cost).length * 9.1 : 0);
  const from = (left: number, baseline: number): Box => ({ left, top: baseline - 15, right: left + width, bottom: baseline + 5 });
  const spot = (anchor: Spot["anchor"], at: number, baseline: number): Spot => ({
    x: at,
    y: baseline,
    anchor,
    box: from(anchor === "start" ? at : anchor === "end" ? at - width : at - width / 2, baseline),
  });
  return [
    spot("start", x + reach, y + 5),
    spot("end", x - reach, y + 5),
    spot("middle", x, y - reach - 1),
    spot("middle", x, y + reach + 12),
    spot("start", x + reach - 2, y + 15),
    spot("start", x + reach - 2, y - 5),
    spot("end", x - reach + 2, y + 15),
    spot("end", x - reach + 2, y - 5),
    spot("start", x + corner, y - corner - 3),
    spot("start", x + corner, y + corner + 12),
    spot("end", x - corner, y - corner - 3),
    spot("end", x - corner, y + corner + 12),
  ];
}

// Labels keep this much air between them, so two never read as one line.
const apart = ({ left, top, right, bottom }: Box): Box => ({ left: left - 7, top, right: right + 7, bottom });

/**
 * Where each city's label sits while nothing is pointed at: on the map, and on no other label or dot.
 * Priced cities go first. One with no room anywhere goes without until it is pointed at; a price is
 * never shown without its city's name.
 */
function restLabels(cities: MapCity[]) {
  const dots = cities.map(dotBox);
  const placed = new Map<string, Spot>();
  const rank = (city: MapCity) => (city.example ? (NAMED.has(city.code) ? 0 : 1) : 2);
  const wanted = cities.filter((city) => city.example || NAMED.has(city.code)).sort((a, b) => rank(a) - rank(b));
  // On the map, and clear of every dot but the city's own.
  const sits = (city: MapCity, { box }: Spot) => onTheMap(box) && !dots.some((dot, i) => cities[i] !== city && overlaps(box, dot));
  // The labels already down that this one would run into.
  const inTheWay = ({ box }: Spot) => [...placed].filter(([, other]) => overlaps(apart(box), other.box)).map(([code]) => code);
  const roomFor = (city: MapCity) => spots(city).find((spot) => sits(city, spot) && inTheWay(spot).length === 0);

  for (const city of wanted) {
    const spot = roomFor(city);
    if (spot) placed.set(city.code, spot);
  }
  // A city left without a label gets a second chance: where one neighbour's label is all that is in
  // its way, and that neighbour has somewhere else to go, the neighbour moves over.
  for (const city of wanted) {
    if (placed.has(city.code)) continue;
    for (const spot of spots(city).filter((each) => sits(city, each))) {
      const [blocker, ...more] = inTheWay(spot);
      if (!blocker || more.length) continue;
      const neighbour = cities.find((other) => other.code === blocker)!;
      const was = placed.get(blocker)!;
      placed.delete(blocker);
      placed.set(city.code, spot);
      const moved = roomFor(neighbour);
      if (moved) {
        placed.set(blocker, moved);
        break;
      }
      placed.delete(city.code);
      placed.set(blocker, was);
    }
  }
  return placed;
}

/** Where the label of a city being pointed at goes when it has no place of its own: on the map, and off the other dots if it can be. */
function spotFor(city: MapCity, cities: MapCity[]) {
  const dots = cities.filter((other) => other !== city).map(dotBox);
  const all = spots(city);
  return all.find(({ box }) => onTheMap(box) && !dots.some((dot) => overlaps(box, dot))) ?? all.find(({ box }) => onTheMap(box)) ?? all[0];
}

const quoteLink = (city: MapCity) => `/app?exposure=${encodeURIComponent(JSON.stringify(city.example!.exposure))}&from=example`;

function Label({ city, spot, lit = false }: { city: MapCity; spot: Spot; lit?: boolean }) {
  return (
    <text x={spot.x} y={spot.y} textAnchor={spot.anchor} className={lit ? "fill-fg" : "fill-muted"}>
      {city.city}
      {city.example && (
        <tspan dx={6} className={`num ${lit ? "fill-accent" : "fill-soft"}`}>
          {cents(city.example.cost)}
        </tspan>
      )}
    </text>
  );
}

/** What cover for one city's bad day costs, as it would read on a quote: the cover, then its price and the way to it. */
function Reading({ city }: { city: MapCity }) {
  const { example } = city;
  if (!example) {
    return (
      <>
        <div>
          <p className="title">{city.city}</p>
          <p className="mt-3 text-muted">
            Gemini lists tomorrow&rsquo;s high here, but nothing on it is priced like cover right now: each outcome is either near certain or has
            no seller.
          </p>
        </div>
        <div className="mt-auto pt-5 lg:max-xl:pt-0">
          <Link href="/app" className="btn btn-secondary w-full">
            Describe a risk of your own
          </Link>
        </div>
      </>
    );
  }
  return (
    <>
      <div>
        <p className="flex items-baseline justify-between gap-4 text-sm text-muted">
          <span>{city.city}</span>
          <span className="num">{calendarDay(example.day)}</span>
        </p>
        <p className="title mt-3">
          Pays {usd(example.payout)} if {example.pays}
        </p>
      </div>
      <div className="mt-4 flex grow flex-col lg:max-xl:mt-0">
        <dl className="rows border-y border-line">
          <div className="flex items-baseline justify-between gap-6 py-2.5 text-muted">
            <dt>The market&rsquo;s odds it happens</dt>
            <dd className="num text-soft">{example.odds === null ? "—" : percent(example.odds)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 py-2.5">
            <dt>What this cover costs</dt>
            <dd className="num text-xl text-accent">{cents(example.cost)}</dd>
          </div>
        </dl>
        <div className="mt-auto pt-5">
          <Link href={quoteLink(city)} className="btn btn-primary w-full">
            Price cover in {city.city}
          </Link>
        </div>
      </div>
    </>
  );
}

/** Every city Gemini lists tomorrow's high for, as a map of what a bad day there costs to cover right now. */
export function PriceMap() {
  const { data: cities = NONE } = useSWR("/api/map", fetchCities, { revalidateOnFocus: false });
  const [picked, setPicked] = useState<string | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  // The labels at rest, and the priced cities from west to east, which is the order the arrow keys walk them in.
  const { rest, priced } = useMemo(
    () => ({ rest: restLabels(cities), priced: cities.filter((city) => city.example).sort((a, b) => place(a)[0] - place(b)[0]) }),
    [cities],
  );
  // Until someone points at a city, the reading is for the one closest to a one-in-eight day.
  const shown = cities.find((city) => city.code === picked) ?? [...priced].sort((a, b) => Math.abs(a.example!.cost / a.example!.payout - 0.12) - Math.abs(b.example!.cost / b.example!.payout - 0.12))[0];
  const spot = shown && (rest.get(shown.code) ?? spotFor(shown, cities));
  // One stop for the Tab key, however many cities there are.
  const stop = shown?.example ? shown.code : priced[0]?.code;

  function walk(event: KeyboardEvent<SVGSVGElement>) {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key];
    const at = priced.findIndex((city) => city.code === shown?.code);
    const next = event.key === "Home" ? priced[0] : event.key === "End" ? priced.at(-1) : step ? priced[(at + step + priced.length) % priced.length] : undefined;
    if (!next) return;
    event.preventDefault();
    setPicked(next.code);
    links.current.get(next.code)?.focus();
  }

  return (
    <div className="grid items-center gap-x-14 gap-y-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label="Cities where tomorrow's high can be covered. The arrow keys move from city to city."
        className="pricemap w-full max-lg:hidden"
        onKeyDown={walk}
      >
        {cities.map((city) => {
          const [x, y] = place(city);
          const active = shown?.code === city.code;
          const radius = radiusOf(city);
          const label = city.example ? `${city.city}: ${cents(city.example.cost)} covers ${usd(city.example.payout)}` : `${city.city}: nothing priced as cover right now`;
          const own = rest.get(city.code);
          const dot = (
            <>
              {/* A wide invisible target, so a dot is easy to point at. */}
              <circle cx={x} cy={y} r={16} fill="transparent" />
              {active && <circle cx={x} cy={y} r={radius + 7} fill="none" className="ring stroke-fg" strokeWidth={1.25} />}
              <circle cx={x} cy={y} r={radius} className={city.example ? "fill-accent" : "fill-faint"} fillOpacity={city.example ? (active ? 1 : 0.85) : 0.45} />
              {/* Its label steps aside while the city being pointed at needs the room. */}
              {own && !active && !(spot && overlaps(own.box, spot.box)) && <Label city={city} spot={own} />}
            </>
          );
          return city.example ? (
            <a
              key={city.code}
              ref={(link) => {
                if (link) links.current.set(city.code, link);
                else links.current.delete(city.code);
              }}
              href={quoteLink(city)}
              tabIndex={city.code === stop ? 0 : -1}
              aria-label={label}
              onPointerEnter={() => setPicked(city.code)}
              onFocus={() => setPicked(city.code)}
            >
              {dot}
            </a>
          ) : (
            <g key={city.code} role="img" aria-label={label} onPointerEnter={() => setPicked(city.code)}>
              {dot}
            </g>
          );
        })}
        {/* The city being pointed at is named last, so it is drawn over everything else, in the place its label always has if it has one. */}
        {shown && spot && (
          <g aria-hidden className="pointer-events-none">
            <Label city={shown} spot={spot} lit />
          </g>
        )}
      </svg>

      {/* A small screen has no room for a map and nothing to point with, so it gets the same prices as a list. */}
      <ul className="rows border-y border-line lg:hidden">
        {/* Until the prices arrive the rows hold their room, so the page below doesn't jump when they do. */}
        {cities.length === 0 &&
          Array.from({ length: 7 }, (_, i) => (
            <li key={i} aria-hidden className="invisible flex items-baseline justify-between gap-4 py-3.5">
              <span className="text-balance">Pays $300 if San Antonio&rsquo;s high is 60°F or below</span>
              <span className="num">$00.00</span>
            </li>
          ))}
        {priced.slice(0, 7).map((city) => (
          <li key={city.code}>
            <Link href={quoteLink(city)} className="flex items-baseline justify-between gap-4 py-3.5 text-soft">
              <span className="text-balance">
                Pays {usd(city.example!.payout)} if {city.example!.pays}
              </span>
              <span className="num text-accent">{cents(city.example!.cost)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Beside the map on a wide screen, as a column; under it on a narrower one, lying flat across the width. */}
      <div className="max-lg:hidden">
        <div className="panel flex min-h-[19rem] flex-col p-6 lg:max-xl:grid lg:max-xl:min-h-0 lg:max-xl:grid-cols-2 lg:max-xl:items-center lg:max-xl:gap-x-14" aria-live="polite">
          {shown ? <Reading city={shown} /> : <p className="text-muted">Reading Gemini&rsquo;s prices…</p>}
        </div>
        {cities.length > 0 && (
          <p className="mt-4 max-w-md text-sm text-muted lg:max-xl:max-w-none">
            Point at a city to read its price. <span className="num text-soft">{priced.length}</span> of{" "}
            <span className="num text-soft">{cities.length}</span> have cover priced right now; the grey ones are near certain tomorrow, or have no
            seller.
          </p>
        )}
      </div>
    </div>
  );
}
