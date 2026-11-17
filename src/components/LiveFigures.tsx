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
    <dl className="mt-24 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-6 lg:grid-cols-[auto_auto_auto_auto_auto] lg:justify-between" aria-live="off">
      {/* Five figures: two, two and one across a phone, three and two across a tablet, all five across a desk. */}
      {figures.map(({ label, value }, i) => (
        <div key={label} className={`lg:col-span-1 ${i < 3 ? "sm:col-span-2" : "sm:col-span-3"} ${i === 4 ? "max-sm:col-span-2" : ""}`}>
          <dd className="figure text-[2rem] leading-none lg:text-[2.75rem]">{value}</dd>
          <dt className="mt-2 text-muted">{label}</dt>
        </div>
      ))}
    </dl>
  );
}
