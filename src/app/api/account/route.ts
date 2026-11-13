import { address, fail } from "@/lib/api/respond";
import { chain, explorerTx, mandateAddress, usdcAddress } from "@/lib/chain/config";
import { agentAddress, readAllowance, venueAddress } from "@/lib/chain/server";
import { listCovers } from "@/lib/covers/service";
import { pollChain, recentActivity } from "@/lib/ledger/ingest";
import { usesStreams } from "@/lib/ledger/source";

/** Everything the app shows about one owner: allowance, covers, and what the agent has done onchain. */
export async function GET(request: Request) {
  const owner = address.safeParse(new URL(request.url).searchParams.get("owner"));
  if (!owner.success) return Response.json({ error: "owner must be an address" }, { status: 400 });

  try {
    if (!usesStreams) await pollChain();
    const [allowance, covers, activity] = await Promise.all([readAllowance(owner.data), listCovers(owner.data), recentActivity(owner.data)]);
    return Response.json({
      allowance,
      covers,
      activity: activity.map((event) => ({ ...event, explorer: explorerTx(event.txHash) })),
      setup: { chainId: chain.id, chainName: chain.name, mandate: mandateAddress, usdc: usdcAddress, agent: agentAddress(), venue: venueAddress() },
    });
  } catch (error) {
    return fail(error);
  }
}
