import Link from "next/link";
import { Mark } from "./Logo";

// The landing page's sections, reachable from the foot of any page.
const ABOUT = [
  { href: "/#prices", label: "Prices" },
  { href: "/#limits", label: "Limits" },
  { href: "/#built", label: "How it’s built" },
  { href: "/#checked", label: "What we checked" },
];

export function Footer() {
  return (
    <footer className="overflow-hidden border-t border-line">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-8">
        <span className="flex items-center gap-2 text-xs text-muted">
          <Mark className="size-4" />
          Awning
        </span>
        <nav aria-label="About Awning" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {ABOUT.map(({ href, label }) => (
            <Link key={href} href={href} className="text-muted transition-colors hover:text-fg">
              {label}
            </Link>
          ))}
        </nav>
        <p className="basis-full text-xs text-faint">Not insurance. Cover is written against exchange-traded contracts and can pay differently from what you lose.</p>
      </div>
      <div className="wrap">
        <div className="wordmark-fit">
          <p aria-hidden className="wordmark">
            Awning
          </p>
        </div>
      </div>
    </footer>
  );
}
