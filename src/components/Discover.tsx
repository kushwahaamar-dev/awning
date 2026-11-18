"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import type { Discovery } from "@/lib/discover/discover";
import { usd } from "@/lib/format";
import { post } from "./account";
import { Sketch } from "./Sketch";
import { SalesChart } from "./SalesChart";

const fetchCities = async (url: string): Promise<string[]> => (await (await fetch(url)).json()).cities ?? [];

type Found = Extract<Discovery, { finding: object }>;

function Result({ result, sample, onAgain }: { result: Found; sample: boolean; onAgain: () => void }) {
  const { finding, city, station, exposure } = result;
  const side = finding.direction === "below" ? "or below" : "or above";
  const figures = [
    { value: usd(finding.lossUsd), label: "lost on a day like that", detail: `most likely ${usd(finding.range[0])} to ${usd(finding.range[1])}` },
    { value: String(result.perYear), label: "days a year like that", detail: null },
    { value: usd(result.yearly), label: "a year, if the pattern holds", detail: null },
  ];
  // The test shuffles the weather 800 times; if none of those beat the real thing, that is all it can say.
  const rarity = finding.chance <= 1 / 800 ? "less than 1 time in 800" : `about 1 time in ${Math.round(1 / finding.chance)}`;

  return (
    <div className="pt-8 sm:pt-14">
      <button type="button" onClick={onAgain} className="link text-sm">
        Look at different sales
      </button>
      <h1 className="sign mt-5">
        A day at {finding.threshold}°F {side} in {city} costs you about {usd(finding.lossUsd)}.
      </h1>
      {sample && (
        <p className="lede mt-3">
          This is sample data: made-up sales for an ice cream truck, set against {city}&rsquo;s real weather for the past year.
        </p>
      )}

      <dl className="panel mt-8 grid gap-1.5 p-1.5 sm:grid-cols-3">
        {/* A term comes before its value in the markup; on the tile the number is read first, so the pair is stood on its head. */}
        {figures.map(({ value, label, detail }) => (
          <div key={label} className="inset flex flex-col-reverse justify-end p-4">
            <dt className="mt-2 text-sm text-muted">
              {label}
              {detail && <span className="mt-0.5 block">{detail}</span>}
            </dt>
            <dd className="figure">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <SalesChart days={result.days} finding={finding} />
      </div>
      <Link href={`/app?exposure=${encodeURIComponent(JSON.stringify(exposure))}`} className="btn btn-primary mt-8">
        Price cover for a day like that
      </Link>
      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-muted transition-colors select-none hover:text-fg">How this was worked out</summary>
        <p className="copy mt-3">
          Each day is compared with other days in the same month and on the same weekday, so a busy Saturday or a slow January isn&rsquo;t mistaken for
          weather.
        </p>
        <p className="copy mt-3">Weather with no real link to your sales would look this strong {rarity}.</p>
        <p className="copy mt-3">
          The highs are for {station}, the station Gemini settles {city}&rsquo;s market on. They come from a weather archive and can differ from the
          official reading by a degree or two.
        </p>
      </details>
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
    <div className="pt-8 sm:pt-14">
      <Sketch of="week" className="h-28" />
      <h1 className="sign mt-8">Find the weather that costs you money</h1>
      <p className="lede mt-3">Hand over your daily sales and Awning works out what a bad day costs you.</p>

      <form
        className="panel mt-7 p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) run(false);
        }}
      >
        <label htmlFor="sales" className="title block">
          Your daily sales
        </label>
        <p className="mt-1 text-sm text-muted">A CSV with a date and an amount on each row.</p>
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

        <label htmlFor="city" className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-5">
          <span className="title">Where you trade</span>
          <select id="city" value={city} onChange={(e) => setCity(e.target.value)} className="field">
            {(cities.length ? cities : [city]).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={!file || busy !== null} aria-busy={busy === "file"} className="btn btn-primary">
            {busy === "file" ? "Reading a year of weather…" : "Find my risk"}
          </button>
          {/* While the sample runs this is a report of work under way, so it stops looking like something to press. */}
          {busy === "sample" ? (
            <span aria-live="polite" className="status status-accent status-live text-fg">
              Reading a year of weather…
            </span>
          ) : (
            <button type="button" onClick={() => run(true)} disabled={busy !== null} className="link">
              Or try it on sample sales
            </button>
          )}
        </div>
        {error && <p className="note note-bad mt-5">{error}</p>}
        {result && !result.found.finding && <p className="note mt-5">{result.found.reason}</p>}
      </form>
      <p className="mt-3 text-sm text-faint">Your sales are read once and never stored.</p>
    </div>
  );
}
