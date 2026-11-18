"use client";

import Form from "next/form";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cents, usd } from "@/lib/format";
import { Cold, Fuel, Hot, Storm } from "./icons";
import { kindOf, quoteLink, useExamples } from "./Risks";

const MARK = { cold: Cold, hot: Hot, fuel: Fuel, other: Storm };
// How fast the example is written, two letters at a time, and how long its price stays up before the next one.
const TYPE_MS = 26;
const HOLD_MS = 3400;

const motionQuery = "(prefers-reduced-motion: reduce)";
const watchMotion = (changed: () => void) => {
  const query = matchMedia(motionQuery);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

/**
 * The box a bad day is written in, and the product shown at work in it before anyone touches it: a bad day
 * Gemini is pricing this minute writes itself, what it pays and costs comes up beside the button, and then the
 * next one does. The moment the visitor puts the cursor in, the box is theirs. Pressed while an example is
 * showing, the button prices that example.
 */
export function HeroAsk() {
  const examples = useExamples() ?? [];
  const router = useRouter();
  const [mine, setMine] = useState("");
  const [focused, setFocused] = useState(false);
  const [turn, setTurn] = useState({ index: 0, written: 0 });
  const still = useSyncExternalStore(watchMotion, () => matchMedia(motionQuery).matches, () => false);
  const showing = !mine && !focused;
  const example = examples.length ? examples[turn.index % examples.length] : null;
  const written = still ? Infinity : turn.written;
  const priced = example !== null && written >= example.text.length;

  useEffect(() => {
    if (!example || !showing || still) return;
    const next = priced ? { index: (turn.index + 1) % examples.length, written: 0 } : { ...turn, written: turn.written + 2 };
    const timer = setTimeout(() => setTurn(next), priced ? HOLD_MS : TYPE_MS);
    return () => clearTimeout(timer);
  }, [example, examples.length, priced, showing, still, turn]);

  const Mark = example ? MARK[kindOf(example.exposure.trigger)] : null;

  return (
    <Form
      action="/app"
      className="composer"
      onSubmit={(event) => {
        if (mine.trim() || !example) return;
        event.preventDefault();
        router.push(quoteLink(example));
      }}
    >
      <label htmlFor="ask" className="sr-only">
        Name your bad day
      </label>
      <div className="relative">
        <textarea
          id="ask"
          name="risk"
          rows={2}
          autoComplete="off"
          value={mine}
          onChange={(event) => setMine(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={focused ? "What could go wrong, and what would it cost you?" : undefined}
          className="block w-full resize-none bg-transparent px-6 pt-5 text-xl leading-snug placeholder:text-faint focus:outline-none max-sm:h-28 sm:text-[1.375rem]"
        />
        {showing && example && (
          <p aria-hidden className="pointer-events-none absolute inset-0 px-6 pt-5 text-xl leading-snug sm:text-[1.375rem]">
            {example.text.slice(0, written)}
            {!priced && <span className="caret" />}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-3 pl-6">
        <p className={`flex min-w-0 items-center gap-2 transition-opacity duration-300 ${priced && showing ? "" : "opacity-0"}`} aria-hidden>
          {Mark && <Mark className="size-5 shrink-0" />}
          {example && (
            <span>
              Pays <span className="num">{usd(example.payout)}</span>. Costs <span className="num">{cents(example.cost)}</span>.
            </span>
          )}
        </p>
        <button type="submit" className="btn btn-lg btn-primary ml-auto shrink-0">
          See my price
        </button>
      </div>
    </Form>
  );
}
