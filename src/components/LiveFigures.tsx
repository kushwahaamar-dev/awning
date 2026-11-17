"use client";

import useSWR from "swr";
import type { PoolState } from "@/lib/chain/server";
import { usd } from "@/lib/format";

type Stats = { pool: PoolState; covers: number; paidOut: number; refused: number };

const fetchStats = async (url: string): Promise<Stats> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("no figures");
  return res.json();
};

/** A strip of figures read live: the pool from the chain, the rest from what has happened so far. */
export function LiveFigures() {
  const { data } = useSWR("/api/stats", fetchStats, { refreshInterval: 10_000 });
  const dollars = (n: number | undefined) => (n === undefined ? "…" : usd(Math.round(n)));
  const figures = [
    { label: "In the pool", value: dollars(data?.pool.assets) },
    { label: "Locked behind cover", value: dollars(data?.pool.locked) },
    { label: "Covers written", value: data?.covers ?? "…" },
    { label: "Paid out", value: dollars(data?.paidOut) },
    { label: "Refused by the contract", value: data?.refused ?? "…" },
  ];

  return (
    <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-6 lg:grid-cols-5 lg:divide-x lg:divide-line" aria-live="off">
      {/* Five figures: two, two and one across a phone, three and two across a tablet, all five across a desk. */}
      {figures.map(({ label, value }, i) => (
        <div key={label} className={`py-5 pr-5 lg:col-span-1 lg:px-5 lg:first:pl-0 ${i < 3 ? "sm:col-span-2" : "sm:col-span-3"} ${i === 4 ? "max-sm:col-span-2" : ""}`}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="figure mt-1 text-[2rem] leading-tight lg:text-[2.75rem]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
