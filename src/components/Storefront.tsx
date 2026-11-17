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

/** The bar across the top, the same on every page: home, the three things the app does, and the chain it is on. */
export function Storefront() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="wrap flex h-14 items-center gap-2 min-[360px]:gap-4 sm:gap-8">
        <Link href="/" aria-label="Awning, home" className="rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex gap-0.5 text-sm whitespace-nowrap sm:gap-1">
          {PAGES.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className={`rounded-md px-1.5 py-1.5 transition-colors min-[360px]:px-2.5 sm:px-3 ${path === href ? "bg-white/[0.07] text-fg" : "text-muted hover:text-fg"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <span className="status status-good ml-auto text-muted max-sm:hidden">{isLocalChain ? "Local test chain" : chain.name}</span>
      </div>
    </header>
  );
}
