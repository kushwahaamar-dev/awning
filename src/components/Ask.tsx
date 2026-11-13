"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { Turn } from "@/lib/hedge/interpret";
import { Ascii } from "./Ascii";
import { Chevron, Mic } from "./icons";
import type { useVoice } from "./voice";

const EXAMPLES = [
  {
    kind: "Weather",
    text: "Any day Austin's high stays under 76, my ice cream truck is out about $300.",
  },
  {
    kind: "Fuel",
    text: "If oil is above $90 a barrel at the end of next week, my delivery vans cost me $1,500 more.",
  },
  {
    kind: "Game day",
    text: "If the Longhorns lose on Saturday, my bar makes about $4,000 less.",
  },
];

type Props = {
  turns: Turn[];
  busy: boolean;
  pricing: boolean;
  error: string | null;
  unlisted: { wanted: string | null } | null;
  onSay: (text: string) => void;
  voice: ReturnType<typeof useVoice>;
};

const MIC_LABEL = {
  idle: "Say it",
  recording: "Stop, I'm done",
  transcribing: "Listening back…",
} as const;

const order = (i: number) => ({ "--i": i }) as CSSProperties;

export function Ask({ turns, busy, pricing, error, unlisted, onSay, voice }: Props) {
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const question = turns.at(-1)?.role === "assistant" ? turns.at(-1)!.text : null;
  const said = turns.filter((t) => t.role === "user").map((t) => t.text);
  const fresh = turns.length === 0;

  function submit(text: string) {
    // Pressing the button with nothing written puts the cursor where the writing goes.
    if (!text.trim()) field.current?.focus();
    if (!text.trim() || busy) return;
    onSay(text.trim());
    setDraft("");
  }

  return (
    <div className="grid items-start gap-x-14 gap-y-10 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section>
        <h1 className="heading rise">What could go wrong for your business?</h1>
        <p className="rise mt-4 text-lg text-muted" style={order(1)}>
          Say it the way you&rsquo;d tell a friend. You see the price before you spend anything.
        </p>

        {said.length > 0 && (
          <ol className="mt-8 space-y-2 border-l border-edge pl-4 text-soft">
            {said.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ol>
        )}
        {question && <p className="title mt-6">{question}</p>}

        <form
          className="composer rise mt-8"
          style={order(2)}
          data-busy={busy}
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
            ref={field}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder={question ? "Your answer" : "If it's too cold to sit outside, my patio…"}
            className="block w-full resize-none bg-transparent px-5 pt-4 pb-1 text-lg leading-relaxed placeholder:text-faint focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 pl-5">
            <span className="text-xs text-faint">{busy ? (pricing ? "Pricing it on Gemini" : "Reading your risk") : "Press Enter to send"}</span>
            <span className="flex gap-2">
              {voice.enabled && (
                <button
                  type="button"
                  onClick={voice.state === "recording" ? voice.stop : voice.start}
                  disabled={busy || voice.state === "transcribing"}
                  aria-pressed={voice.state === "recording"}
                  className={`btn ${voice.state === "recording" ? "btn-recording" : "btn-secondary"}`}
                >
                  <Mic />
                  {MIC_LABEL[voice.state]}
                </button>
              )}
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? (pricing ? "Pricing it on Gemini…" : "Reading your risk…") : "Find cover"}
              </button>
            </span>
          </div>
        </form>
        {error && <p className="note note-bad mt-5">{error}</p>}

        {unlisted && (
          <div className="panel mt-5 p-5">
            <p className="font-[510]">Gemini doesn&rsquo;t list a market for that yet.</p>
            <p className="mt-1 text-muted">
              {unlisted.wanted && `We've noted "${unlisted.wanted}" as one people want. `}
              Today there is cover for daily highs in 49 US cities, oil, gas and metal prices, crypto prices, and game results.
            </p>
          </div>
        )}

        {fresh && (
          <div className="rise mt-10" style={order(3)}>
            <p className="text-sm text-muted">Or try one of these</p>
            <ul className="rows mt-3 border-y border-line">
              {EXAMPLES.map(({ kind, text }) => (
                <li key={kind}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submit(text)}
                    className="group grid w-full grid-cols-[5.5rem_1fr_auto] items-baseline gap-x-3 py-3.5 text-left text-soft transition-colors hover:text-fg disabled:opacity-50 max-sm:grid-cols-[1fr_auto]"
                  >
                    <span className="text-sm text-muted max-sm:col-span-2">{kind}</span>
                    <span>{text}</span>
                    <Chevron className="size-4 self-center text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {fresh && (
        <div className="rise max-lg:hidden" style={order(4)}>
          <Ascii scene="storm" label="Storm clouds over dark hills, lightning coming down" className="fade-soft" />
        </div>
      )}
    </div>
  );
}
