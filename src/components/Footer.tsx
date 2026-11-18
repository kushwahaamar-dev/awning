import Link from "next/link";
import { chain, isLocalChain } from "@/lib/chain/config";

// The landing page's parts, reachable from the foot of any page.
const ABOUT = [
  { href: "/#how", label: "How it works" },
  { href: "/#prices", label: "Prices" },
  { href: "/#trust", label: "Why trust it" },
  { href: "/#faq", label: "Questions" },
  { href: "/#built", label: "How it’s made" },
];

export function Footer() {
  return (
    <footer className="wrap overflow-hidden pt-10">
      <div className="grid gap-y-6 lg:grid-cols-2">
        <div>
          <p className="copy text-muted">Not insurance. Cover is written against exchange-traded contracts and can pay differently from what you lose.</p>
          <p className="status status-good mt-4">Running on {isLocalChain ? "a local test chain" : chain.name}, with test dollars</p>
        </div>
        <nav aria-label="About Awning" className="flex flex-wrap content-start gap-x-8 gap-y-2">
          {ABOUT.map(({ href, label }) => (
            <Link key={href} href={href} className="text-muted transition-colors hover:text-fg">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="wordmark-fit mt-16">
        <p aria-hidden className="wordmark">
          awning
        </p>
      </div>
    </footer>
  );
}
