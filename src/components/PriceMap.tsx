"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import useSWR from "swr";
import type { MapCity } from "@/app/api/map/route";
import { calendarDay, cents, percent, usd } from "@/lib/format";
import { quoteLink, whileEmpty } from "./Risks";

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
/** Where a label goes. `lead` is the line back to its dot, for a label that had to be set away from it. */
type Spot = { x: number; y: number; anchor: "start" | "end" | "middle"; box: Box; lead?: [number, number, number, number] };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const onTheMap = ({ left, top, right, bottom }: Box) => left >= 4 && right <= W - 4 && top >= 2 && bottom <= H - 2;
/** How far apart two boxes are; nothing if they touch. */
const gap = (a: Box, b: Box) => Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom));
/** A lead line as a few small boxes along its length, so it can be checked against dots and labels like anything else. */
const along = ([x1, y1, x2, y2]: NonNullable<Spot["lead"]>): Box[] =>
  [0.25, 0.5, 0.75].map((t) => {
    const [x, y] = [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    return { left: x - 2, top: y - 2, right: x + 2, bottom: y + 2 };
  });

function dotBox(city: MapCity): Box {
  const [x, y] = place(city);
  const r = radiusOf(city) + 2;
  return { left: x - r, top: y - r, right: x + r, bottom: y + r };
}

/**
 * The places a city's label can go, best first: right of its dot, left, above, below, nudged off each of
 * those, and last of all set away from the dot with a line back to it. A label is the name, and the price if there is one.
 */
function spots(city: MapCity): Spot[] {
  const [x, y] = place(city);
  const radius = radiusOf(city);
  // Clear of the ring drawn round a dot that is being pointed at.
  const reach = radius + 13;
  const corner = reach * 0.6;
  const width = city.city.length * 8.7 + (city.example ? 6 + cents(city.example.cost).length * 9.1 : 0);
  const from = (left: number, baseline: number): Box => ({ left, top: baseline - 15, right: left + width, bottom: baseline + 5 });
  const spot = (anchor: Spot["anchor"], at: number, baseline: number): Spot => ({
    x: at,
    y: baseline,
    anchor,
    box: from(anchor === "start" ? at : anchor === "end" ? at - width : at - width / 2, baseline),
  });
  // The line runs from the edge of the dot to the near end of the label, at the height of its letters.
  const away = (anchor: "start" | "end", dx: number, dy: number): Spot => {
    const label = spot(anchor, x + dx, y + dy);
    const [tx, ty] = [x + dx + (anchor === "start" ? -4 : 4), y + dy - 5];
    const length = Math.hypot(tx - x, ty - y);
    return { ...label, lead: [x + ((tx - x) / length) * (radius + 3), y + ((ty - y) / length) * (radius + 3), tx, ty] };
  };
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
    away("start", 30, 36),
    away("start", 30, -26),
    away("end", -30, 36),
    away("end", -30, -26),
    away("start", 46, 56),
    away("start", 46, -46),
    away("end", -46, 56),
    away("end", -46, -46),
  ];
}

// Labels keep this much air between them, so two never read as one line.
const apart = ({ left, top, right, bottom }: Box): Box => ({ left: left - 7, top, right: right + 7, bottom });

/**
 * Whether a label can go here, other labels aside: on the map, off every other dot, and plainly this
 * city's. A label beside its dot must be nearer that dot than any other, or it reads as the other's;
 * one set away is tied to its dot by a line, which must not cross a dot, and still keeps clear of them.
 */
function sits(city: MapCity, spot: Spot, cities: MapCity[]) {
  if (!onTheMap(spot.box)) return false;
  const own = gap(spot.box, dotBox(city));
  const line = spot.lead ? along(spot.lead) : [];
  return cities.every((other) => {
    if (other === city) return true;
    const dot = dotBox(other);
    if (overlaps(spot.box, dot) || line.some((piece) => overlaps(piece, dot))) return false;
    // Only another priced city could be taken for the owner of a price; a gray dot never carries one.
    if (!other.example || !city.example) return true;
    return gap(spot.box, dot) >= (spot.lead ? 8 : own);
  });
}

/** Whether two labels would run into each other, counting the line either of them is tied by. */
const clash = (a: Spot, b: Spot) =>
  overlaps(apart(a.box), b.box) || (a.lead ? along(a.lead).some((piece) => overlaps(piece, b.box)) : false) || (b.lead ? along(b.lead).some((piece) => overlaps(piece, a.box)) : false);

/**
 * Where each city's label sits while nothing is pointed at: on the map, on no other label or dot,
 * and nearer its own dot than anyone else's. Priced cities go first. One with no room anywhere goes
 * without until it is pointed at; a price is never shown without its city's name.
 */
function restLabels(cities: MapCity[]) {
  const placed = new Map<string, Spot>();
  const rank = (city: MapCity) => (city.example ? (NAMED.has(city.code) ? 0 : 1) : 2);
  const wanted = cities.filter((city) => city.example || NAMED.has(city.code)).sort((a, b) => rank(a) - rank(b));
  // The labels already down that this one would run into.
  const inTheWay = (spot: Spot) => [...placed].filter(([, other]) => clash(spot, other)).map(([code]) => code);
  // At rest a label goes right beside its dot or not at all. The places set away on a line are kept for
  // the city being pointed at, where one odd label is no clutter.
  const beside = (city: MapCity) => spots(city).slice(0, 12);
  const roomFor = (city: MapCity) => beside(city).find((spot) => sits(city, spot, cities) && inTheWay(spot).length === 0);

  for (const city of wanted) {
    const spot = roomFor(city);
    if (spot) placed.set(city.code, spot);
  }
  // A city left without a label gets a second chance: where one neighbour's label is all that is in
  // its way, and that neighbour has somewhere else to go, the neighbour moves over.
  for (const city of wanted) {
    if (placed.has(city.code)) continue;
    for (const spot of beside(city).filter((each) => sits(city, each, cities))) {
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

/** Where the label of a city being pointed at goes when it has no place of its own: anywhere it sits, whatever labels are there. */
function spotFor(city: MapCity, cities: MapCity[]) {
  const all = spots(city);
  return all.find((spot) => sits(city, spot, cities)) ?? all.find(({ box }) => onTheMap(box)) ?? all[0];
}

/** The priced city an arrow key leads to: the nearest one that is mostly that way and least to the side. */
function towards(from: MapCity, priced: MapCity[], dx: number, dy: number) {
  const [x, y] = place(from);
  let best: MapCity | undefined;
  let least = Infinity;
  for (const city of priced) {
    if (city === from) continue;
    const [cx, cy] = place(city);
    const ahead = (cx - x) * dx + (cy - y) * dy;
    if (ahead <= 0) continue;
    const aside = Math.abs((cx - x) * dy) + Math.abs((cy - y) * dx);
    const far = ahead + aside * 2;
    if (far < least) [best, least] = [city, far];
  }
  return best;
}

function Label({ city, spot, lit = false }: { city: MapCity; spot: Spot; lit?: boolean }) {
  return (
    <>
      {spot.lead && <line x1={spot.lead[0]} y1={spot.lead[1]} x2={spot.lead[2]} y2={spot.lead[3]} className={lit ? "stroke-soft" : "stroke-faint"} strokeWidth={1} />}
      <text x={spot.x} y={spot.y} textAnchor={spot.anchor} className={lit ? "fill-fg font-medium" : "fill-muted"}>
        {city.city}
        {city.example && (
          <tspan dx={6} className={`num ${lit ? "fill-fg" : "fill-soft"}`}>
            {cents(city.example.cost)}
          </tspan>
        )}
      </text>
    </>
  );
}

/** What cover for one city's bad day costs, as it would read on a quote: the cover on the card, its price and the way to it on the white one inside. */
function Reading({ city }: { city: MapCity }) {
  const { example } = city;
  return (
    <div className="panel grid gap-1.5 p-1.5 sm:grid-cols-2 xl:grid-cols-1">
      <div className="p-4 sm:p-5">
        <p className="flex items-baseline justify-between gap-4 text-sm text-muted">
          <span>{city.city}</span>
          {example && <span className="num">{calendarDay(example.day)}</span>}
        </p>
        {/* Room for two lines whichever city it is, so the card is one height as the pointer moves across the map. */}
        <p className="title mt-2 min-h-12">{example ? `Pays ${usd(example.payout)} if ${example.pays}` : "Nothing here is priced like cover right now."}</p>
      </div>
      <div className="inset p-4 sm:p-5">
        {example ? (
          <>
            <dl className="rows">
              <div className="flex items-baseline justify-between gap-6 pb-2 text-muted">
                <dt>The market&rsquo;s odds</dt>
                <dd className="num text-fg">{example.odds === null ? "—" : percent(example.odds)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-6 pt-2">
                <dt>Covering it costs</dt>
                <dd className="num text-xl font-medium">{cents(example.cost)}</dd>
              </div>
            </dl>
            <Link href={quoteLink(example)} className="btn btn-primary mt-4 w-full">
              Cover this day
            </Link>
          </>
        ) : (
          <>
            <p className="copy">Gemini lists tomorrow&rsquo;s high here, but each outcome is either near certain or has no seller.</p>
            <Link href="/app" className="btn btn-secondary mt-4 w-full">
              Name a bad day of your own
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/** How far a city's cover is from the price of a one-in-eight day: the day cover is most plainly worth having. */
const fromTelling = ({ example }: MapCity) => Math.abs(example!.cost / example!.payout - 0.12);

/** Every city Gemini lists tomorrow's high for, as a map of what a bad day there costs to cover right now. */
export function PriceMap() {
  const { data } = useSWR("/api/map", fetchCities, { revalidateOnFocus: false, refreshInterval: whileEmpty });
  const cities = data ?? NONE;
  const [picked, setPicked] = useState<string | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  // The labels at rest, and the priced cities from west to east.
  const { rest, priced } = useMemo(
    () => ({ rest: restLabels(cities), priced: cities.filter((city) => city.example).sort((a, b) => place(a)[0] - place(b)[0]) }),
    [cities],
  );
  const telling = useMemo(() => [...priced].sort((a, b) => fromTelling(a) - fromTelling(b)), [priced]);
  // Until someone points at a city, the reading is for the most telling one.
  const shown = cities.find((city) => city.code === picked) ?? telling[0];
  const spot = shown && (rest.get(shown.code) ?? spotFor(shown, cities));
  // One stop for the Tab key, however many cities there are.
  const stop = shown?.example ? shown.code : priced[0]?.code;

  // An arrow key goes to the nearest priced city in the direction it points, the way the map reads.
  function walk(event: KeyboardEvent<SVGSVGElement>) {
    const way = ({ ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] } as Record<string, [number, number]>)[event.key];
    if (!way && event.key !== "Home" && event.key !== "End") return;
    // The page stays where it is while the keys are moving round the map, even at its edge.
    event.preventDefault();
    const from = shown?.example ? shown : priced[0];
    const next = event.key === "Home" ? priced[0] : event.key === "End" ? priced.at(-1) : from && towards(from, priced, ...way);
    if (!next) return;
    setPicked(next.code);
    links.current.get(next.code)?.focus();
  }

  // Gemini answered with nothing at all, which it does when it is having trouble. A map with no cities on it would only look broken.
  if (data?.length === 0) return <p className="note">Gemini&rsquo;s prices aren&rsquo;t coming through right now. The map fills in by itself when they do.</p>;

  return (
    // Beside the map on a wide screen, the reading for the city pointed at; under it on a narrower one, where the map needs the whole width to name its cities.
    <div className="grid items-start gap-x-12 gap-y-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label="Cities where tomorrow’s high can be covered. The arrow keys move from city to city."
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
                <circle cx={x} cy={y} r={radius} className={city.example ? "fill-fg" : "fill-faint"} fillOpacity={city.example ? (active ? 1 : 0.85) : 0.45} />
                {/* Its label steps aside while the city being pointed at needs the room. */}
                {own && !active && !(spot && clash(own, spot)) && <Label city={city} spot={own} />}
              </>
            );
            return city.example ? (
              <a
                key={city.code}
                ref={(link) => {
                  if (link) links.current.set(city.code, link);
                  else links.current.delete(city.code);
                }}
                href={quoteLink(city.example)}
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

        {/* A small screen has no room for a map and nothing to point with, so it gets the most telling of the same prices as a list. */}
        <ul className="rows border-y border-line lg:hidden">
        {/* Until the prices arrive the rows hold their room, so the page below doesn’t jump when they do. */}
        {cities.length === 0 &&
          Array.from({ length: 8 }, (_, i) => (
            <li key={i} aria-hidden className="invisible py-2.5 leading-snug">
              <p>San Antonio</p>
              <p className="text-sm">60°F or below</p>
            </li>
          ))}
        {telling.slice(0, 8).map(({ code, city, example }) => {
          const { trigger } = example!.exposure;
          return (
            <li key={code}>
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
      </div>

      <div>
        <div className="max-lg:hidden" aria-live="polite">
          {shown ? <Reading city={shown} /> : <p className="panel min-h-[9.75rem] p-5 text-muted xl:min-h-[17rem]">Reading Gemini&rsquo;s prices…</p>}
        </div>
        {/* There from the start, unseen until there are numbers to put in it, so nothing under the map moves when they come. */}
        <p className={`copy lg:mt-4 ${cities.length ? "" : "invisible"}`}>
          <span className="max-lg:hidden">Point at a city to read its price. </span>
          {priced.length} of the {cities.length} cities Gemini lists have cover priced right now. In the rest, tomorrow is near certain or nobody is selling.
        </p>
      </div>
    </div>
  );
}
