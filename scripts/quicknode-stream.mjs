#!/usr/bin/env node
// Creates and manages the QuickNode Stream that feeds Awning's ledger.
//
//   node --env-file=.env.local scripts/quicknode-stream.mjs create https://your-site/api/streams
//   node --env-file=.env.local scripts/quicknode-stream.mjs status | pause | activate | point <url> | remove
//
// Needs QUICKNODE_API_KEY (dashboard, API Keys, with Streams enabled) and QUICKNODE_STREAMS_TOKEN,
// the secret the app checks each delivery's signature against.
import { readFileSync } from "node:fs";

const API = "https://api.quicknode.com/streams/rest/v1";
const NAME = "awning-ledger";
const key = process.env.QUICKNODE_API_KEY?.trim();
const token = process.env.QUICKNODE_STREAMS_TOKEN?.trim();
if (!key || !token) throw new Error("Set QUICKNODE_API_KEY and QUICKNODE_STREAMS_TOKEN first.");

async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers: { "x-api-key": key, "content-type": "application/json" }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`QuickNode ${method} ${path} responded ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
}

const webhook = (url) => ({ url, compression: "gzip", max_retry: 3, retry_interval_sec: 2, post_timeout_sec: 30, security_token: token });
// Never print the token back.
const show = (s) => console.log(JSON.stringify({ id: s.id, name: s.name, network: s.network, dataset: s.dataset, status: s.status, sequence: s.sequence, url: s.destination_attributes?.url, updated: s.updated_at }));
const mine = async () => (await call("GET", "/streams")).data.find((s) => s.name === NAME);

const [command, url] = process.argv.slice(2);
if (command === "create") {
  if (!url) throw new Error("Give the address deliveries should go to, ending in /api/streams.");
  show(
    await call("POST", "/streams", {
      name: NAME,
      network: process.env.QUICKNODE_NETWORK ?? "arc-testnet",
      // Receipts carry the logs; the filter keeps the two contracts' own and drops every other block.
      dataset: "block_with_receipts",
      filter_function: readFileSync(new URL("../quicknode/filter.js", import.meta.url)).toString("base64"),
      region: "usa_east",
      // Arc's blocks come faster than one a second, which QuickNode asks to be batched by five or more.
      dataset_batch_size: 5,
      elastic_batch_enabled: true,
      fix_block_reorgs: 1,
      destination: "webhook",
      destination_attributes: webhook(url),
      status: "active",
    }),
  );
} else {
  const stream = await mine();
  if (!stream) throw new Error(`No Stream named ${NAME} on this account.`);
  if (command === "status") show(stream);
  else if (command === "pause" || command === "activate") {
    await call("POST", `/streams/${stream.id}/${command}`);
    show(await call("GET", `/streams/${stream.id}`));
  } else if (command === "point") show(await call("PATCH", `/streams/${stream.id}`, { destination: "webhook", destination_attributes: webhook(url) }));
  else if (command === "remove") console.log("removed", stream.id, await call("DELETE", `/streams/${stream.id}`).then(() => "ok"));
  else throw new Error("Commands: create <url>, status, pause, activate, point <url>, remove");
}
