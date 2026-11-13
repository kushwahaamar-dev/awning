import type { Address, Hex } from "viem";
import { publicClient } from "../chain/server";
import { SESSION_HEADER, sessionMessage } from "./session-message";

export class Unauthorized extends Error {}

/**
 * Confirms the request comes from whoever controls `owner`. The agent spends an owner's money on
 * request, so a request has to prove whose it is; an address in the body proves nothing.
 */
export async function requireOwner(request: Request, owner: Address) {
  const header = request.headers.get(SESSION_HEADER);
  if (!header) throw new Unauthorized("Sign in from the device that holds this account.");

  let session: { owner: Address; expires: number; signature: Hex };
  try {
    session = JSON.parse(atob(header));
  } catch {
    throw new Unauthorized("The session is malformed.");
  }
  if (session.owner.toLowerCase() !== owner.toLowerCase()) throw new Unauthorized("That session belongs to a different account.");
  if (!(session.expires > Date.now() / 1000)) throw new Unauthorized("The session has expired.");

  // Through the chain client, so a smart-account owner (ERC-1271) verifies the same way an ordinary key does.
  const valid = await publicClient.verifyMessage({ address: owner, message: sessionMessage(owner, session.expires), signature: session.signature });
  if (!valid) throw new Unauthorized("The session signature doesn't match this account.");
}
