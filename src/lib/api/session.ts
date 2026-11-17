import type { Address, Hex } from "viem";
import { z } from "zod";
import { publicClient } from "../chain/server";
import { address, hex } from "./schemas";
import { SESSION_HEADER, sessionMessage } from "./session-message";

export class Unauthorized extends Error {}

const MAX_SESSION_SECONDS = 24 * 3600;
const sessionSchema = z.object({ owner: address, expires: z.number(), signature: hex });

/**
 * Confirms the request comes from whoever controls `owner`. The agent spends an owner's money on
 * request, so a request has to prove whose it is; an address in the body proves nothing.
 */
export async function requireOwner(request: Request, owner: Address) {
  const header = request.headers.get(SESSION_HEADER);
  if (!header) throw new Unauthorized("Sign in from the device that holds this account.");

  let session: { owner: Address; expires: number; signature: Hex };
  try {
    session = sessionSchema.parse(JSON.parse(atob(header)));
  } catch {
    throw new Unauthorized("The session is malformed.");
  }
  const now = Date.now() / 1000;
  if (session.owner.toLowerCase() !== owner.toLowerCase()) throw new Unauthorized("That session belongs to a different account.");
  // The device picks the expiry, so the server caps how far ahead it will honour one.
  if (session.expires <= now || session.expires > now + MAX_SESSION_SECONDS) throw new Unauthorized("The session has expired.");

  // Through the chain client, so a smart-account owner (ERC-1271) verifies the same way an ordinary key does.
  const valid = await publicClient.verifyMessage({ address: owner, message: sessionMessage(owner, session.expires), signature: session.signature });
  if (!valid) throw new Unauthorized("The session signature doesn’t match this account.");
}
