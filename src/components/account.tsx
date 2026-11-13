"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import useSWR from "swr";
import type { Address } from "viem";
import { SESSION_HEADER } from "@/lib/api/session-message";
import { deviceAddress, sessionToken } from "@/lib/chain/device";
import type { Allowance } from "@/lib/chain/server";
import type { CoverStatus, Order } from "@/lib/db/schema";
import type { CoverPlan } from "@/lib/hedge/plan";

export type Cover = {
  id: string;
  status: CoverStatus;
  plan: CoverPlan;
  mode: "now" | "resting";
  venue: string;
  premium: number;
  maxPayout: number;
  payout: number | null;
  orders: Order[];
  note: string | null;
  expiresAt: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  kind: string;
  args: Record<string, string | number | boolean>;
  at: string;
  txHash: string;
  explorer: string | null;
};

export type Account = {
  allowance: Allowance;
  covers: Cover[];
  activity: Activity[];
  setup: { chainId: number; chainName: string; mandate: Address; usdc: Address; agent: Address; venue: Address };
};

type AccountState = {
  owner: Address | null;
  account: Account | null;
  error: string | null;
  refresh: () => Promise<unknown>;
};

const AccountContext = createContext<AccountState | null>(null);
const REFRESH_MS = 5_000;

async function fetchAccount(url: string): Promise<Account> {
  const res = await fetch(url, { headers: { [SESSION_HEADER]: await sessionToken() } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

const never = () => () => {};

export function AccountProvider({ children }: { children: ReactNode }) {
  // The device key only exists in the browser, so there is no owner during server rendering.
  const owner = useSyncExternalStore(never, deviceAddress, () => null);
  const { data, error, mutate } = useSWR(owner && `/api/account?owner=${owner}`, fetchAccount, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
  });

  return (
    <AccountContext value={{ owner, account: data ?? null, error: error ? String(error.message ?? error) : null, refresh: mutate }}>
      {children}
    </AccountContext>
  );
}

export function useAccount() {
  const state = useContext(AccountContext);
  if (!state) throw new Error("useAccount must be used inside AccountProvider");
  return state;
}

export const hasAllowance = (account: Account) =>
  account.allowance.agent.toLowerCase() === account.setup.agent.toLowerCase() && account.allowance.balance > 0;

export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", [SESSION_HEADER]: await sessionToken() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
