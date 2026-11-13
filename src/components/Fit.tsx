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
    <section className="mt-8">
      <h2 className="text-lg font-bold">{HEADINGS[basis.level]}</h2>
      <div
        role="meter"
        aria-label="How closely the cover tracks your risk"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={basis.fit}
        className="mt-2 h-2 max-w-sm bg-rule"
      >
        <div className={`h-full ${basis.level === "loose" ? "bg-brick" : "bg-awning"}`} style={{ width: `${basis.fit}%` }} />
      </div>
      <ul className="mt-4 max-w-xl space-y-2">
        {basis.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <CostChart legs={plan.coverage.legs} />
    </section>
  );
}
