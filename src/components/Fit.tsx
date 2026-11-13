import type { CoverPlan } from "@/lib/hedge/plan";
import { CostChart } from "./CostChart";

const HEADINGS = {
  close: "This tracks your risk closely",
  partial: "This tracks your risk partly",
  loose: "This only loosely tracks your risk",
} as const;

/** Plain-language account of where a payout could differ from the user's actual loss. */
export function Fit({ plan }: { plan: CoverPlan }) {
  const { basis } = plan;
  return (
    <section className="mt-12 max-w-xl">
      <h2 className="title">{HEADINGS[basis.level]}</h2>
      <div
        role="meter"
        aria-label="How closely the cover tracks your risk"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={basis.fit}
        className="mt-4 h-1 overflow-hidden rounded-full bg-edge"
      >
        <div className={`h-full rounded-full ${basis.level === "loose" ? "bg-bad" : "bg-accent"}`} style={{ width: `${basis.fit}%` }} />
      </div>
      <div aria-hidden className="mt-2 flex justify-between text-xs text-faint">
        <span>Loosely</span>
        <span>Closely</span>
      </div>
      <ul className="rows mt-6 border-y border-line text-soft">
        {basis.notes.map((note) => (
          <li key={note} className="py-3">
            {note}
          </li>
        ))}
      </ul>
      <CostChart legs={plan.coverage.legs} />
    </section>
  );
}
