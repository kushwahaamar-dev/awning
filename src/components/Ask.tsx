"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Turn } from "@/lib/hedge/interpret";
import { EXAMPLE_RISK } from "@/lib/words";
import { Mic } from "./icons";
import { Risks } from "./Risks";
import type { useVoice } from "./voice";

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
  voice: ReturnType<typeof useVoice>;
};

const MIC_LABEL = {
  idle: "Say it",
  recording: "Stop, I’m done",
  transcribing: "Listening back…",
} as const;

export function Ask({ turns, busy, pricing, understood, checking, error, unlisted, draft, onDraft, onSay, voice }: Props) {
  const [nudged, setNudged] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
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
    <div className="mx-auto max-w-6xl pt-12 sm:pt-20">
      <h1 className="sign">What would a bad day cost you?</h1>
      {opening && <p className="lede mt-4">Say it in your own words. You see the price before you pay anything.</p>}

      {earlier.length > 0 && (
        <ol className="mt-8 space-y-2 text-lg text-muted">
          {earlier.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
      )}
      {question && <p className="title mt-6">{question}</p>}

      {/* The box stays where it is while its sentence is read and priced: the words stay in it and the wait is told under them. */}
      <form
        className="composer mt-8"
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
          rows={2}
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
          className="block w-full resize-none bg-transparent px-6 pt-6 text-xl leading-snug placeholder:text-faint focus:outline-none sm:px-7 sm:text-2xl"
        />
        <div className="flex min-h-[4.25rem] flex-wrap items-center justify-between gap-3 p-3 pl-6 sm:pl-7">
          {busy ? (
            <p aria-live="polite" className="status status-accent status-live text-sm whitespace-normal text-fg">
              <span>
                {!pricing ? "Reading your sentence…" : checking ? "Pricing it on Gemini, and buying a forecast to check the price…" : "Pricing it on Gemini…"}
                {said.length > 0 && <span className="text-muted"> This can take up to a minute.</span>}
              </span>
            </p>
          ) : (
            <>
              <span aria-live="polite" className="text-sm text-muted">
                {nudged && "Write what could cost you money first"}
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
        <p role="alert" className="note note-bad mt-4">
          {error}
        </p>
      )}

      {unlisted && (
        <div className="note mt-4">
          <p className="text-fg">Gemini doesn&rsquo;t list a market for that yet.</p>
          <p className="mt-1">
            {unlisted.wanted && `We’ve noted “${unlisted.wanted}” as one people want. `}
            Today there is cover for daily highs in 49 US cities, oil, gas and metal prices, crypto prices, and game results.
          </p>
        </div>
      )}

      {/* The examples keep their place through a first wait, out of reach, so nothing under the box moves. */}
      {opening && (
        <section className={`mt-16 transition-opacity sm:mt-20 ${busy ? "opacity-40" : ""}`} inert={busy}>
          <h2 className="title text-muted">Or start from a bad day Gemini is pricing now</h2>
          <div className="mt-8">
            <Risks />
          </div>
          <p className="mt-12 text-muted">
            Not sure what&rsquo;s costing you?{" "}
            <Link href="/find" className="link">
              Find it in your sales
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
