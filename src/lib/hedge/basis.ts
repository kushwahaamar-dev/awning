import { calendarDay } from "../format";
import type { Market } from "../gemini/market";
import { knownStation } from "../weather/stations";
import type { Exposure } from "./exposure";
import type { Coverage } from "./legs";
import { marketDay } from "./match";

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
    // Our own table's name for the station where we have one: Gemini's wording of it repeats the state.
    const where = knownStation(subject.cityCode)?.name ?? subject.station ?? `the official ${subject.city} station`;
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
    const level = (n: number) => (market.unit === "$" ? `$${n}` : `${n}${market.unit === "°F" ? "°F" : ""}`);
    // A level that starts sooner than the risk pays on days that cost nothing; one that starts later misses days that do.
    const sooner = (trigger.direction === "below") === coverage.snappedTo > trigger.threshold;
    notes.push(
      `Cover starts at ${level(coverage.snappedTo)}, not your ${level(trigger.threshold)}: that is the nearest level Gemini lists. ${
        sooner ? "It will also pay on days that don’t cost you, and is priced for that." : "The days in between will cost you without paying."
      }`,
    );
    // Three points a degree: three degrees off is still close, eight is partly, fifteen is a different risk.
    // A price is judged by how far off it is in proportion.
    const gap = Math.abs(coverage.snappedTo - trigger.threshold);
    fit -= trigger.family === "temperature" ? Math.min(60, Math.round(gap * 3)) : Math.min(60, 5 + Math.round((gap / Math.max(Math.abs(trigger.threshold), 1)) * 200));
  }

  const day = marketDay(market);
  if (exposure.on && day !== exposure.on) {
    notes.push(`The nearest listed market is for ${calendarDay(day)}, not ${calendarDay(exposure.on)}.`);
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
