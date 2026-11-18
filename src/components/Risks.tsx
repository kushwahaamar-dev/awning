"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { ago, calendarDay, cents, usd } from "@/lib/format";
import type { Example } from "@/lib/hedge/examples";
import type { Trigger } from "@/lib/hedge/exposure";
import { Sketch } from "./Sketch";

/** Prices as the server gave them. `asOf` is null when they are Gemini's of this minute, and otherwise says when it last answered. */
export type Priced<T> = { items: T[]; asOf: string | null };

const fetchExamples = async (url: string): Promise<Priced<Example>> => {
  const { examples = [], asOf = null } = await (await fetch(url)).json();
  return { items: examples, asOf };
};

// Gemini's prices now and then fail to come through. While there are none they are asked for again every few
// seconds, and while the ones shown are from before it went quiet, every minute.
const EMPTY_AGAIN_MS = 15_000;
const OLD_AGAIN_MS = 60_000;
/** How soon to ask again: not at all once the prices shown are Gemini's of this minute. */
export const untilFresh = (latest: Priced<unknown> | undefined) => (!latest?.items.length ? EMPTY_AGAIN_MS : latest.asOf ? OLD_AGAIN_MS : 0);

const usePriced = () => useSWR("/api/examples", fetchExamples, { revalidateOnFocus: false, refreshInterval: untilFresh }).data;
/** Bad days Gemini is pricing sensibly this minute. Undefined until they have been read. */
export const useExamples = () => usePriced()?.items;
/** When Gemini last answered, while the examples are from before it went quiet; null when they are of this minute. */
export const useExamplesAsOf = () => usePriced()?.asOf ?? null;

/** Said wherever the prices shown are ones Gemini gave a while ago. Nothing when they are of this minute. */
export function AsOf({ asOf, className = "" }: { asOf: string | null; className?: string }) {
  if (!asOf) return null;
  return <p className={`note ${className}`}>Gemini isn&rsquo;t answering right now. These are its prices from {ago(asOf)}.</p>;
}

/** Where a ready-made risk goes to be priced. */
export const quoteLink = (example: Example) => `/app?exposure=${encodeURIComponent(JSON.stringify(example.exposure))}&from=example`;

/** What kind of bad day a risk is: the word for it wherever a picture is chosen. */
export function kindOf(trigger: Trigger): "cold" | "hot" | "fuel" | "other" {
  if (trigger.family === "price") return "fuel";
  if (trigger.family === "temperature") return trigger.direction === "below" ? "cold" : "hot";
  return "other";
}

/** The sketch for a kind of bad day. */
export const pictureOf = (trigger: Trigger) => ({ cold: "cold", hot: "hot", fuel: "fuel", other: "day" } as const)[kindOf(trigger)];

/**
 * Bad days that can be covered this minute, one to a row: what it is, what it pays, and what covering it
 * costs. Pressing one always ends in a real quote.
 * @param empty what to say when Gemini has nothing worth showing
 */
export function Risks({ empty = null }: { empty?: ReactNode }) {
  const examples = useExamples();
  const asOf = useExamplesAsOf();
  if (examples?.length === 0) return empty;

  return (
    <>
      <AsOf asOf={asOf} className="mb-4" />
      <ul className="rows border-y border-line" aria-busy={!examples}>
        {examples
          ? examples.map((example) => (
              <li key={example.text}>
                <Link href={quoteLink(example)} className="flex items-center gap-4 py-4">
                  <Sketch of={pictureOf(example.exposure.trigger)} small className="w-11 shrink-0" />
                  <span className="min-w-0 grow">
                    <span className="block text-pretty">{example.text}</span>
                    <span className="block text-sm text-muted">
                      {calendarDay(example.day)}. Pays {usd(example.payout)}.
                    </span>
                  </span>
                  <span className="btn btn-secondary num shrink-0">{cents(example.cost)}</span>
                </Link>
              </li>
            ))
          : // Until Gemini's prices arrive the rows hold their room, so nothing under them moves when they land.
            [0, 1, 2].map((i) => (
              <li key={i} aria-hidden className="invisible py-4">
                <p>If San Antonio&rsquo;s high tomorrow is 60°F or below, my patio is out about $300.</p>
                <p className="text-sm">Wednesday</p>
              </li>
            ))}
      </ul>
    </>
  );
}
