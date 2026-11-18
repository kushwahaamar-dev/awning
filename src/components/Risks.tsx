"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { calendarDay, cents, usd } from "@/lib/format";
import type { Example } from "@/lib/hedge/examples";
import type { Trigger } from "@/lib/hedge/exposure";
import { Sketch } from "./Sketch";

const fetchExamples = async (url: string): Promise<Example[]> => (await (await fetch(url)).json()).examples ?? [];

/** Bad days Gemini is pricing sensibly this minute. Undefined until they have been read. */
export const useExamples = () => useSWR("/api/examples", fetchExamples, { revalidateOnFocus: false }).data;

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
  if (examples?.length === 0) return empty;

  return (
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
  );
}
