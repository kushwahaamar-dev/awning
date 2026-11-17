"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import useSWR from "swr";
import { cents } from "@/lib/format";
import type { Example } from "@/lib/hedge/examples";
import type { Turn } from "@/lib/hedge/interpret";
import { EXAMPLE_RISK } from "@/lib/words";
import { Ascii } from "./Ascii";
import { Chevron, Mic } from "./icons";
import type { useVoice } from "./voice";

export const fetchExamples = async (url: string): Promise<Example[]> => (await (await fetch(url)).json()).examples ?? [];

type Props = {
  turns: Turn[];
  busy: boolean;
  /** The sentence has been read and the market is being priced. */
  pricing: boolean;
  /** The risk as it was understood, once that is known. */
  understood: string | null;
  /** The agent has a data budget, so the wait includes buying a forecast. */
  checking: boolean;
  error: string | null;
  unlisted: { wanted: string | null } | null;
  /** What is in the box. The desk owns it, so a sentence that couldn't be read comes back to be sent again. */
  draft: string;
  onDraft: (text: string) => void;
  onSay: (text: string) => void;
  onPick: (example: Example) => void;
  voice: ReturnType<typeof useVoice>;
};

// What a risk can be matched to, so nobody has to guess what to type. Checked against Gemini's listings on 2026-11-16.
const LISTED = [
  ["Weather", "The daily high in 49 US cities"],
  ["Prices", "Oil, natural gas, gold, silver and copper, and Bitcoin, Ether, Solana and XRP"],
  ["Games", "A team winning or losing in football, basketball, hockey or UFC"],
];

const MIC_LABEL = {
  idle: "Say it",
  recording: "Stop, I’m done",
  transcribing: "Listening back…",
} as const;

const order = (i: number) => ({ "--i": i }) as CSSProperties;

export function Ask({ turns, busy, pricing, understood, checking, error, unlisted, draft, onDraft, onSay, onPick, voice }: Props) {
  const [nudged, setNudged] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // Risks Gemini is pricing sensibly this minute, so the first click always ends in a real quote.
  const { data: examples = [] } = useSWR("/api/examples", fetchExamples, { revalidateOnFocus: false });
  const question = turns.at(-1)?.role === "assistant" ? turns.at(-1)!.text : null;
  const said = turns.filter((t) => t.role === "user").map((t) => t.text);
  // While a sentence is being read it is in the box, so only what came before it is listed above.
  const earlier = busy ? said.slice(0, -1) : said;
  // Nothing has been asked back yet: the first sentence is still being written, or read.
  const opening = turns.every((t) => t.role === "user") && turns.length <= 1;

  function submit(text: string) {
    if (busy) return;
    if (!text.trim()) {
      // Pressing the button with nothing written says so, and puts the cursor where the writing goes.
      setNudged(true);
      field.current?.focus();
      return;
    }
    onSay(text.trim());
  }

  return (
    <div className="grid items-start gap-x-14 gap-y-10 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section>
        <h1 className="sign rise">What could go wrong for your business?</h1>
        <p className="rise mt-4 text-lg text-muted" style={order(1)}>
          Say it the way you&rsquo;d tell a friend. You see the price before you spend anything.
        </p>

        {earlier.length > 0 && (
          <ol className="mt-8 space-y-2 border-l border-edge pl-4 text-lg text-soft">
            {earlier.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ol>
        )}
        {question && <p className="title mt-6">{question}</p>}

        {/* The box stays where it is while its sentence is read and priced: the words stay in it and the wait is told under them. */}
        <form
          className="composer rise mt-8"
          style={order(2)}
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <label htmlFor="risk" className="sr-only">
            {question ?? "Describe the risk"}
          </label>
          <textarea
            id="risk"
            name="risk"
            ref={field}
            rows={3}
            autoComplete="off"
            readOnly={busy}
            value={busy ? (said.at(-1) ?? understood ?? "") : draft}
            onChange={(e) => {
              onDraft(e.target.value);
              setNudged(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder={question ? "Your answer…" : EXAMPLE_RISK}
            className="block w-full resize-none bg-transparent px-5 pt-4 pb-1 text-lg leading-relaxed placeholder:text-faint focus:outline-none"
          />
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 p-3 pl-5">
            {busy ? (
              <p aria-live="polite" className="status status-accent status-live text-sm whitespace-normal text-fg">
                <span>
                  {!pricing
                    ? "Reading your sentence…"
                    : checking
                      ? "Finding the market on Gemini, and buying a forecast to check its price…"
                      : "Finding the market on Gemini and pricing it…"}
                  {said.length > 0 && <span className="text-faint"> This can take up to a minute.</span>}
                </span>
              </p>
            ) : (
              <>
                <span aria-live="polite" className={`text-xs ${nudged ? "text-accent" : "text-faint"}`}>
                  {/* A phone’s keyboard has no Enter that sends, so the hint is only for a real one. */}
                  {nudged ? "Write what could cost you money first" : <span className="[@media(pointer:coarse)]:hidden">Press Enter to send</span>}
                </span>
                <span className="flex gap-2">
                  {voice.enabled && (
                    <button
                      type="button"
                      onClick={voice.state === "recording" ? voice.stop : voice.start}
                      disabled={voice.state === "transcribing"}
                      aria-pressed={voice.state === "recording"}
                      className={`btn ${voice.state === "recording" ? "btn-recording" : "btn-secondary"}`}
                    >
                      <Mic />
                      {MIC_LABEL[voice.state]}
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary">
                    Price cover
                  </button>
                </span>
              </>
            )}
          </div>
        </form>
        {error && (
          <p role="alert" className="note note-bad mt-5">
            {error}
          </p>
        )}

        {unlisted && (
          <div className="panel mt-5 p-5">
            <p className="font-[510]">Gemini doesn&rsquo;t list a market for that yet.</p>
            <p className="mt-1 text-muted">
              {unlisted.wanted && `We’ve noted “${unlisted.wanted}” as one people want. `}
              Today there is cover for daily highs in 49 US cities, oil, gas and metal prices, crypto prices, and game results.
            </p>
          </div>
        )}

        {/* The examples keep their place through a first wait, out of reach, so nothing under the box moves. */}
        {opening && (
          <div className={`rise mt-10 transition-opacity ${busy ? "opacity-40" : ""}`} style={order(3)} inert={busy}>
            {examples.length > 0 && (
              <>
                <p className="text-sm text-muted">Or start from one Gemini is pricing right now</p>
                <ul className="rows mt-3 border-y border-line">
                  {examples.map((example) => (
                    <li key={example.text}>
                      <button
                        type="button"
                        onClick={() => onPick(example)}
                        className="group grid w-full grid-cols-[5.5rem_1fr_auto_auto] items-baseline gap-x-3 py-3.5 text-left text-soft transition-colors hover:text-fg max-sm:grid-cols-[1fr_auto_auto]"
                      >
                        <span className="text-sm text-muted max-sm:col-span-3">{example.kind}</span>
                        <span className="text-pretty">{example.text}</span>
                        <span className="num text-sm text-muted">{cents(example.cost)}</span>
                        <Chevron className="size-4 self-center text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-5 text-sm text-muted">
              Not sure what&rsquo;s costing you?{" "}
              <Link href="/find" className="link">
                Find it in your sales
              </Link>
            </p>
          </div>
        )}
      </section>
      <div className="rise max-lg:hidden" style={order(4)}>
        <Ascii scene="storm" label="Storm clouds over dark hills, lightning coming down" className="fade-soft" />
        <h2 className="title mt-8">What Gemini lists today</h2>
        <dl className="rows mt-4 border-y border-line">
          {LISTED.map(([kind, what]) => (
            <div key={kind} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-x-6 py-3.5">
              <dt className="text-sm text-muted">{kind}</dt>
              <dd className="text-soft">{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
