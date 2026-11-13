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
    <section className="mt-10 max-w-xl">
      <h2 className="text-xl font-bold">{HEADINGS[basis.level]}</h2>
      <div
        role="meter"
        aria-label="How closely the cover tracks your risk"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={basis.fit}
        className="mt-3 h-3 overflow-hidden rounded-full bg-rule"
      >
        <div className={`h-full rounded-full ${basis.level === "loose" ? "bg-brick" : "bg-awning"}`} style={{ width: `${basis.fit}%` }} />
      </div>
      <div aria-hidden className="mt-1.5 flex justify-between text-sm text-mute">
        <span>Loosely</span>
        <span>Closely</span>
      </div>
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
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
