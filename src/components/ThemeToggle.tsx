"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/theme";
import { Moon, Sun } from "./icons";

type Theme = "light" | "dark";
const shown = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function chosen() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

// The page's theme lives on <html>, where the script in the layout puts it before anything is painted. This watches it there.
function watch(changed: () => void) {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Switches the page between light and dark, and remembers which. Until it is pressed, the page follows the device. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(watch, shown, () => null);

  // A device can change its mind while the page is open, at sunset say. The page goes with it unless the visitor has chosen.
  useEffect(() => {
    const device = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (!chosen()) document.documentElement.dataset.theme = device.matches ? "dark" : "light";
    };
    device.addEventListener("change", follow);
    return () => device.removeEventListener("change", follow);
  }, []);

  function flip() {
    const next: Theme = shown() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // With nowhere to keep the choice it still holds for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-fg ${className}`}
    >
      {/* Which of the two shows is decided by the page's theme in the stylesheet, so it is right from the first paint. */}
      <Moon className="by-day size-4" />
      <Sun className="by-night size-4" />
    </button>
  );
}
