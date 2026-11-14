"use client";

import { useState } from "react";
import type { Deviation, Finding } from "@/lib/discover/analyze";
import { calendarDay, usd } from "@/lib/format";

const W = 720;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 30, left: 52 };

const signed = (n: number) => `${n < 0 ? "−" : "+"}${usd(Math.abs(Math.round(n)))}`;

/** Round numbers to label an axis with, a handful across the span. */
function ticks(lo: number, hi: number, about: number) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => (hi - lo) / s <= about) ?? 10000;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

/**
 * Every day in the data: how hot it got, and how far its takings were from a normal day for that
 * weekday and month. The days the finding is about are picked out in the accent colour.
 */
export function SalesChart({ days, finding }: { days: Deviation[]; finding: Finding }) {
  const [hover, setHover] = useState<number | null>(null);

  const highs = days.map((d) => d.high);
  const [x0, x1] = [Math.min(...highs) - 1, Math.max(...highs) + 1];
  const reach = Math.max(...days.map((d) => Math.abs(d.deviation))) * 1.08;
  const x = (high: number) => PAD.left + ((high - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const y = (deviation: number) => PAD.top + (1 - (deviation + reach) / (2 * reach)) * (H - PAD.top - PAD.bottom);
  // The line sits between the last day that counts and the first that doesn't.
  const edge = x(finding.threshold + (finding.direction === "below" ? 0.5 : -0.5));
  const shown = hover === null ? null : days[hover];

  function track(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const py = ((event.clientY - box.top) / box.height) * H;
    let nearest = 0;
    let best = Infinity;
    days.forEach((d, i) => {
      const gap = (x(d.high) - px) ** 2 + (y(d.deviation) - py) ** 2;
      if (gap < best) [best, nearest] = [gap, i];
    });
    setHover(best < 40 ** 2 ? nearest : null);
  }

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <span className="title">Every day in your sales, by how hot it got</span>
        <span className="flex gap-5 text-sm text-muted">
          <span className="status status-accent">
            {finding.threshold}°F or {finding.direction === "below" ? "below" : "above"}
          </span>
          <span className="status">Other days</span>
        </span>
      </figcaption>
      <p className="num mt-1 h-5 text-sm text-muted" aria-live="polite">
        {shown
          ? `${calendarDay(shown.day)}: high of ${shown.high}°F, took ${usd(Math.round(shown.amount))}, ${signed(shown.deviation)} against a normal day`
          : "Up is a better day than normal for that weekday and month, down is worse."}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full touch-none"
        role="img"
        aria-label={`${finding.badDays} of ${finding.days} days had a high of ${finding.threshold}°F or ${finding.direction === "below" ? "below" : "above"}, and took about ${usd(finding.lossUsd)} less than a normal day.`}
        onPointerMove={track}
        onPointerLeave={() => setHover(null)}
      >
        {ticks(-reach, reach, 5).map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "stroke-edge" : "stroke-line"} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick) + 3.5} textAnchor="end" className="num fill-faint text-[10px]">
              {tick === 0 ? "normal" : signed(tick)}
            </text>
          </g>
        ))}
        {ticks(x0, x1, 8).map((tick) => (
          <text key={tick} x={x(tick)} y={H - 8} textAnchor="middle" className="num fill-faint text-[10px]">
            {tick}°F
          </text>
        ))}
        <line x1={edge} x2={edge} y1={PAD.top} y2={H - PAD.bottom} className="stroke-accent" strokeWidth={1} strokeDasharray="3 4" />
        {days.map((d, i) => (
          <circle
            key={d.day}
            cx={x(d.high)}
            cy={y(d.deviation)}
            r={hover === i ? 5 : 3}
            className={d.bad ? "fill-accent" : "fill-muted"}
            fillOpacity={d.bad ? 0.9 : 0.45}
          />
        ))}
        {shown && <circle cx={x(shown.high)} cy={y(shown.deviation)} r={7} fill="none" className="stroke-fg" strokeWidth={1.5} />}
      </svg>
    </figure>
  );
}
