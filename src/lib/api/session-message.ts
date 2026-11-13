import type { Address } from "viem";

export const SESSION_HEADER = "x-awning-session";

/** The text an owner's device signs to open a session. Shared by the browser and the server. */
export function sessionMessage(owner: Address, expires: number) {
  return `Awning session\nowner: ${owner.toLowerCase()}\nexpires: ${expires}`;
}
