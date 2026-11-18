"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cents, usd } from "@/lib/format";
import { kindOf, quoteLink, useExamples } from "./Risks";
import { Scene, type SceneName } from "./Scene";
import { Sketch } from "./Sketch";

// The bad days the ruler runs through, with the colour its marks take near each one, and what stands in for a
// live example of it when Gemini has none worth showing.
const DAYS: { kind: SceneName; name: string; tint: [red: number, green: number, blue: number]; typical: string }[] = [
  { kind: "cold", name: "Cold snap", tint: [84, 150, 222], typical: "If it’s too cold to sit outside tomorrow, my patio is out $300." },
  { kind: "hot", name: "Heat wave", tint: [238, 132, 52], typical: "If it’s too hot for soup tomorrow, my counter sells $400 less." },
  { kind: "fuel", name: "Fuel spike", tint: [140, 108, 214], typical: "If oil jumps tomorrow, my delivery vans cost me $1,500 more." },
];
const TICKS = 49;
const MOVES_ON_MS = 8000;

/** The colour of the ruler at a point along it: each bad day's own, run into the next. */
function tintAt(along: number) {
  const between = along * (DAYS.length - 1);
  const from = Math.min(DAYS.length - 2, Math.floor(between));
  const mix = between - from;
  const [r, g, b] = DAYS[from].tint.map((channel, i) => Math.round(channel + (DAYS[from + 1].tint[i] - channel) * mix));
  return `rgb(${r} ${g} ${b})`;
}

/**
 * The product at work before anyone asks: a picture of a bad day, a ruler to drag from one bad day to the
 * next, and under it what covering that day pays and costs on Gemini this minute. Left alone it moves on by
 * itself, until someone takes hold of it.
 */
export function BadDays() {
  const examples = useExamples() ?? [];
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const day = DAYS[at];
  const example = examples.find((each) => kindOf(each.exposure.trigger) === day.kind);

  useEffect(() => {
    if (held || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => !document.hidden && setAt((at + 1) % DAYS.length), MOVES_ON_MS);
    return () => clearTimeout(timer);
  }, [at, held]);

  const choose = (index: number) => {
    setHeld(true);
    setAt(index);
  };

  return (
    <figure>
      {/* The picture is wider than the words above it. Every scene lies in the same place, and the one for the day chosen shows through. */}
      <div className="scene relative aspect-video bg-[#0b0b0c] sm:-mx-10">
        {DAYS.map(({ kind }, i) => (
          <Scene key={kind} of={kind} playing={i === at} className={`absolute inset-0 transition-opacity duration-700 ${i === at ? "" : "opacity-0"}`} />
        ))}
      </div>

      <div className="ruler mt-3">
        <div aria-hidden className="ruler-ticks">
          {Array.from({ length: TICKS }, (_, i) => (
            <i key={i} style={{ background: tintAt(i / (TICKS - 1)) }} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={DAYS.length - 1}
          step={1}
          value={at}
          aria-label="A bad day"
          aria-valuetext={day.name}
          onChange={(event) => choose(Number(event.target.value))}
        />
        <span className="ruler-marker" style={{ "--at": at / (DAYS.length - 1) } as React.CSSProperties}>
          <Sketch of={day.kind} small className="w-7" />
        </span>
      </div>
      <div className="flex justify-between text-sm">
        {DAYS.map(({ name }, i) => (
          <button key={name} type="button" onClick={() => choose(i)} aria-pressed={i === at} className={`py-1 transition-colors ${i === at ? "text-fg" : "text-faint hover:text-fg"}`}>
            {name}
          </button>
        ))}
      </div>

      {/* What that day costs to cover. It keeps the room its longest version needs, so nothing under it moves. */}
      <figcaption aria-live="polite" className="mt-6 flex min-h-[6.5rem] flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="max-w-md">
          <p>&ldquo;{example?.text ?? day.typical}&rdquo;</p>
          {example && (
            <p className="mt-1 text-muted">
              Covering it pays <span className="num text-fg">{usd(example.payout)}</span> and costs <span className="num text-fg">{cents(example.cost)}</span> right now.
            </p>
          )}
        </div>
        <Link href={example ? quoteLink(example) : `/app?risk=${encodeURIComponent(day.typical)}`} className="btn btn-secondary">
          Cover this day
        </Link>
      </figcaption>
    </figure>
  );
}
