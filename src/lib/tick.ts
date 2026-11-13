import { settleOpenCovers } from "./covers/service";
import { pollChain } from "./ledger/ingest";
import { usesStreams } from "./ledger/source";
import { recordOdds } from "./odds";

let running = false;

/** One pass of the background work: settle what has resolved, and note where prices are. */
export async function tick() {
  if (running) return;
  running = true;
  try {
    await settleOpenCovers();
    await recordOdds();
    if (!usesStreams) await pollChain();
  } finally {
    running = false;
  }
}
