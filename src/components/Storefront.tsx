"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const PAGES = [
  { href: "/app", label: "Get cover" },
  { href: "/find", label: "Find my risk" },
  { href: "/agent", label: "My agent" },
];

/** The line across the top, the same on every page: home, and the three things the app does. */
export function Storefront() {
  const path = usePathname();
  return (
    <header className="wrap flex h-20 items-center justify-between gap-4">
      <Link href="/" aria-label="Awning, home">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex items-center whitespace-nowrap max-sm:text-sm sm:gap-2">
        {PAGES.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={`rounded-full px-2 py-2 transition-colors sm:px-4 ${path === href ? "bg-raised text-fg" : "text-muted hover:text-fg"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
