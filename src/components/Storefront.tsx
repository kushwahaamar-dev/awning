"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Cover" },
  { href: "/agent", label: "Your agent" },
];

/** The shop sign and the awning under it. The awning's reach follows the --cover custom property. */
export function Storefront() {
  const path = usePathname();
  return (
    <header>
      <div className="fascia text-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-10">
          <Link href="/" className="display flex items-center gap-2.5 text-[1.75rem] sm:gap-3 sm:text-[2.25rem]">
            <svg aria-hidden viewBox="0 0 30 16" className="h-4.5 w-auto fill-marigold sm:h-6">
              <path d="M2 0h26a2 2 0 0 1 2 2v7H0V2a2 2 0 0 1 2-2Z" />
              <path d="M0 10.5h10a5 5 0 0 1-10 0Zm10 0h10a5 5 0 0 1-10 0Zm10 0h10a5 5 0 0 1-10 0Z" />
            </svg>
            Awning
          </Link>
          <nav aria-label="Main" className="flex gap-1 rounded-full bg-paper/10 p-1 text-sm font-semibold whitespace-nowrap sm:text-base">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 transition-colors sm:px-4 ${path === href ? "bg-paper text-awning-deep" : "hover:bg-paper/10"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {/* Fixed height, so rolling the awning in and out never moves the page under the pointer. */}
      <div aria-hidden className="awning pointer-events-none">
        <div className="awning-cloth">
          <div className="awning-canvas" />
          <div className="awning-valance" />
        </div>
        <div className="awning-shade" />
      </div>
    </header>
  );
}
