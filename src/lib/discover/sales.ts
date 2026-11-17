export type Sale = { day: string; amount: number };

const MAX_ROWS = 1500;

const pad = (n: string) => n.padStart(2, "0");

/** Reads a date written as 2026-03-14, 3/14/2026 or 3/14/26. */
function readDay(text: string): string | null {
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) return `${us[3].length === 2 ? `20${us[3]}` : us[3]}-${pad(us[1])}-${pad(us[2])}`;
  return null;
}

/** Reads an amount written as 1204, 1,204.50 or $1,204.50. */
function readAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s"]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Splits one line of a CSV, respecting quoted fields, which is how "1,204.50" survives. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if ((ch === "," || ch === "\t" || ch === ";") && !quoted) {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

/**
 * Reads daily sales from a spreadsheet export: one row a day, a date and an amount, in any columns.
 * Several rows for the same day are added up, so a list of individual sales works too.
 */
export function parseSales(text: string): Sale[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(cells);
  if (rows.length > MAX_ROWS * 40) throw new Error("That file is too large. Export daily totals instead of every sale.");

  const totals = new Map<string, number>();
  for (const row of rows) {
    const at = row.findIndex((cell) => readDay(cell) !== null);
    if (at < 0) continue; // a header, or a line that isn’t a day
    const amount = row.map((cell, i) => (i === at ? null : readAmount(cell))).findLast((value) => value !== null);
    if (amount == null) continue;
    const day = readDay(row[at])!;
    totals.set(day, (totals.get(day) ?? 0) + amount);
  }

  if (totals.size === 0) throw new Error("Couldn’t find any rows with a date and an amount. Each row needs both, like 2026-03-14, 1204.50");
  if (totals.size > MAX_ROWS) throw new Error("That covers more than four years. Send the most recent year or two.");
  return [...totals].map(([day, amount]) => ({ day, amount })).sort((a, b) => a.day.localeCompare(b.day));
}
