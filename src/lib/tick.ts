import { runStanding } from "./agent/standing";
import { settleOpenCovers } from "./covers/service";
import { catchUp } from "./ledger/ingest";
import { recordOdds } from "./odds";

let running = false;

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
