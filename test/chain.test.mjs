// Live testnet: a brand-new identity publishes both keys with the same code the web page runs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { identityFromMnemonic } from "../src/core/identity.js";
import { status, publishKeys } from "../src/core/chain.js";
import { identity as sdkIdentity } from "../spike/lib.mjs";

const CHAIN_ID = "qorechain-diana", REST = "https://api-testnet.qore.host";
test("a new identity publishes its signing and encryption keys", { skip: !process.env.LIVE }, async () => {
  const me = identityFromMnemonic(generateMnemonic(wordlist, 256));
  assert.deepEqual(await status({ rest: REST, me }), { qor: 0, signingKey: false, encryptionKey: false, otherEncryptionKey: false });
  await assert.rejects(publishKeys({ rest: REST, chainId: CHAIN_ID, me }), /faucet/);
  const alice = await sdkIdentity("alice");
  await alice.tx.bankSend(me.address, [{ denom: "uqor", amount: "500000" }]);
  const steps = [], txs = await publishKeys({ rest: REST, chainId: CHAIN_ID, me, onStep: (s) => steps.push(s) });
  assert.deepEqual(steps, ["signing key", "encryption key"]);
  console.log("  ", me.address, txs);
  const after = await status({ rest: REST, me });
  assert.equal(after.signingKey, true); assert.equal(after.encryptionKey, true);
  assert.deepEqual(await publishKeys({ rest: REST, chainId: CHAIN_ID, me }), {});
  console.log(`   cost ${(0.5 - after.qor).toFixed(4)} QOR`);
});
