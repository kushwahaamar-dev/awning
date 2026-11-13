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
    { label: "Attempts refused onchain", value: data?.refused ?? "…" },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[0.875rem] border border-line bg-line sm:grid-cols-3 lg:grid-cols-5" aria-live="off">
      {figures.map(({ label, value }) => (
        <div key={label} className="bg-bg px-5 py-4">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="num mt-1.5 text-xl">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
