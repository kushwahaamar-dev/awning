// Replays the local chain's blocks through quicknode/filter.js and posts the result to the webhook,
// signed the way QuickNode signs, to check the whole Streams path without a QuickNode account.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const [, , appDir, base, token] = process.argv;
const rpc = "http://127.0.0.1:8545";
const call = async (method, params) => (await (await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;

const env = Object.fromEntries(readFileSync(`${appDir}/.env.development.local`, "utf8").split("\n").filter(Boolean).map((l) => l.split("=")));
const source = readFileSync(`${appDir}/quicknode/filter.js`, "utf8")
  .replace("0x0000000000000000000000000000000000000001", env.NEXT_PUBLIC_MANDATE_ADDRESS.toLowerCase())
  .replace("0x0000000000000000000000000000000000000002", env.NEXT_PUBLIC_POOL_ADDRESS.toLowerCase());
const main = new Function(`${source}; return main;`)();

const latest = Number(await call("eth_blockNumber", []));
const data = [];
for (let n = 0; n <= latest; n++) {
  const tag = "0x" + n.toString(16);
  data.push({ block: await call("eth_getBlockByNumber", [tag, true]), receipts: await call("eth_getBlockReceipts", [tag]) });
}
const filtered = main({ data, metadata: { network: "local" } });
console.log("blocks:", data.length, "mandate and pool logs after filter:", filtered?.logs.length);

async function deliver(payload, { key = token, gzip = false } = {}) {
  const body = JSON.stringify(payload);
  const nonce = randomUUID(), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", key).update(nonce + timestamp + body).digest("hex");
  const headers = { "content-type": "application/json", "x-qn-nonce": nonce, "x-qn-timestamp": timestamp, "x-qn-signature": signature };
  if (gzip) headers["content-encoding"] = "gzip";
  const res = await fetch(`${base}/api/streams`, { method: "POST", headers, body: gzip ? gzipSync(body) : body });
  return `${res.status} ${await res.text()}`;
}
console.log("wrong key  ->", await deliver(filtered, { key: "not-the-token" }));
console.log("plain      ->", await deliver(filtered));
console.log("gzip       ->", await deliver(filtered, { gzip: true }));
console.log("bad shape  ->", (await deliver({ logs: [{ address: "nope" }] })).slice(0, 80));
