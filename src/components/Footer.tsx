import Link from "next/link";

// The landing page's parts, reachable from the foot of any page.
const ABOUT = [
  { href: "/#prices", label: "Prices" },
  { href: "/#limits", label: "Limits" },
  { href: "/#built", label: "How it’s built" },
  { href: "/#checked", label: "What we checked" },
];

export function Footer() {
  return (
    <footer className="wrap overflow-hidden pt-10">
      <div className="grid gap-y-6 lg:grid-cols-2">
        <p className="copy text-muted">Not insurance. Cover is written against exchange-traded contracts and can pay differently from what you lose.</p>
        {/* Four in a row where they fit, two and two on a narrow phone, never three and one. */}
        <nav aria-label="About Awning" className="flex flex-wrap content-start gap-x-8 gap-y-2 lowercase max-[389px]:grid max-[389px]:grid-cols-2 lg:pl-[var(--gutter)]">
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
