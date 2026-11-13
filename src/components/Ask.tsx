"use client";

import { useState } from "react";
import type { Turn } from "@/lib/hedge/interpret";
import type { useVoice } from "./voice";

const EXAMPLES = [
  "Any day Austin's high stays under 76, my ice cream truck is out about $300.",
  "If oil is above $90 a barrel at the end of next week, my delivery vans cost me $1,500 more.",
  "If the Longhorns lose on Saturday, my bar makes about $4,000 less.",
];

type Props = {
  turns: Turn[];
  busy: boolean;
  error: string | null;
  unlisted: { wanted: string | null } | null;
  onSay: (text: string) => void;
  voice: ReturnType<typeof useVoice>;
};

const MIC_LABEL = { idle: "Say it out loud", recording: "Stop, I'm done", transcribing: "Listening back…" } as const;

export function Ask({ turns, busy, error, unlisted, onSay, voice }: Props) {
  const [draft, setDraft] = useState("");
  const question = turns.at(-1)?.role === "assistant" ? turns.at(-1)!.text : null;
  const said = turns.filter((t) => t.role === "user").map((t) => t.text);

  function submit(text: string) {
    if (!text.trim() || busy) return;
    onSay(text.trim());
    setDraft("");
  }

  return (
    <section className="max-w-3xl">
      <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight [font-stretch:85%] sm:text-5xl">
        What could go wrong for your business?
      </h1>
      <p className="mt-4 max-w-xl text-lg text-mute">
        Say it the way you&rsquo;d tell a friend. Awning looks for a market that pays out when it happens, and shows
        you what the cover costs before you spend anything.
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
      {question && <p className="mt-6 font-display text-2xl leading-snug font-semibold">{question}</p>}

      <form
        className="mt-6"
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
          placeholder={question ? "Your answer" : "If it rains all weekend, my food truck…"}
          className="w-full resize-none rounded-sm border-2 border-ink bg-paper p-4 text-xl placeholder:text-mute/70"
        />
        <div className="mt-3 flex items-center gap-4">
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-sm bg-awning px-6 py-3 text-lg font-bold text-paper disabled:opacity-50"
          >
            {busy ? "Looking for cover…" : "Find cover"}
          </button>
          {voice.enabled && (
            <button
              type="button"
              onClick={voice.state === "recording" ? voice.stop : voice.start}
              disabled={busy || voice.state === "transcribing"}
              aria-pressed={voice.state === "recording"}
              className={`rounded-sm border-2 px-6 py-3 text-lg font-bold disabled:opacity-50 ${
                voice.state === "recording" ? "border-brick bg-brick text-paper" : "border-awning text-awning"
              }`}
            >
              {MIC_LABEL[voice.state]}
            </button>
          )}
          {error && <p className="text-brick">{error}</p>}
        </div>
      </form>

      {unlisted && (
        <div className="mt-8 border-l-4 border-marigold pl-4">
          <p className="text-lg font-bold">Gemini doesn&rsquo;t list a market for that yet.</p>
          <p className="mt-1 text-mute">
            {unlisted.wanted
              ? `We've noted "${unlisted.wanted}" as a market people are asking for. `
              : "Nothing listed today settles on that. "}
            Right now cover exists for daily high temperatures in 49 US cities, oil, gas and metal prices, crypto
            prices, and game results.
          </p>
        </div>
      )}

      {turns.length === 0 && (
        <div className="mt-12">
          <p className="text-mute">Or start from one of these</p>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit(example)}
                  className="w-full py-3 text-left text-lg hover:text-awning disabled:opacity-50"
                >
                  &ldquo;{example}&rdquo;
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
