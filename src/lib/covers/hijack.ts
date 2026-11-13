import { toHex, type Address, type Hex } from "viem";
import { drawFloat, openHedge, readAllowance, venueAddress, type Attempt } from "../chain/server";

const ATTACKER: Address = "0xbad0000000000000000000000000000000000bad";
const NO_SIGNATURE: Hex = "0x";
const randomId = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

export type HijackStep = { tried: string; amount: number } & Attempt;

/**
 * Plays an attacker who fully controls the agent: same key, no scruples. Nothing here is simulated.
 * Each step is a real transaction signed by the agent, and the mandate decides what happens to it.
 */
export async function hijack(owner: Address): Promise<{ steps: HijackStep[]; taken: number }> {
  const allowance = await readAllowance(owner);
  if (allowance.balance <= 0) return { steps: [], taken: 0 };

  const steps: HijackStep[] = [];
  const attempt = async (tried: string, amount: number, run: () => Promise<Attempt>) => {
    steps.push({ tried, amount, ...(await run()) });
  };
  const premium = (amount: number, venue: Address) =>
    openHedge({ owner, hedgeId: randomId(), venue, premium: amount, maxPayout: amount, marketRef: randomId(), deadline: inAnHour(), ownerSignature: NO_SIGNATURE });

  // Small enough to pass every spending cap, so the only thing in the way is who it's going to.
  const quiet = Math.min(allowance.balance, allowance.perCoverCap, allowance.approvalThreshold) || allowance.balance;
  await attempt("Pay a premium to the attacker's own address", quiet, () => premium(quiet, ATTACKER));
  await attempt("Spend the whole balance on one premium", allowance.balance, () => premium(allowance.balance, venueAddress()));
  await attempt("Draw the whole balance as data spending", allowance.balance, () => drawFloat(owner, allowance.balance, randomId()));
  if (allowance.dataLeftToday > 0) {
    await attempt("Take what's left of today's data allowance", allowance.dataLeftToday, () => drawFloat(owner, allowance.dataLeftToday, randomId()));
  }

  return { steps, taken: steps.reduce((sum, s) => sum + (s.ok ? s.amount : 0), 0) };
}
