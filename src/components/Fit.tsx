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
    <section className="space-y-12">
      <div>
        <h2 className="title">{HEADINGS[basis.level]}</h2>
        <div
          role="meter"
          aria-label="How closely the cover tracks your risk"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={basis.fit}
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-pressed"
        >
          <div className={`h-full rounded-full ${basis.level === "loose" ? "bg-bad" : "bg-fg"}`} style={{ width: `${basis.fit}%` }} />
        </div>
        <div aria-hidden className="mt-2 flex justify-between text-sm text-muted">
          <span>Loosely</span>
          <span>Closely</span>
        </div>
        <ul className="rows copy mt-5 border-y border-line">
          {basis.notes.map((note) => (
            <li key={note} className="py-2.5">
              {note}
            </li>
          ))}
        </ul>
      </div>
      <CostChart legs={plan.coverage.legs} />
    </section>
  );
}
