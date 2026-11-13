"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { chain, isLocalChain } from "@/lib/chain/config";
import { Logo } from "./Logo";

const APP = [
  { href: "/app", label: "Cover" },
  { href: "/agent", label: "Your agent" },
];

const STORY = [
  { href: "#how", label: "How it works" },
  { href: "#built", label: "How it's built" },
  { href: "#checked", label: "What we checked" },
];

/** The bar across the top. On the landing page it leads into the story; inside the app it switches pages. */
export function Storefront() {
  const path = usePathname();
  const landing = path === "/";
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label="Awning, home" className="rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex gap-1 text-sm">
          {landing
            ? STORY.map(({ href, label }) => (
                <a key={href} href={href} className="rounded-md px-3 py-1.5 text-muted transition-colors hover:text-fg max-md:hidden">
                  {label}
                </a>
              ))
            : APP.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={path === href ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 transition-colors ${path === href ? "bg-white/[0.07] text-fg" : "text-muted hover:text-fg"}`}
                >
                  {label}
                </Link>
              ))}
        </nav>
        <span className="ml-auto flex items-center gap-3">
          <span className="badge max-sm:hidden">
            <span className="dot text-good" />
            {isLocalChain ? "Local test chain" : chain.name}
          </span>
          {landing && (
            <Link href="/app" className="btn btn-primary h-8 px-3 text-sm">
              Open the app
            </Link>
          )}
        </span>
      </div>
    </header>
  );
}
