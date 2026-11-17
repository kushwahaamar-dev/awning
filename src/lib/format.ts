const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const usd = (n: number) => (Number.isInteger(n) ? wholeDollars : dollars).format(n);
export const cents = (n: number) => dollars.format(n);
export const percent = (p: number) => `${Math.round(p * 100)}%`;

export function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** For a bare calendar date (YYYY-MM-DD), which must not shift when read in a timezone behind UTC. */
export function calendarDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** How long ago something happened, in the largest unit that fits. */
export function ago(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  const some = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return some(minutes, "minute");
  const hours = Math.round(minutes / 60);
  return hours < 48 ? some(hours, "hour") : some(Math.round(hours / 24), "day");
}

/** Apostrophes as type sets them, for text that arrives with a keyboard's straight ones: a model's sentence, a market's title. */
export const typeset = (text: string) => text.replace(/(?<=[\p{L}\d])'(?=\p{L})/gu, "’").replace(/(?<=s)'(?=[\s.,;:!?]|$)/g, "’");
