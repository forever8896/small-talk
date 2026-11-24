import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateSealKeys, mlkemEncapsulate } from "@qorechain/qoreseal";
import { encodeCiphertext, decodeCiphertext } from "../src/core/kemeleon.js";
import { sealToWire, openWire, wireLength, headOpens, HEAD_LENGTH } from "../src/core/wire.js";
import { embed, extract, positions } from "../src/core/stego.js";
import { hide, reveal } from "../src/core/message.js";
import { identityFromMnemonic } from "../src/core/identity.js";

const CHAIN_ID = "qorechain-diana", REST = "https://api-testnet.qore.host";
const noisePicture = (w, h) => { const p = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < p.length; i += 65536) crypto.getRandomValues(p.subarray(i, i + 65536)); return p; };

test("kemeleon: round trip, and the encoding has no bit bias", () => {
  const keys = generateSealKeys(); let ok = 0, tries = 0; const ones = new Float64Array(8); let bytes = 0, topBit = 0;
  while (ok < 60) {
    tries++; const { cipherText } = mlkemEncapsulate(keys.mlkemPublicKey);
    const e = encodeCiphertext(cipherText); if (!e) continue; ok++;
    assert.deepEqual(decodeCiphertext(e), cipherText);
    for (const b of e) { bytes++; for (let k = 0; k < 8; k++) ones[k] += (b >> k) & 1; }
    topBit += e.at(-1) >> 7;
  }
  console.log(`  accepted ${ok}/${tries} draws; top bit set in ${topBit}/${ok}`);
  for (const o of ones) assert.ok(Math.abs(o / bytes - 0.5) < 0.01, "bit frequency " + o / bytes);
  assert.ok(topBit > 15 && topBit < 45, "most significant bit should be a coin flip");
});

test("wire: opens for the recipient only, and has no constant bytes", () => {
  const bob = generateSealKeys(), eve = generateSealKeys(), msg = new TextEncoder().encode("see you at eight");
  const a = sealToWire({ chainId: CHAIN_ID, mlkemPublicKey: bob.mlkemPublicKey, plaintext: msg });
  const b = sealToWire({ chainId: CHAIN_ID, mlkemPublicKey: bob.mlkemPublicKey, plaintext: msg });
  assert.equal(a.length, wireLength(8192));
  assert.deepEqual(openWire({ chainId: CHAIN_ID, keys: bob, wire: a }), msg);
  assert.equal(openWire({ chainId: CHAIN_ID, keys: eve, wire: a }), null);
  assert.equal(headOpens({ chainId: CHAIN_ID, keys: bob, head: a.subarray(0, HEAD_LENGTH) }), true);
  assert.equal(headOpens({ chainId: CHAIN_ID, keys: eve, head: a.subarray(0, HEAD_LENGTH) }), false);
  assert.equal(headOpens({ chainId: CHAIN_ID, keys: bob, head: crypto.getRandomValues(new Uint8Array(HEAD_LENGTH)) }), false);
  let same = 0; for (let i = 0; i < a.length; i++) same += a[i] === b[i];
  assert.ok(same < a.length / 128, `${same} equal bytes between two wires`); // chance level is 1/256
});

test("stego: bytes survive, every change is +-1, alpha untouched", () => {
  const w = 640, h = 480, pic = noisePicture(w, h), data = crypto.getRandomValues(new Uint8Array(10000));
  const out = embed(pic, w, h, data);
  assert.deepEqual(extract(out, w, h, data.length), data);
  let changed = 0; for (let i = 0; i < pic.length; i++) if (i % 4 !== 3 && out[i] !== pic[i]) { changed++; assert.equal(Math.abs(out[i] - pic[i]), 1); }
  console.log(`  changed ${changed} of ${w * h * 3} colour values (${((100 * changed) / (w * h * 3)).toFixed(2)}%)`);
  assert.equal(new Set(positions(w, h, 80000)).size, 80000);
});

test("end to end on testnet: Alice hides, Bob reveals and verifies her, nobody else can", async () => {
  const load = (n) => identityFromMnemonic(JSON.parse(readFileSync(`.secrets/${n}.json`, "utf8")).mnemonic, "secp256k1");
  const alice = load("alice"), bob = load("bob"), w = 800, h = 600, pic = noisePicture(w, h);
  assert.equal(alice.address, JSON.parse(readFileSync(".secrets/alice.json", "utf8")).address);
  const { rgba, rate } = await hide({ rest: REST, chainId: CHAIN_ID, me: alice, to: bob.address, text: "the cat is a lie 🐈", rgba: pic, width: w, height: h });
  console.log(`  embedding rate ${(rate * 100).toFixed(1)}% of colour values`);
  const got = await reveal({ rest: REST, chainId: CHAIN_ID, me: bob, rgba, width: w, height: h });
  assert.equal(got.text, "the cat is a lie 🐈"); assert.equal(got.from, alice.address); assert.equal(got.possessionProven, true);
  assert.equal(await reveal({ rest: REST, chainId: CHAIN_ID, me: alice, rgba, width: w, height: h }), null);
  assert.equal(await reveal({ rest: REST, chainId: CHAIN_ID, me: bob, rgba: pic, width: w, height: h }), null);
});
