import { runStanding } from "./agent/standing";
import { settleOpenCovers } from "./covers/service";
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
  try {
    await settleOpenCovers();
    await runStanding(origin);
    await recordOdds();
    await catchUp();
  } finally {
    running = false;
  }
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
