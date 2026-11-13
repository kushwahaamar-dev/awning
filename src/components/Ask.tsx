"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { Turn } from "@/lib/hedge/interpret";
import type { useVoice } from "./voice";

const icon = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const EXAMPLES: { kind: string; mark: ReactNode; tilt: string; text: string }[] = [
  {
    kind: "Weather",
    mark: <path d="M8 2v7.2a2.6 2.6 0 1 1-2.2 0V4.2A2.2 2.2 0 0 1 8 2Zm3.5 1.5H14M11.5 6H13" />,
    tilt: "-1.1deg",
    text: "Any day Austin's high stays under 76, my ice cream truck is out about $300.",
  },
  {
    kind: "Fuel",
    mark: <path d="M8 1.8c2.4 3 4 5.2 4 7.6a4 4 0 0 1-8 0c0-2.4 1.6-4.6 4-7.6Z" />,
    tilt: "0.8deg",
    text: "If oil is above $90 a barrel at the end of next week, my delivery vans cost me $1,500 more.",
  },
  {
    kind: "Game day",
    mark: <path d="M3 14V2m0 1h9l-2.2 3L12 9H3" />,
    tilt: "-0.5deg",
    text: "If the Longhorns lose on Saturday, my bar makes about $4,000 less.",
  },
];

const STEPS = [
  { title: "Say it", body: "Describe the thing that costs you money, typed or out loud. There are no forms to fill in." },
  { title: "See the price", body: "Awning finds the Gemini market that pays when it happens, and prints what cover costs and how closely it tracks your loss." },
  { title: "Your agent buys it", body: "Only inside the limits you set. A contract holds those limits, so they stand even if the agent is fooled." },
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

const MIC_LABEL = { idle: "Say it out loud", recording: "Stop, I'm done", transcribing: "Listening back…" } as const;

const order = (i: number) => ({ "--i": i }) as CSSProperties;

export function Ask({ turns, busy, pricing, error, unlisted, onSay, voice }: Props) {
  const [draft, setDraft] = useState("");
  const question = turns.at(-1)?.role === "assistant" ? turns.at(-1)!.text : null;
  const said = turns.filter((t) => t.role === "user").map((t) => t.text);
  const fresh = turns.length === 0;

  function submit(text: string) {
    if (!text.trim() || busy) return;
    onSay(text.trim());
    setDraft("");
  }

  return (
    <>
      <section>
        <h1 className="display display-xl rise">What could go wrong for your business?</h1>

        <div className="mt-10 grid gap-x-14 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="rise max-w-xl text-xl text-mute" style={order(1)}>
              Say it the way you&rsquo;d tell a friend. Awning looks for a market that pays out when it happens, and shows you what the cover
              costs before you spend anything.
            </p>

            {said.length > 0 && (
              <ol className="mt-8 space-y-3 border-l-4 border-awning pl-4">
                {said.map((text, i) => (
                  <li key={i} className="text-lg">
                    {text}
                  </li>
                ))}
              </ol>
            )}
            {question && <p className="display display-md mt-6">{question}</p>}

            <form
              className="composer rise mt-7"
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
                className="block w-full resize-none bg-transparent px-6 pt-6 pb-2 text-2xl leading-snug placeholder:text-mute/60 focus:outline-none"
              />
              <div className="flex flex-wrap items-center justify-end gap-3 p-3">
                {voice.enabled && (
                  <button
                    type="button"
                    onClick={voice.state === "recording" ? voice.stop : voice.start}
                    disabled={busy || voice.state === "transcribing"}
                    aria-pressed={voice.state === "recording"}
                    className={`btn ${voice.state === "recording" ? "btn-recording" : "btn-outline"}`}
                  >
                    <svg aria-hidden {...icon} className="size-4">
                      <path d="M8 1.8a2 2 0 0 1 2 2V8a2 2 0 0 1-4 0V3.8a2 2 0 0 1 2-2ZM3.8 7.800a4.2 4.2 0 0 0 8.400 0M8 12v2.2" />
                    </svg>
                    {MIC_LABEL[voice.state]}
                  </button>
                )}
                <button type="submit" disabled={busy || !draft.trim()} className="btn btn-primary">
                  {busy ? (pricing ? "Pricing it on Gemini…" : "Reading your risk…") : "Find cover"}
                </button>
              </div>
            </form>
            {error && <p className="mt-4 text-brick">{error}</p>}

            {unlisted && (
              <div className="mt-8 border-l-4 border-marigold pl-4">
                <p className="text-lg font-bold">Gemini doesn&rsquo;t list a market for that yet.</p>
                <p className="mt-1 text-mute">
                  {unlisted.wanted
                    ? `We've noted "${unlisted.wanted}" as a market people are asking for. `
                    : "Nothing listed today settles on that. "}
                  Right now cover exists for daily high temperatures in 49 US cities, oil, gas and metal prices, crypto prices, and game
                  results.
                </p>
              </div>
            )}
          </div>

          {fresh && (
            <div className="lg:col-span-5">
              <p className="rise text-mute" style={order(3)}>
                Or start from one of these
              </p>
              <ul className="mt-3 space-y-4">
                {EXAMPLES.map(({ kind, mark, tilt, text }, i) => (
                  <li key={kind} className="rise" style={order(4 + i)}>
                    <button type="button" disabled={busy} onClick={() => submit(text)} className="ticket" style={{ "--tilt": tilt } as CSSProperties}>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-awning">
                        <svg aria-hidden {...icon} className="size-4">
                          {mark}
                        </svg>
                        {kind}
                      </span>
                      <span className="mt-1.5 block text-lg leading-snug">&ldquo;{text}&rdquo;</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {fresh && (
        <section aria-labelledby="how" className="scallop-bottom mt-28 rounded-t-[2rem] bg-marigold px-6 pt-12 sm:px-12 sm:pt-16">
          <h2 id="how" className="display display-lg">
            How it works
          </h2>
          <ol className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-3">
            {STEPS.map(({ title, body }, i) => (
              <li key={title} className="border-t-2 border-ink pt-5">
                <span aria-hidden className="display block text-7xl">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-lg">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
