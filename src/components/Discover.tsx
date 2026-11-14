"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import useSWR from "swr";
import type { Discovery } from "@/lib/discover/discover";
import { usd } from "@/lib/format";
import { post } from "./account";
import { Ascii } from "./Ascii";
import { SalesChart } from "./SalesChart";

const fetchCities = async (url: string): Promise<string[]> => (await (await fetch(url)).json()).cities ?? [];
const order = (i: number) => ({ "--i": i }) as CSSProperties;

type Found = Extract<Discovery, { finding: object }>;

function Result({ result, sample, onAgain }: { result: Found; sample: boolean; onAgain: () => void }) {
  const { finding, city, station, exposure } = result;
  const side = finding.direction === "below" ? "or below" : "or above";
  const figures = [
    { value: usd(finding.lossUsd), label: `lost on a day like that, most likely between ${usd(finding.range[0])} and ${usd(finding.range[1])}` },
    { value: String(result.perYear), label: `days a year like that, going by the ${finding.days} days in this file` },
    { value: usd(result.yearly), label: "a year, if the pattern holds" },
  ];
  // The test shuffles the weather 800 times; if none of those beat the real thing, that is all it can say.
  const rarity = finding.chance <= 1 / 800 ? "less than 1 time in 800" : `about 1 time in ${Math.round(1 / finding.chance)}`;

  return (
    <div className="pt-14 sm:pt-20">
      <button type="button" onClick={onAgain} className="link text-sm">
        Look at different sales
      </button>
      {sample && (
        <p className="note mt-6 max-w-2xl text-sm">
          This is sample data: made-up takings for an ice cream truck, set against {city}&rsquo;s real weather for the past year.
        </p>
      )}
      <h1 className="heading rise mt-6 max-w-4xl">
        Days at {finding.threshold}°F {side} in {city} cost you about {usd(finding.lossUsd)}.
      </h1>

      <dl className="rise mt-10 grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line" style={order(1)}>
        {figures.map(({ value, label }) => (
          <div key={label} className="py-6 md:px-8 md:first:pl-0">
            <dd className="figure text-[clamp(2.5rem,4.6vw,4rem)] leading-none">{value}</dd>
            <dt className="mt-3 max-w-xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="rise mt-12 grid items-start gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" style={order(2)}>
        <SalesChart days={result.days} finding={finding} />
        <div>
          <h2 className="title">How this was worked out</h2>
          <ul className="rows mt-4 border-y border-line text-soft">
            <li className="py-3">
              Each day is compared with other days in the same month and on the same weekday, so a busy Saturday or a slow January isn&rsquo;t mistaken for
              weather.
            </li>
            <li className="py-3">Weather with no real link to your sales would look this strong {rarity}.</li>
            <li className="py-3">
              The highs are for {station}, the station Gemini settles {city}&rsquo;s market on. They come from a weather archive and can differ from the
              official reading by a degree or two.
            </li>
          </ul>
          <Link href={`/app?exposure=${encodeURIComponent(JSON.stringify(exposure))}`} className="btn btn-lg btn-primary mt-8">
            Price cover for a day like that
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Finds the weather that costs a business money from its own sales, instead of asking the owner to know. */
export function Discover() {
  const { data: cities = [] } = useSWR("/api/discover", fetchCities);
  const [city, setCity] = useState("Austin");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState<"file" | "sample" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ found: Discovery; sample: boolean } | null>(null);

  async function run(sample: boolean) {
    setBusy(sample ? "sample" : "file");
    setError(null);
    try {
      // The sample truck trades wherever the server finds a fair demonstration that day, whatever is chosen here.
      const found = await post<Discovery>("/api/discover", sample ? { city } : { city, csv: file!.text });
      setResult({ found, sample });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (result?.found.finding) return <Result result={result.found} sample={result.sample} onAgain={() => setResult(null)} />;

  return (
    <div className="grid items-start gap-x-14 gap-y-10 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section>
        <h1 className="heading rise">Find the weather that costs you money</h1>
        <p className="rise mt-4 max-w-xl text-lg text-muted" style={order(1)}>
          Hand over your daily sales. Awning sets them against the weather on each of those days and works out what a bad day costs you.
        </p>

        <form
          className="rise panel mt-8 max-w-2xl p-6"
          style={order(2)}
          onSubmit={(e) => {
            e.preventDefault();
            if (file) run(false);
          }}
        >
          <label htmlFor="sales" className="block font-[510]">
            Your daily sales
          </label>
          <p className="mt-1 text-sm text-muted">A spreadsheet export with a date and an amount on each row. Two months at least; a year is better.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="btn btn-secondary cursor-pointer">
              Choose a file
              <input
                id="sales"
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  setFile(picked ? { name: picked.name, text: await picked.text() } : null);
                  setError(null);
                }}
              />
            </label>
            <span className="num text-sm text-muted">{file ? file.name : "No file chosen"}</span>
          </div>

          <label htmlFor="city" className="mt-6 flex items-baseline justify-between gap-4 border-t border-line pt-5">
            <span>Where you trade</span>
            <select id="city" value={city} onChange={(e) => setCity(e.target.value)} className="field">
              {(cities.length ? cities : [city]).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="submit" disabled={!file || busy !== null} className="btn btn-lg btn-primary">
              {busy === "file" ? "Reading a year of weather…" : "Find my risk"}
            </button>
            <button type="button" onClick={() => run(true)} disabled={busy !== null} className="link">
              {busy === "sample" ? "Reading a year of weather…" : "Or try it on sample sales"}
            </button>
          </div>
          {error && <p className="note note-bad mt-5 text-sm">{error}</p>}
          {result && !result.found.finding && <p className="note mt-5 text-sm">{result.found.reason}</p>}
        </form>
        <p className="rise mt-5 max-w-2xl text-sm text-faint" style={order(3)}>
          Your sales are read once to do the sums and are not stored.
        </p>
      </section>
      <div className="rise max-lg:hidden" style={order(4)}>
        <Ascii scene="snow" label="Snow falling over a pine valley at night" className="fade-soft" />
      </div>
    </div>
  );
}
