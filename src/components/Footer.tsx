import { chain, isLocalChain } from "@/lib/chain/config";

export function Footer() {
  return (
    <footer className="wrap pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-12 gap-y-3 border-t border-line pt-6 text-sm text-faint">
        <p>Not insurance. Cover is written against exchange-traded contracts and can pay differently from what you lose.</p>
        <p className="status status-good whitespace-normal text-faint">Running on {isLocalChain ? "a local test chain" : chain.name}, with test dollars</p>
      </div>
    </footer>
  );
}
