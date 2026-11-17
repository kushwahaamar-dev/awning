import { toHex, type Address, type Hex } from "viem";
import { poolAddress } from "../chain/config";
import { drawFloat, openHedge, readAllowance, rejectPremium, type Attempt } from "../chain/server";
import { ATTEMPTS } from "./attempts";

const ATTACKER: Address = "0xbad0000000000000000000000000000000000bad";
const NO_SIGNATURE: Hex = "0x";
const randomId = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

/** `returned` marks money the mandate let through that the pool then sent back. */
export type HijackStep = { tried: string; amount: number; returned?: true } & Attempt;

/**
 * Plays an attacker who fully controls the agent: same key, no scruples. Nothing here is simulated.
 * Each step is a real transaction signed by the agent, and the contracts decide what happens to it.
 * It costs the owner real money: the last step keeps what is left of the day's data budget, and
 * the dollar that goes to the pool and back still counts against the month's cover limit.
 */
export async function hijack(owner: Address): Promise<{ steps: HijackStep[]; taken: number }> {
  const allowance = await readAllowance(owner);
  if (allowance.balance <= 0) return { steps: [], taken: 0 };

  const steps: HijackStep[] = [];
  const attempt = async (tried: string, amount: number, run: () => Promise<Attempt>) => {
    steps.push({ tried, amount, ...(await run()) });
  };
  const premium = (id: Hex, amount: number, venue: Address) =>
    openHedge({ owner, hedgeId: id, venue, premium: amount, maxPayout: amount, marketRef: randomId(), deadline: inAnHour(), ownerSignature: NO_SIGNATURE });

  // Small enough to pass every spending cap, so the only thing in the way is who it's going to.
  const quiet = Math.min(allowance.balance, allowance.perCoverCap, allowance.approvalThreshold) || 1;
  await attempt(ATTEMPTS.ownAddress, quiet, () => premium(randomId(), quiet, ATTACKER));

  // The pool is on the owner's list and a dollar is inside every limit, so the mandate has no reason
  // to refuse. The pool never offered this cover, though, and it sends back what it didn't offer.
  const stray = randomId();
  const dollar = Math.min(1, quiet);
  await attempt(ATTEMPTS.unoffered, dollar, () => premium(stray, dollar, poolAddress));
  const last = steps.at(-1)!;
  if (last.ok) {
    await rejectPremium(owner, stray);
    last.returned = true;
  }

  // Each of these is sized past a limit, so it is refused whatever the balance.
  const tooMuch = Math.max(allowance.balance, allowance.perCoverCap + 1);
  await attempt(ATTEMPTS.onePremium, tooMuch, () => premium(randomId(), tooMuch, poolAddress));
  const tooMuchData = Math.max(allowance.balance, allowance.dailyDataCap + 1);
  await attempt(ATTEMPTS.allData, tooMuchData, () => drawFloat(owner, tooMuchData, randomId()));
  if (allowance.dataLeftToday > 0) {
    await attempt(ATTEMPTS.dataLeft, allowance.dataLeftToday, () => drawFloat(owner, allowance.dataLeftToday, randomId()));
  }

  return { steps, taken: steps.reduce((sum, s) => sum + (s.ok && !s.returned ? s.amount : 0), 0) };
}
