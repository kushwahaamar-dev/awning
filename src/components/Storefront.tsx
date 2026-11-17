"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { chain, isLocalChain } from "@/lib/chain/config";
import { Logo } from "./Logo";

const PAGES = [
  { href: "/app", label: "Cover" },
  { href: "/find", label: "Find a risk" },
  { href: "/agent", label: "Your agent" },
];

/**
 * The line across the top, the same on every page: home, the three things the app does, and the chain it is on.
 * On a desk the three start on the page's middle line, where the landing page's own line comes down.
 */
export function Storefront() {
  const path = usePathname();
  return (
    <header className="wrap relative flex h-16 items-center justify-between gap-3 lowercase">
      <Link href="/" aria-label="Awning, home">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex gap-3 whitespace-nowrap min-[390px]:gap-5 lg:absolute lg:left-[calc(50%+var(--gutter))] lg:gap-8">
        {PAGES.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={`py-2 underline-offset-[0.4em] transition-colors ${path === href ? "underline" : "text-muted hover:text-fg"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <span className="status status-good text-[0.9375rem] text-muted max-lg:hidden">{isLocalChain ? "Local test chain" : chain.name}</span>
    </header>
  );
}
