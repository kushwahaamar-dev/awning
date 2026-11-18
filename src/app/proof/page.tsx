import type { Metadata } from "next";
import { ProofPage } from "@/components/ProofPage";
import { cctpAvailable } from "@/lib/chain/cctp";
import { chainLabel, explorerAddress, isLocalChain, mandateAddress, poolAddress } from "@/lib/chain/config";
import { FORECAST_PRICE_USD } from "@/lib/desk/x402";
import { usesStreams } from "@/lib/ledger/source";
import { hedging } from "@/lib/venue";
import { voiceEnabled } from "@/lib/voice";

export const metadata: Metadata = { title: "What is really running on Awning" };

/** For judges: each sponsor's technology, with the latest real evidence of it. What is said to be on follows the keys this deployment has. */
export default function Proof() {
  return (
    <ProofPage
      running={{
        chain: chainLabel,
        local: isLocalChain,
        mandate: mandateAddress ? explorerAddress(mandateAddress) : null,
        pool: poolAddress ? explorerAddress(poolAddress) : null,
        hedging,
        streams: usesStreams,
        voice: voiceEnabled(),
        cctp: cctpAvailable,
        forecastPrice: FORECAST_PRICE_USD,
      }}
    />
  );
}
