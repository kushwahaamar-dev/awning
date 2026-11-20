import { percent, usd } from "@/lib/format";
import type { CoverPlan, MarketRow } from "@/lib/hedge/plan";
import { CostChart } from "./CostChart";
import { External } from "./icons";

const HEADINGS = {
  close: "This tracks your risk closely",
  partial: "This tracks your risk partly",
  loose: "This only loosely tracks your risk",
} as const;

const penny = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}¢`);
const midOf = (c: MarketRow) => (c.yesBid !== null && c.yesAsk !== null ? (c.yesBid + c.yesAsk) / 2 : (c.yesAsk ?? c.yesBid ?? c.last ?? 0));

/** Plain-language account of where a payout could differ from the user's actual loss, plus the live Gemini book. */
export function Fit({ plan }: { plan: CoverPlan }) {
  const { basis, market, coverage, forecast } = plan;
  const contracts = market.contracts ?? [];
  const legBySymbol = new Map(coverage.legs.map((l) => [l.symbol, l]));
  const peak = Math.max(0.2, ...contracts.map(midOf), ...contracts.map((c) => forecast?.probability?.[c.symbol] ?? 0));
  const geminiApiUrl = `https://api.gemini.com/v1/prediction-markets/events/${encodeURIComponent(market.ticker)}`;

  return (
    <div className="space-y-12">
      <section className="grid gap-x-12 gap-y-12 md:grid-cols-2">
        <div className="only:col-span-full">
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

      {contracts.length > 0 && (
        <section aria-label="Gemini market book" className="border-t border-line pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div>
              <h2 className="title">What Gemini is quoting across this market</h2>
              <p className="mt-1 text-sm text-muted">
                Event <span className="num text-fg">{market.ticker}</span>
                {typeof market.volume24h === "number" && market.volume24h > 0 ? ` · ${usd(market.volume24h)} 24h volume` : ""}
                {" · "}
                {coverage.legs.length} of {contracts.length} {contracts.length === 1 ? "contract" : "contracts"} in your cover
              </p>
            </div>
            <a href={geminiApiUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5 text-sm">
              Verify live JSON on Gemini <External />
            </a>
          </div>

          <ul className="rows mt-5 border-y border-line">
            {contracts.map((contract) => {
              const leg = legBySymbol.get(contract.symbol);
              const mid = midOf(contract);
              const modelProb = forecast?.probability?.[contract.symbol];
              const barPct = Math.min(100, Math.round((mid / peak) * 100));
              return (
                <li key={contract.symbol} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className={leg ? "font-medium text-fg" : "text-muted"}>{contract.label}</span>
                      {leg && (
                        <span className="rounded bg-lit px-1.5 py-0.5 text-xs font-medium text-ink">
                          In your cover ({leg.side === "yes" ? "Yes" : "No"})
                        </span>
                      )}
                      <span className="num text-xs text-faint">{contract.symbol}</span>
                    </div>
                    <div className="num flex items-baseline gap-x-3 text-sm">
                      {modelProb !== undefined && <span className="text-muted">Model {percent(modelProb)}</span>}
                      <span className="text-muted">
                        Bid <span className="text-fg">{penny(contract.yesBid)}</span> · Ask <span className="text-fg">{penny(contract.yesAsk)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-pressed">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(mid > 0 ? 3 : 0, barPct)}%`,
                        background: leg ? "var(--color-lit)" : "var(--color-edge)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
