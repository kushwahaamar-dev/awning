import { after } from "next/server";
import { runStanding } from "./agent/standing";
import { settleOpenCovers } from "./covers/service";
import { keepListings } from "./gemini/lastGood";
import { catchUp } from "./ledger/ingest";
import { recordOdds } from "./odds";

let running = false;
let last = 0;

/**
 * One pass of the background work: settle what has resolved, let the agent look after standing
 * orders, and note where prices are.
 * @param origin where this server is reachable, for the agent to buy from its data desk
 */
export async function tick(origin: string) {
  if (running) return;
  running = true;
  // Each piece of work is done whatever became of the one before: cover that has resolved is still paid on
  // a night when Gemini's listings can't be read. The first thing to go wrong is reported once all are done.
  const failures: unknown[] = [];
  try {
    for (const work of [settleOpenCovers, () => runStanding(origin), recordOdds, keepListings, catchUp]) {
      await work().catch((error) => failures.push(error));
    }
  } finally {
    running = false;
  }
  if (failures.length) throw failures[0];
}

/**
 * The same pass, at most once a minute. Hosts with no long-running process and no minute cron call
 * this after serving a page, so the work gets done while anyone is looking.
 */
export async function tickIfDue(origin: string) {
  if (Date.now() - last < 60_000) return;
  last = Date.now();
  await tick(origin).catch((error) => console.error("tick failed", error));
}

/**
 * On a host with no long-running process nothing happens between requests, so the pass rides on whichever
 * request comes: after it has been answered, and no more than once a minute.
 */
export function wake(request: Request) {
  if (process.env.VERCEL) after(() => tickIfDue(new URL(request.url).origin));
}
