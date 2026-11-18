"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { calendarDay, cents, usd } from "@/lib/format";
import type { Example } from "@/lib/hedge/examples";
import type { Trigger } from "@/lib/hedge/exposure";
import { Cold, Fuel, Hot, Storm } from "./icons";

const fetchExamples = async (url: string): Promise<Example[]> => (await (await fetch(url)).json()).examples ?? [];

/** Bad days Gemini is pricing sensibly this minute. Undefined until they have been read. */
export const useExamples = () => useSWR("/api/examples", fetchExamples, { revalidateOnFocus: false }).data;

/** Where a ready-made risk goes to be priced. */
export const quoteLink = (example: Example) => `/app?exposure=${encodeURIComponent(JSON.stringify(example.exposure))}&from=example`;

/** What kind of bad day a risk is: the word for it everywhere a picture or a mark is chosen. */
export function kindOf(trigger: Trigger): "cold" | "hot" | "fuel" | "other" {
  if (trigger.family === "price") return "fuel";
  if (trigger.family === "temperature") return trigger.direction === "below" ? "cold" : "hot";
  return "other";
}

const MARK = { cold: Cold, hot: Hot, fuel: Fuel, other: Storm };

/**
 * Bad days that can be covered this minute, each as a ticket: what it is, what it pays and what covering it
 * costs. Pressing one always ends in a real quote.
 * @param empty what to say when Gemini has nothing worth showing
 */
export function Risks({ empty = null }: { empty?: ReactNode }) {
  const examples = useExamples();
  if (examples?.length === 0) return empty;

  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy={!examples}>
      {examples
        ? examples.map((example) => {
            const Mark = MARK[kindOf(example.exposure.trigger)];
            return (
              <li key={example.text}>
                <Link href={quoteLink(example)} className="ticket risk flex h-full flex-col">
                  <span aria-hidden className="valance block" />
                  <span className="flex grow flex-col p-6">
                    <span className="flex items-center justify-between gap-4 text-muted">
                      <span className="flex items-center gap-2 text-fg">
                        <Mark />
                        {example.kind}
                      </span>
                      <span className="num">{calendarDay(example.day)}</span>
                    </span>
                    <span className="title mt-5 block text-pretty">{example.text}</span>
                    <span className="mt-auto flex items-end justify-between gap-4 pt-8">
                      <span>
                        <span className="block text-muted">Pays</span>
                        <span className="num block text-2xl tracking-[-0.03em]">{usd(example.payout)}</span>
                      </span>
                      <span className="btn btn-primary">Cover it for {cents(example.cost)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })
        : // Until Gemini's prices arrive the tickets hold their room, so nothing under them moves when they land.
          [0, 1, 2].map((i) => (
            <li key={i} aria-hidden className="ticket invisible p-6">
              <p className="mt-4">Cold snap</p>
              <p className="title mt-5">If San Antonio&rsquo;s high tomorrow is 60°F or below, my patio is out about $300.</p>
              <p className="pt-8 text-2xl">Pays</p>
              <p className="btn">Cover</p>
            </li>
          ))}
    </ul>
  );
}
