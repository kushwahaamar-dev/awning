"use client";

import { useEffect } from "react";

// How far down the window the tip of the line is kept: a little below the middle, where the eye is reading.
const TIP = 0.62;

/**
 * Draws the page's line as far as the reader has scrolled. Every stretch is in ink from the start, so the page
 * is whole without this; with it, what lies below the tip goes faint until it is reached. Anything marked
 * `data-passed` is told how far the tip has got through it, which is how the line crosses out what it passes.
 * Anyone who prefers stillness keeps the whole line, and everything crossed out.
 */
export function Drawn() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const legs = [...document.querySelectorAll<HTMLElement>("[data-leg]")];
    const passed = [...document.querySelectorAll<HTMLElement>("[data-passed]")];
    let frame = 0;
    const draw = () => {
      const tip = innerHeight * TIP;
      for (const leg of legs) {
        const { top, height } = leg.getBoundingClientRect();
        leg.style.setProperty("--turned", tip > top ? "1" : "0");
        leg.style.setProperty("--drawn", Math.min(1, Math.max(0, (tip - top) / height)).toFixed(4));
      }
      for (const each of passed) {
        const { top, height } = each.getBoundingClientRect();
        each.style.setProperty("--passed", Math.min(1, Math.max(0, (tip - top) / height)).toFixed(4));
      }
    };
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    draw();
    addEventListener("scroll", follow, { passive: true });
    addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", follow);
      removeEventListener("resize", follow);
      for (const leg of legs) {
        leg.style.removeProperty("--turned");
        leg.style.removeProperty("--drawn");
      }
      for (const each of passed) each.style.removeProperty("--passed");
    };
  }, []);
  return null;
}
