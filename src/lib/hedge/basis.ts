import type { Market } from "../gemini/market";
import type { Exposure } from "./exposure";
import type { Coverage } from "./legs";

export type Basis = {
  /** 0–100. How closely a payout from this cover tracks the user's actual loss. A heuristic, not a statistic. */
  fit: number;
  level: "close" | "partial" | "loose";
  notes: string[];
};

const WIDE_SPREAD = 0.15;

function settlementNote(market: Market): string {
  const { subject } = market;
  if (subject.family === "temperature") {
    const where = subject.station ?? `the official ${subject.city} station`;
    return `Settles on the high recorded at ${where}, not at your address.`;
  }
  if (subject.family === "price") {
    return `Settles on a reference price for ${subject.name} at one moment, which can differ from what you actually pay.`;
  }
  return "Settles on the official result of the game.";
}

export function assessBasis(exposure: Exposure, market: Market, coverage: Coverage): Basis {
  const notes = [settlementNote(market)];
  let fit = 100;

  if (exposure.proxyNote) {
    notes.push(exposure.proxyNote);
    fit -= 30;
  }

  const { trigger } = exposure;
  if (coverage.snappedTo !== null && trigger.family !== "game") {
    const unit = market.unit === "$" ? "$" : "";
    const suffix = market.unit === "°F" ? "°F" : "";
    const gap = Math.abs(coverage.snappedTo - trigger.threshold) / Math.max(Math.abs(trigger.threshold), 1);
    notes.push(
      `The market's steps put the start of cover at ${unit}${coverage.snappedTo}${suffix} instead of your ${unit}${trigger.threshold}${suffix}.`,
    );
    fit -= Math.min(20, 5 + Math.round(gap * 200));
  }

  if (market.subject.family === "temperature" && exposure.on && market.subject.day && market.subject.day !== exposure.on) {
    notes.push(`The nearest listed market is for ${market.subject.day}, not ${exposure.on}.`);
    fit -= 15;
  }

  if (exposure.recurring && market.subject.family === "temperature") {
    notes.push("This covers one day. Each further day you want covered is a separate purchase.");
  }

  const unquoted = coverage.legs.some((l) => l.ask === null);
  const wide = coverage.legs.some((l) => l.bid !== null && l.ask !== null && l.ask - l.bid > WIDE_SPREAD);
  if (unquoted) {
    notes.push("Nobody is offering this right now, so the order would wait on the book and may not fill.");
    fit -= 10;
  } else if (wide) {
    notes.push("The gap between buyers and sellers is wide, so a resting order is noticeably cheaper than buying now.");
    fit -= 5;
  }

  fit = Math.max(0, fit);
  return { fit, level: fit >= 80 ? "close" : fit >= 55 ? "partial" : "loose", notes };
}
