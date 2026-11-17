"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { calendarDay, cents, usd } from "@/lib/format";
import type { Example } from "@/lib/hedge/examples";
import { Ascii, scenesFor } from "./Ascii";

const fetchExamples = async (url: string): Promise<Example[]> => (await (await fetch(url)).json()).examples ?? [];

/** Where a ready-made risk goes to be priced. */
export const quoteLink = (example: Example) => `/app?exposure=${encodeURIComponent(JSON.stringify(example.exposure))}&from=example`;

// Until Gemini's prices arrive the cards hold their room, so nothing under them moves when they land.
const WAITING = [0, 1, 2];

/**
 * Bad days Gemini is pricing sensibly this minute, each as a picture, what it would cost someone, and what
 * covering it costs. Pressing one always ends in a real quote.
 * @param empty what to say when Gemini has nothing worth showing
 */
export function Risks({ empty = null }: { empty?: ReactNode }) {
  const { data: examples } = useSWR("/api/examples", fetchExamples, { revalidateOnFocus: false });
  if (examples?.length === 0) return empty;
  const scenes = scenesFor(examples?.map((example) => example.exposure.trigger) ?? []);

  return (
    <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3" aria-busy={!examples}>
      {examples
        ? examples.map((example, i) => (
            <li key={example.text}>
              <Link href={quoteLink(example)} className="risk flex h-full flex-col">
                {/* A chart is wider than a landscape, so each picture is centred in the room the tallest one needs. */}
                <span className="flex aspect-[1.6] items-center">
                  <Ascii scene={scenes[i]} className="w-full" />
                </span>
                <p className="mt-5 flex items-baseline justify-between gap-4 text-muted">
                  <span>{example.kind}</span>
                  <span className="num">{calendarDay(example.day)}</span>
                </p>
                <p className="title mt-2 text-pretty">{example.text}</p>
                <p className="mt-auto flex items-baseline justify-between gap-4 pt-5">
                  <span className="text-muted">Pays {usd(example.payout)}</span>
                  <span className="link">Cover it for {cents(example.cost)}</span>
                </p>
              </Link>
            </li>
          ))
        : WAITING.map((i) => (
            <li key={i} aria-hidden className="invisible">
              <div className="aspect-[1.6]" />
              <p className="mt-5">Cold snap</p>
              <p className="title mt-2">If San Antonio&rsquo;s high tomorrow is 60°F or below, my patio is out about $300.</p>
              <p className="pt-5">Pays $300</p>
            </li>
          ))}
    </ul>
  );
}
