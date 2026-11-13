import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { shortAddress } from "@/lib/format";
import { Mark } from "./Logo";

function Contract({ address }: { address: string }) {
  const page = explorerAddress(address);
  if (!page) return <span className="num text-soft">{shortAddress(address)}</span>;
  return (
    <a href={page} target="_blank" rel="noreferrer" className="link num">
      {shortAddress(address)}
    </a>
  );
}

/** What is real behind the page, and where to check it. */
export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <dl className="grid gap-x-12 gap-y-8 text-sm md:grid-cols-3">
          <div>
            <dt className="font-[510] text-fg">Markets and results</dt>
            <dd className="mt-1.5 text-muted">Gemini prediction markets. Awning never decides whether something happened; Gemini&rsquo;s resolution does.</dd>
          </div>
          <div>
            <dt className="font-[510] text-fg">Limits and payouts</dt>
            <dd className="mt-1.5 text-muted">
              Two contracts on {chainLabel}
              {mandateAddress && poolAddress && (
                <>
                  : your agent&rsquo;s limits at <Contract address={mandateAddress} /> and the pool that pays you at <Contract address={poolAddress} />
                </>
              )}
              . Refusals are written to the chain too.
            </dd>
          </div>
          <div>
            <dt className="font-[510] text-fg">Money</dt>
            <dd className="mt-1.5 text-muted">USDC throughout: premiums, payouts, and the cents your agent pays per request for forecasts.</dd>
          </div>
        </dl>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 text-xs text-faint">
          <span className="flex items-center gap-2">
            <Mark className="size-4 text-muted" />
            Awning
          </span>
          <p className="max-w-xl">Awning buys cover written against exchange-traded contracts. It is not insurance, and cover can pay differently from what you actually lose.</p>
        </div>
      </div>
    </footer>
  );
}
