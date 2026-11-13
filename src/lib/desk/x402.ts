import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  x402HTTPClient,
} from "@x402/core/http";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import type { SupportedResponse } from "@x402/core/types";
import { toClientEvmSigner, toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme as BuyerScheme } from "@x402/evm/exact/client";
import { registerExactEvmScheme as registerSettlement } from "@x402/evm/exact/facilitator";
import { ExactEvmScheme as SellerScheme } from "@x402/evm/exact/server";
import { createWalletClient, http, keccak256, nonceManager, publicActions, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { usdcAbi } from "../chain/abi";
import { chain, rpcUrl, toUnits, usdcAddress, type BlockReason } from "../chain/config";
import { agentAccount, drawFloat, publicClient } from "../chain/server";

const network = `eip155:${chain.id}` as const;
/** The most the agent will sign away for one request, whatever a seller asks for. */
const MAX_PER_REQUEST_USD = 0.05;

function deskAccount() {
  const key = process.env.DESK_PRIVATE_KEY;
  if (!key) throw new Error('DESK_PRIVATE_KEY is not set. Run "npm run chain" for a local setup, or see .env.example.');
  return privateKeyToAccount(key as Hex, { nonceManager });
}

export const deskAddress = (): Address => deskAccount().address;

/**
 * The desk settles its own sales: it verifies the buyer's signed USDC authorization and submits it
 * onchain itself, which is the facilitator role in x402. No third party sees the payment.
 */
async function createSeller() {
  const account = deskAccount();
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) }).extend(publicActions);

  // viem's generics are stricter than the SDK's structural signer type, hence the per-method adapters.
  const signer = toFacilitatorEvmSigner({
    address: account.address,
    getCode: (args) => wallet.getCode(args),
    readContract: (args) => wallet.readContract(args as never),
    verifyTypedData: (args) => wallet.verifyTypedData(args as never),
    writeContract: (args) => wallet.writeContract(args as never),
    sendTransaction: (args) => wallet.sendTransaction(args),
    waitForTransactionReceipt: (args) => wallet.waitForTransactionReceipt(args),
  });

  const facilitator = new x402Facilitator();
  registerSettlement(facilitator, { signer, networks: network });
  const settlement: FacilitatorClient = {
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    settle: (payload, requirements) => facilitator.settle(payload, requirements),
    getSupported: async () => facilitator.getSupported() as SupportedResponse,
  };

  const server = new x402ResourceServer(settlement).register(network, new SellerScheme());
  await server.initialize();
  // The buyer signs against the token's own EIP-712 domain, which differs between USDC deployments.
  const tokenName = await publicClient.readContract({ address: usdcAddress, abi: usdcAbi, functionName: "name" });
  return { server, payTo: account.address, tokenName };
}

const globals = globalThis as { awningSeller?: ReturnType<typeof createSeller> };
const seller = () => (globals.awningSeller ??= createSeller());

/**
 * Serves `produce()` for a per-request USDC payment. Without a payment the answer is 402 and the
 * terms; with one, the work is done first and the money is only taken if it succeeded.
 */
export async function sell(request: Request, priceUsd: number, description: string, produce: () => Promise<unknown>): Promise<Response> {
  const { server, payTo, tokenName } = await seller();
  const requirements = await server.buildPaymentRequirements({
    scheme: "exact",
    network,
    payTo,
    price: { asset: usdcAddress, amount: toUnits(priceUsd).toString(), extra: { name: tokenName, version: "2" } },
    maxTimeoutSeconds: 120,
  });
  const resource = { url: request.url, description, mimeType: "application/json" };
  const demand = async (error?: string) => {
    const required = await server.createPaymentRequiredResponse(requirements, resource, error);
    return Response.json(required, { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required) } });
  };

  const header = request.headers.get("payment-signature");
  if (!header) return demand();

  const payload = decodePaymentSignatureHeader(header);
  const matched = server.findMatchingRequirements(requirements, payload);
  if (!matched) return demand("payment does not match the terms offered");
  const verified = await server.verifyPayment(payload, matched);
  if (!verified.isValid) return demand(verified.invalidReason ?? "payment could not be verified");

  const body = await produce();
  const settled = await server.settlePayment(payload, matched);
  if (!settled.success) return demand(settled.errorReason ?? "payment could not be settled");
  return Response.json(body, { headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled) } });
}

function createBuyer(trustedSellers: Address[]) {
  const client = x402Client.fromConfig({
    schemes: [{ network, client: new BuyerScheme(toClientEvmSigner(agentAccount(), publicClient)) }],
    spendControls: { allowedAssets: [{ network, asset: usdcAddress, maxAmountPerPayment: toUnits(MAX_PER_REQUEST_USD).toString() }] },
    policies: [(_version, accepts) => accepts.filter((a) => trustedSellers.some((s) => s.toLowerCase() === a.payTo.toLowerCase()))],
  });
  return new x402HTTPClient(client);
}

export type Purchase<T> = { ok: true; data: T; paid: number; txHash: string } | { ok: false; refused: BlockReason };

/**
 * Buys one response from an x402 seller on an owner's behalf. The price comes out of that owner's
 * daily data allowance first; if the mandate won't release it, nothing is signed and nothing is bought.
 */
export async function buy<T>(owner: Address, url: string): Promise<Purchase<T>> {
  const buyer = createBuyer([deskAddress()]);
  const offer = await fetch(url, { cache: "no-store" });
  if (offer.status !== 402) throw new Error(`Expected a price from ${url}, got ${offer.status}`);

  const required = buyer.getPaymentRequiredResponse((name) => offer.headers.get(name), await offer.json());
  const payload = await buyer.createPaymentPayload(required);
  const price = Number(payload.accepted.amount) / 1e6;

  const draw = await drawFloat(owner, price, keccak256(toHex(url)));
  if (!draw.ok) return { ok: false, refused: draw.reason };

  const paid = await fetch(url, { headers: buyer.encodePaymentSignatureHeader(payload), cache: "no-store" });
  if (!paid.ok) throw new Error(`${url} did not accept the payment (${paid.status})`);
  const settlement = buyer.getPaymentSettleResponse((name) => paid.headers.get(name));
  return { ok: true, data: (await paid.json()) as T, paid: price, txHash: settlement.transaction };
}
