"use client";

import { useState } from "react";
import useSWR from "swr";
import { clock, day } from "@/lib/format";
import type { CostPoint } from "@/lib/odds";
import type { Leg } from "@/lib/hedge/legs";

const W = 480;
const H = 140;
const PAD = { top: 12, right: 44, bottom: 22, left: 4 };

const fetchPoints = async (url: string): Promise<CostPoint[]> => (await (await fetch(url)).json()).points ?? [];
const centsPerDollar = (cost: number) => `${Math.round(cost * 100)}¢`;

/** How the price of $1 of this cover has moved, from Awning's own record of Gemini's book. */
export function CostChart({ legs }: { legs: Leg[] }) {
  const key = `/api/odds?legs=${legs.map((l) => `${l.symbol}:${l.side}`).join(",")}`;
  const { data: points = [] } = useSWR(key, fetchPoints, { refreshInterval: 60_000 });
  const [hover, setHover] = useState<number | null>(null);

  // A line that hasn't moved, or has barely started, tells the owner nothing; the chart waits until there is something to see.
  const costs = points.map((p) => p.cost);
  if (points.length < 5 || Math.max(...costs) === Math.min(...costs)) return null;

  const times = points.map((p) => new Date(p.at).getTime());
  const [t0, t1] = [times[0], times.at(-1)!];
  const top = Math.min(1, Math.max(...points.map((p) => p.cost)) * 1.25 || 0.1);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (cost: number) => PAD.top + (1 - cost / top) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(times[i]).toFixed(1)},${y(p.cost).toFixed(1)}`).join(" ");

  const last = points.at(-1)!;
  const shown = hover === null ? null : points[hover];

  function track(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const t = t0 + (((event.clientX - box.left) / box.width) * W - PAD.left) / (W - PAD.left - PAD.right) * (t1 - t0);
    let nearest = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[nearest] - t)) nearest = i;
    setHover(nearest);
  }

  return (
    <figure className="mt-12 xl:mt-0">
      <figcaption className="title">What $1 of this cover has cost to buy</figcaption>
      <p className="num mt-1 text-sm text-muted" aria-live="polite">
        {shown ? `${centsPerDollar(shown.cost)} at ${clock(shown.at)}, ${day(shown.at)}` : `Since ${clock(points[0].at)}, ${day(points[0].at)}`}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full touch-none"
        role="img"
        aria-label={`Cost per dollar of cover, from ${centsPerDollar(points[0].cost)} to ${centsPerDollar(last.cost)} now`}
        onPointerMove={track}
        onPointerLeave={() => setHover(null)}
      >
        {[0, top / 2, top].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-line" strokeWidth={1} />
            <text x={W - PAD.right + 6} y={y(tick) + 4} className="num fill-faint text-[10px]">
              {centsPerDollar(tick)}
            </text>
          </g>
        ))}
        <path d={`${path} L${x(t1).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z`} className="fill-accent/10" />
        <path d={path} fill="none" className="stroke-accent" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        {shown ? (
          <>
            <line x1={x(times[hover!])} x2={x(times[hover!])} y1={PAD.top} y2={H - PAD.bottom} className="stroke-edge" strokeWidth={1} />
            <circle cx={x(times[hover!])} cy={y(shown.cost)} r={3.5} className="fill-accent stroke-bg" strokeWidth={2} />
          </>
        ) : (
          <circle cx={x(t1)} cy={y(last.cost)} r={3.5} className="fill-accent stroke-bg" strokeWidth={2} />
        )}
        <text x={PAD.left} y={H - 4} className="num fill-faint text-[10px]">
          {clock(points[0].at)}
        </text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" className="num fill-faint text-[10px]">
          now
        </text>
      </svg>
    </figure>
  );
}
