"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import useSWR from "swr";
import type { Example } from "@/lib/hedge/examples";
import { calendarDay, cents, percent, usd } from "@/lib/format";
import { fetchExamples } from "./Ask";

// The reading plays out in beats: the sentence is typed, each thing found in it lights up, then the market's odds, the price, and the cover.
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

/** The same sentence as the three facts a market can be matched on, then what the market makes of it: its odds and the price. */
function figures({ exposure: { trigger, lossUsd }, odds, cost }: Example) {
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
    { label: "The market’s odds", value: odds === null ? "—" : percent(odds) },
    { label: "This cover costs", value: cents(cost) },
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
      <p className="flex items-center justify-between gap-4 text-muted">
        <span className="status status-good status-live text-[0.9375rem] text-muted">A risk Gemini is pricing now</span>
        <span className="num max-[400px]:hidden">{calendarDay(example.day)}</span>
      </p>

      <blockquote className="heading mt-6 normal-case">
        <span className="sr-only">{example.text}</span>
        <Held versions={all.map((each) => each.text)}>
          <span aria-hidden>
            {parts(example).map(({ text, lit, start }) => (
              <span key={start} className={lit && beat >= 0 ? "underline decoration-1 underline-offset-[0.18em]" : undefined}>
                {text.slice(0, Math.max(0, typed - start))}
              </span>
            ))}
            {typed < example.text.length && <span className="caret" />}
          </span>
        </Held>
      </blockquote>

      {/* What was read out of the sentence and what the market makes of it. Five across where there is room;
          one to a line on a phone, where a long city name would run into its neighbour. */}
      <dl className="mt-10 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_auto_auto] sm:justify-between sm:gap-y-6 lg:grid-cols-[auto_auto_auto_auto_auto]">
        {figures(example).map(({ label, value }, i) => (
          <div key={label} className="max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4">
            <dt className="whitespace-nowrap text-muted">{label}</dt>
            <dd className={`num whitespace-nowrap sm:mt-1 sm:text-xl ${appear(beat > i)}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {/* Whatever height the reading has to spare goes above this row, which stays at its foot. */}
      <div className="mt-auto flex items-baseline justify-between gap-x-6 gap-y-3 border-t border-line pt-4 max-sm:flex-col">
        <p className={`title min-w-0 ${appear(beat > 5)}`}>
          <Held versions={all.map(paysLine)}>{paysLine(example)}</Held>
        </p>
        <Link href={`/app?exposure=${encodeURIComponent(JSON.stringify(example.exposure))}&from=example`} className="link shrink-0 lowercase">
          Price this one
        </Link>
      </div>
    </>
  );
}

// As tall as what loads into it, so the reading is one size from the moment the page opens.
const CARD = "flex min-h-[29rem] flex-col sm:min-h-[22rem] lg:min-h-[19rem]";

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
      <figure className={CARD}>
        <p className="status status-accent status-live self-start text-[0.9375rem] text-muted">Reading Gemini&rsquo;s prices…</p>
      </figure>
    );
  }

  const tick = still ? length : turn.tick;

  return (
    <figure
      className={CARD}
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
