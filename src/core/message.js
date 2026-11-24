// A message: who it is from, who it is for, the text, and a hybrid signature the recipient
// checks against the sender's keys on chain.
//
// The signature covers the recipient's address and the exact encryption key the message was
// sealed to, so a recipient cannot re-seal it to someone else and pass it off as addressed to them.
import { sha256 } from "@noble/hashes/sha2.js";
import { signMessage } from "@qorechain/qoresign";
import { verifyMessageWithChain } from "@qorechain/qoresign/network";
import { fetchMlkemPublicKey } from "@qorechain/qoreseal/network";
import { sealToWire, openWire, headOpens, wireLength, BUCKETS, HEAD_LENGTH } from "./wire.js";
import { embed, extract, embeddingRate } from "./stego.js";

const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const canonical = (body) => JSON.stringify([body.to, body.toKey, body.ts, body.text]);
const signedData = (body) => `small-talk/v1|${hex(sha256(enc.encode(canonical(body))))}`;
export const MAX_RATE = 0.25; // refuse to change more than a quarter of the picture's last bits

/**
 * Seal `text` to `to` (a qor1 address) and hide it in the picture.
 * `me` = { address, classicalKey, pqKey } from identity.js. Returns { rgba, rate, ts }.
 */
export async function hide({ rest, chainId, me, to, text, rgba, width, height }) {
  const mlkemPublicKey = await fetchMlkemPublicKey({ rest, address: to }); // the registered key, read from the chain
  const body = { to, toKey: hex(sha256(mlkemPublicKey)), ts: Math.floor(Date.now() / 1000), text };
  const sig = signMessage({ chainId, signer: me.address, data: signedData(body), classicalKey: me.classicalKey, pqKey: me.pqKey });
  const wire = sealToWire({ chainId, mlkemPublicKey, plaintext: enc.encode(JSON.stringify({ v: 1, from: me.address, body, sig })) });
  const rate = embeddingRate(width, height, wire.length);
  if (rate > MAX_RATE) throw new Error(`picture too small: needs at least ${Math.ceil((wire.length * 8) / MAX_RATE / 3)} pixels`);
  return { rgba: embed(rgba, width, height, wire), rate, ts: body.ts };
}

/**
 * Look for a message sealed to `me` in the picture. Returns null when there is none (or it is
 * for someone else: the two cases are indistinguishable). Throws if a message opens but its
 * signature does not verify against the sender's keys on chain.
 */
export async function reveal({ rest, chainId, me, rgba, width, height }) {
  const fits = BUCKETS.filter((b) => embeddingRate(width, height, wireLength(b)) <= 1);
  if (!fits.length) return null;
  if (!headOpens({ chainId, keys: me.sealKeys, head: extract(rgba, width, height, HEAD_LENGTH) })) return null; // fast path for other people's pictures
  const all = extract(rgba, width, height, wireLength(fits.at(-1))); // shorter reads are prefixes of this one
  for (const bucket of fits) {
    const plain = openWire({ chainId, keys: me.sealKeys, wire: all.subarray(0, wireLength(bucket)) });
    if (!plain) continue;
    const { v, from, body, sig } = JSON.parse(dec.decode(plain));
    if (v !== 1) throw new Error("unknown message version");
    if (body.to !== me.address || body.toKey !== hex(sha256(me.sealKeys.mlkemPublicKey))) throw new Error("message was signed for a different recipient");
    const { possessionProven } = await verifyMessageWithChain({ rest, chainId, signer: from, data: signedData(body), signature: sig, requirePq: true });
    return { from, text: body.text, ts: body.ts, possessionProven };
  }
  return null;
}
