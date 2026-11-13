"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Sky } from "./Sky";

const LINKS = [
  { href: "/", label: "Cover" },
  { href: "/agent", label: "Your agent" },
];

/** The shop sign, the awning under it, and the sky behind. The awning's reach follows the --cover custom property. */
export function Storefront() {
  const path = usePathname();
  return (
    <header>
      <div className="fascia">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-10 sm:py-4">
          <Link href="/" aria-label="Awning, home" className="rounded-lg">
            <Logo className="h-9 w-auto sm:h-11" />
          </Link>
          <nav aria-label="Main" className="flex gap-1 rounded-full bg-cream/10 p-1 text-sm font-semibold whitespace-nowrap sm:text-base">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 transition-colors sm:px-4 ${path === href ? "bg-cream text-ink" : "hover:bg-cream/15"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {/* Fixed height, so rolling the awning in and out never moves the page under the pointer. */}
      <div aria-hidden className="awning pointer-events-none">
        <Sky />
        <div className="awning-cloth">
          <div className="awning-canvas" />
          <div className="awning-valance" />
        </div>
        <div className="awning-shade" />
      </div>
    </header>
  );
}
