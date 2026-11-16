"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import useSWR from "swr";
import type { Example } from "@/lib/hedge/examples";
import { calendarDay, cents, percent, usd } from "@/lib/format";
import { fetchExamples } from "./Ask";

// The reading plays out in beats: the sentence is typed, each thing found in it lights up, then the cover, its odds and its price.
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

const paysLine = (example: Example) => `Pays ${usd(example.payout)} if ${example.pays}`;

/**
 * A line that holds the room its longest version needs: every version lies unseen in the same place
 * and the one showing sits on top, so going from a two-line sentence to a three-line one moves nothing.
 */
function Held({ versions, children }: { versions: string[]; children: ReactNode }) {
  return (
    <span className="grid">
      {versions.map((text) => (
        <span key={text} aria-hidden className="invisible [grid-area:1/1]">
          {text}
        </span>
      ))}
      <span className="[grid-area:1/1]">{children}</span>
    </span>
  );
}

/** One risk, as far as the reading has got: `typed` characters of the sentence, and `beat` steps of what follows. */
function Reading({ example, all, typed, beat }: { example: Example; all: Example[]; typed: number; beat: number }) {
  return (
    <>
      <p className="flex items-center justify-between gap-4 text-sm text-muted">
        <span className="status status-good status-live">A risk Gemini is pricing now</span>
        <span className="num max-[400px]:hidden">{calendarDay(example.day)}</span>
      </p>

      <blockquote className="mt-4 text-xl leading-snug text-soft">
        <span className="sr-only">{example.text}</span>
        <Held versions={all.map((each) => each.text)}>
          <span aria-hidden>
            {parts(example).map(({ text, lit, start }) => (
              <span key={start} className={lit && beat >= 0 ? "text-fg underline decoration-accent decoration-2 underline-offset-[0.28em]" : undefined}>
                {text.slice(0, Math.max(0, typed - start))}
              </span>
            ))}
            {typed < example.text.length && <span className="caret" />}
          </span>
        </Held>
      </blockquote>

      {/* Side by side where there is room; one to a line on a phone, where a long city name would run into its neighbour. */}
      <dl className="mt-4 grid gap-x-4 gap-y-1.5 border-y border-line py-3.5 sm:grid-cols-[auto_auto_auto] sm:justify-between">
        {facts(example).map(({ label, value }, i) => (
          <div key={label} className="max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`num text-sm text-fg sm:mt-1 sm:text-base ${appear(beat > i)}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <p className={`title mt-4 ${appear(beat > 3)}`}>
        <Held versions={all.map(paysLine)}>{paysLine(example)}</Held>
      </p>
      <dl className="rows mt-3 border-y border-line">
        <div className="flex items-baseline justify-between gap-6 py-2.5 text-muted">
          <dt>The market&rsquo;s odds it happens</dt>
          <dd className={`num text-soft ${appear(beat > 4)}`}>{example.odds === null ? "—" : percent(example.odds)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 py-2.5">
          <dt>What this cover costs</dt>
          <dd className={`num text-xl text-accent ${appear(beat > 5)}`}>{cents(example.cost)}</dd>
        </div>
      </dl>
      {/* Whatever height the card has to spare goes above this row, which stays at its foot. */}
      <p className="mt-auto flex items-center justify-between gap-4 pt-4">
        <span className={`text-xs text-balance text-faint ${appear(beat > 5)}`}>The {usd(example.payout)} is locked before you pay</span>
        <Link href={`/app?exposure=${encodeURIComponent(JSON.stringify(example.exposure))}&from=example`} className="btn btn-secondary h-9 shrink-0 px-3 text-sm">
          Price cover
        </Link>
      </p>
    </>
  );
}

// Tall enough for what loads into it, so the card is one size from the moment the page opens.
const CARD = "rise panel flex min-h-[33rem] flex-col p-5 max-xl:max-w-2xl sm:min-h-[27rem] sm:p-6 xl:min-h-[30.25rem]";

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
  const length = typing + BEAT * 7 + HOLD;

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
      <figure className={CARD} style={{ "--i": 3 } as CSSProperties}>
        <p className="status status-accent status-live self-start">Reading Gemini&rsquo;s prices…</p>
      </figure>
    );
  }

  const tick = still ? length : turn.tick;

  return (
    <figure
      className={CARD}
      style={{ "--i": 3 } as CSSProperties}
      onPointerEnter={() => (waiting.current = true)}
      onPointerLeave={() => (waiting.current = false)}
      onFocus={() => (waiting.current = true)}
      onBlur={() => (waiting.current = false)}
    >
      {/* A new risk is a new reading from the first letter: nothing of the last one is left to fade out under it. */}
      <Reading key={example.text} example={example} all={examples} typed={Math.min(example.text.length, tick * CHARS_PER_TICK)} beat={Math.floor((tick - typing) / BEAT)} />
    </figure>
  );
}
