import { settleOpenCovers } from "./covers/service";
import { recordOdds } from "./odds";

let running = false;

/** One pass of the background work: settle what has resolved, and note where prices are. */
export async function tick() {
  if (running) return;
  running = true;
  try {
    await settleOpenCovers();
    await recordOdds();
  } finally {
    running = false;
  }
}
