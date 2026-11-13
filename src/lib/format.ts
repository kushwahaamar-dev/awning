const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const usd = (n: number) => (Number.isInteger(n) ? wholeDollars : dollars).format(n);
export const cents = (n: number) => dollars.format(n);
export const percent = (p: number) => `${Math.round(p * 100)}%`;

export function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
