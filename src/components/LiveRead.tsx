"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import useSWR from "swr";
import type { Example } from "@/lib/hedge/examples";
import { calendarDay, cents, percent, usd } from "@/lib/format";
import { fetchExamples } from "./Ask";

// The reading plays out in beats: the sentence is typed, each thing found in it lights up, then the cover and its price.
const TICK_MS = 40;
const CHARS_PER_TICK = 2;
const BEAT = 9;
const HOLD = 160;

type Part = { text: string; lit: boolean; start: number };

/** The sentence, cut at what Awning finds in it: the place, what has to happen, and the loss. */
function parts({ text, exposure: { trigger, lossUsd } }: Example): Part[] {
  const phrases =
    trigger.family === "temperature"
      ? [trigger.city, `${trigger.threshold}°F or ${trigger.direction}`, usd(lossUsd)]
      : trigger.family === "price"
        ? [usd(trigger.threshold), usd(lossUsd)]
        : [trigger.team, usd(lossUsd)];
  const out: Part[] = [];
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    if (at < 0) continue;
    if (at > from) out.push({ text: text.slice(from, at), lit: false, start: from });
    out.push({ text: phrase, lit: true, start: at });
    from = at + phrase.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), lit: false, start: from });
  return out;
}

/** The same sentence as the three facts a market can be matched on. */
function facts({ exposure: { trigger, lossUsd } }: Example) {
  const happens =
    trigger.family === "temperature"
      ? { where: trigger.city, when: `high ${trigger.direction === "below" ? "≤" : "≥"} ${trigger.threshold}°F` }
      : trigger.family === "price"
        ? { where: trigger.asset, when: `price ${trigger.direction === "below" ? "≤" : "≥"} ${usd(trigger.threshold)}` }
        : { where: trigger.team, when: trigger.outcome === "loses" ? "they lose" : "they win" };
  return [
    { label: "Where", value: happens.where },
    { label: "Happens if", value: happens.when },
    { label: "You lose", value: usd(lossUsd) },
  ];
}

const motionQuery = "(prefers-reduced-motion: reduce)";
const watchMotion = (changed: () => void) => {
  const query = matchMedia(motionQuery);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

const appear = (shown: boolean) => `transition-opacity duration-300 ${shown ? "" : "opacity-0"}`;

/**
 * The product at work, on the page before anyone clicks: a risk Gemini is pricing this minute,
 * typed out, read into the three facts that pick a market, and priced. It moves on to the next one
 * after a while, waits while it is pointed at, and stands still for anyone who prefers that.
 */
export function LiveRead() {
  const { data: examples = [] } = useSWR("/api/examples", fetchExamples, { revalidateOnFocus: false });
  const [turn, setTurn] = useState({ index: 0, tick: 0 });
  const waiting = useRef(false);
  const still = useSyncExternalStore(watchMotion, () => matchMedia(motionQuery).matches, () => false);
  const example = examples.length ? examples[turn.index % examples.length] : null;
  const typing = example ? Math.ceil(example.text.length / CHARS_PER_TICK) : 0;
  const length = typing + BEAT * 6 + HOLD;

  useEffect(() => {
    if (examples.length === 0 || still) return;
    const timer = setInterval(() => {
      if (waiting.current || document.hidden) return;
      setTurn(({ index, tick }) => (tick >= length ? { index: (index + 1) % examples.length, tick: 0 } : { index, tick: tick + 1 }));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [examples.length, still, length]);

  if (!example) {
    return (
      <figure className="rise panel min-h-[27.5rem] p-6" style={{ "--i": 3 } as CSSProperties}>
        <p className="status status-accent status-live">Reading Gemini&rsquo;s prices…</p>
      </figure>
    );
  }

  const tick = still ? length : turn.tick;
  const typed = Math.min(example.text.length, tick * CHARS_PER_TICK);
  const beat = Math.floor((tick - typing) / BEAT);

  return (
    <figure
      className="rise panel min-h-[27.5rem] p-6"
      style={{ "--i": 3 } as CSSProperties}
      onPointerEnter={() => (waiting.current = true)}
      onPointerLeave={() => (waiting.current = false)}
      onFocus={() => (waiting.current = true)}
      onBlur={() => (waiting.current = false)}
    >
      <p className="flex items-center justify-between gap-4 text-sm text-muted">
        <span className="status status-good status-live">A risk Gemini is pricing now</span>
        <span className="num">{calendarDay(example.day)}</span>
      </p>

      {/* The whole sentence is always there for a screen reader; what is seen is typed over it. */}
      <blockquote className="mt-4 min-h-[4.75rem] text-xl leading-snug text-soft">
        <span className="sr-only">{example.text}</span>
        <span aria-hidden>
          {parts(example).map(({ text, lit, start }) => (
            <span key={start} className={lit && beat >= 0 ? "text-fg underline decoration-accent decoration-2 underline-offset-[0.28em]" : undefined}>
              {text.slice(0, Math.max(0, typed - start))}
            </span>
          ))}
          {typed < example.text.length && <span className="caret" />}
        </span>
      </blockquote>

      <dl className="mt-4 grid grid-cols-3 gap-4 border-y border-line py-3.5">
        {facts(example).map(({ label, value }, i) => (
          <div key={label} className={appear(beat > i)}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="num mt-1 text-sm text-fg sm:text-base">{value}</dd>
          </div>
        ))}
      </dl>

      <p className={`title mt-4 ${appear(beat > 3)}`}>
        Pays {usd(example.payout)} if {example.pays}
      </p>
      <dl className={`rows mt-3 border-y border-line ${appear(beat > 4)}`}>
        <div className="flex items-baseline justify-between gap-6 py-2.5 text-muted">
          <dt>The market&rsquo;s odds it happens</dt>
          <dd className="num text-soft">{example.odds === null ? "—" : percent(example.odds)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 py-2.5">
          <dt>What this cover costs</dt>
          <dd className="num text-xl text-accent">{cents(example.cost)}</dd>
        </div>
      </dl>
      <figcaption className={`mt-4 flex items-center justify-between gap-4 ${appear(beat > 4)}`}>
        <span className="text-xs text-faint">The {usd(example.payout)} is locked before you pay</span>
        <Link href={`/app?exposure=${encodeURIComponent(JSON.stringify(example.exposure))}&from=example`} className="btn btn-secondary h-9 px-3 text-sm">
          Price it yourself
        </Link>
      </figcaption>
    </figure>
  );
}
