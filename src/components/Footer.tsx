import { chainLabel, explorerAddress, mandateAddress } from "@/lib/chain/config";
import { shortAddress } from "@/lib/format";
import { Logo } from "./Logo";

/** What is real behind the page, and where to check it. */
export function Footer() {
  const contractPage = mandateAddress && explorerAddress(mandateAddress);
  return (
    <footer className="overflow-hidden bg-ink">
      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-10">
        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-3">
          <div>
            <dt className="font-bold text-sun">Markets and payouts</dt>
            <dd className="mt-1 text-haze">Gemini prediction markets. Awning never decides whether something happened; Gemini&rsquo;s resolution does.</dd>
          </div>
          <div>
            <dt className="font-bold text-sun">Limits</dt>
            <dd className="mt-1 text-haze">
              Held by a contract on {chainLabel}
              {mandateAddress && (
                <>
                  {" "}
                  at{" "}
                  {contractPage ? (
                    <a href={contractPage} target="_blank" rel="noreferrer" className="link till text-cream">
                      {shortAddress(mandateAddress)}
                    </a>
                  ) : (
                    <span className="till text-cream">{shortAddress(mandateAddress)}</span>
                  )}
                </>
              )}
              . Refusals are written to the chain too.
            </dd>
          </div>
          <div>
            <dt className="font-bold text-sun">Money</dt>
            <dd className="mt-1 text-haze">USDC throughout. Premiums, payouts, and the cents your agent pays per request for forecasts.</dd>
          </div>
        </dl>
        <p className="mt-10 max-w-xl text-sm text-haze/80">
          Awning buys exchange-traded contracts on your behalf. It is not insurance, and cover can pay differently from what you actually lose.
        </p>
      </div>
      <Logo className="mx-auto mt-14 -mb-[6.5vw] block w-[92vw] max-w-none text-cobalt" />
    </footer>
  );
}
