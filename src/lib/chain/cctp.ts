import { arcTestnet } from "viem/chains";
import { chain } from "./config";

// Circle's Cross-Chain Transfer Protocol (CCTP V2). USDC is burned on Arc and minted natively on the
// other chain; with the Forwarding Service, Circle submits the mint, so the receiver needs no gas there.

/** CCTP's contracts sit at the same addresses on every testnet. There is nothing to call on a local chain. */
export const cctpAvailable = chain.id === arcTestnet.id;

export const ARC_DOMAIN = 26;
export const TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
/** The reserved hook that asks Circle to deliver the mint: "cctp-forward", version 0, no payload. */
export const FORWARD_HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000";
/** Arc finalises in under a second, so there is no faster tier to pay for. */
export const STANDARD_FINALITY = 2000;

export const DESTINATIONS = [
  { domain: 6, name: "Base Sepolia", explorer: "https://sepolia.basescan.org/tx/" },
  { domain: 0, name: "Ethereum Sepolia", explorer: "https://sepolia.etherscan.io/tx/" },
  { domain: 1, name: "Avalanche Fuji", explorer: "https://testnet.snowtrace.io/tx/" },
] as const;

export type Destination = (typeof DESTINATIONS)[number];

export const tokenMessengerAbi = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
