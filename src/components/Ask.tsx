"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Turn } from "@/lib/hedge/interpret";
import { EXAMPLE_RISK } from "@/lib/words";
import { Mic } from "./icons";
import { Risks } from "./Risks";
import { Stamp } from "./Sketch";
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
    <div className="split split-even pt-8 sm:pt-14">
      <div>
        <h1 className="sign">What would a bad day cost you?</h1>
        {opening && <p className="lede mt-3">Say it in your own words. You see the price before you pay anything.</p>}

        {earlier.length > 0 && (
          <ol className="mt-6 space-y-1.5 text-muted">
            {earlier.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ol>
        )}
        {question && <p className="title mt-6">{question}</p>}

        {/* The box stays where it is while its sentence is read and priced: the words stay in it and the wait is told under them. */}
        <form
          className="composer mt-7"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <label htmlFor="risk" className="sr-only">
            {question ?? "Name your bad day"}
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
            className="block w-full resize-none bg-transparent px-5 pt-4 text-lg leading-snug placeholder:text-faint focus:outline-none"
          />
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 p-2 pl-5">
            {busy ? (
              <p aria-live="polite" className="status status-accent status-live whitespace-normal text-fg">
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
                    See my price
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

      </div>

      {/* The examples keep their place through a first wait, out of reach, so nothing beside the box moves. */}
      {opening && (
        <section className={`transition-opacity max-lg:mt-8 ${busy ? "opacity-40" : ""}`} inert={busy}>
          <h2 className="heading flex items-center gap-4">
            <Stamp of="day" />
            Or pick a bad day priced right now
          </h2>
          <div className="mt-6">
            <Risks empty={<p className="note">Gemini&rsquo;s prices aren&rsquo;t coming through right now, so there is no ready-made day to pick. You can still name your own.</p>} />
          </div>
          <p className="copy mt-6">
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
