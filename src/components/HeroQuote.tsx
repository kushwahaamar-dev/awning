"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import useSWR from "swr";
import { calendarDay, cents, percent, usd } from "@/lib/format";
import { fetchExamples } from "./Ask";
import { Mark } from "./Logo";

// Shown only if Gemini's prices can't be had.
const STAND_IN = {
  text: "If Chicago’s high tomorrow is 45°F or below, my patio is out about $300.",
  pays: "Chicago’s high is 45°F or below",
  payout: 300,
  cost: 25.6,
  odds: 0.07,
};

/** The product, on the page before anyone clicks: a cover Gemini is pricing this minute, and what it costs. */
export function HeroQuote() {
  const { data, error } = useSWR("/api/examples", fetchExamples, { revalidateOnFocus: false });
  const live = data?.[0];
  const settled = data !== undefined || error !== undefined;
  const shown = live ?? STAND_IN;
  const rows = [
    { label: "The market’s odds it happens", value: shown.odds === null ? "—" : percent(shown.odds) },
    { label: "What this cover costs", value: cents(shown.cost), strong: true },
    { label: "If it happens, you’re up", value: cents(shown.payout - shown.cost) },
  ];

  return (
    <figure className="rise panel min-h-[25.5rem] p-6 max-lg:hidden" style={{ "--i": 3 } as CSSProperties}>
      {/* The frame is there from the start; what fills it waits for the real price rather than showing a guess first. */}
      <div aria-busy={!settled} className={`transition-opacity duration-300 ${settled ? "" : "opacity-0"}`}>
        <blockquote className="text-soft">&ldquo;{shown.text}&rdquo;</blockquote>
        <p className="mt-5 flex items-center justify-between border-t border-line pt-5 text-sm text-muted">
          <span className="flex items-center gap-2">
            <Mark className="size-4 text-accent" />
            Cover
          </span>
          {live && <span className="num">{calendarDay(live.day)}</span>}
        </p>
        <p className="title mt-4">
          Pays {usd(shown.payout)} if {shown.pays}
        </p>
        <dl className="rows mt-4 border-y border-line">
          {rows.map(({ label, value, strong }) => (
            <div key={label} className={`flex items-baseline justify-between gap-6 py-2.5 ${strong ? "text-fg" : "text-muted"}`}>
              <dt>{label}</dt>
              <dd className={`num ${strong ? "text-xl text-accent" : "text-soft"}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="status status-accent mt-4 whitespace-normal">The {usd(shown.payout)} is locked in the pool before you pay</p>
        <figcaption className="mt-4 flex items-baseline justify-between gap-4 text-xs text-faint">
          <span>{live ? "Gemini’s price right now" : "An example"}</span>
          {live && (
            <Link href={`/app?exposure=${encodeURIComponent(JSON.stringify(live.exposure))}&from=example`} className="link">
              Price it yourself
            </Link>
          )}
        </figcaption>
      </div>
    </figure>
  );
}
