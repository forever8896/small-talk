// Hide bytes in the least significant bits of an RGBA pixel buffer, and read them back.
//
// Positions are spread over the whole picture in an order anyone can recompute from the
// picture's size: the recipient has had no contact with the sender, so there is no secret to
// key them with. Secrecy does not depend on the positions. It depends on the hidden bytes being
// indistinguishable from the noise already in those bits, and on touching few of them.
import { shake256 } from "@noble/hashes/sha3.js";

const channels = (width, height) => width * height * 3; // alpha is never touched

/** The first `count` channel indexes of a fixed pseudo-random order for a width x height picture. */
export function positions(width, height, count) {
  const n = channels(width, height);
  if (count > n) throw new Error("picture too small");
  const seed = new TextEncoder().encode(`small-talk/positions/v1|${width}|${height}`);
  const rnd = new DataView(shake256(seed, { dkLen: count * 4 }).buffer);
  const moved = new Map(), out = new Uint32Array(count); // sparse Fisher-Yates
  for (let i = 0; i < count; i++) {
    const j = i + (rnd.getUint32(i * 4) % (n - i));
    const vi = moved.get(i) ?? i, vj = moved.get(j) ?? j;
    out[i] = vj; moved.set(j, vi);
  }
  return out;
}
const byteIndex = (channel) => Math.floor(channel / 3) * 4 + (channel % 3); // channel -> offset in RGBA

/** Share of the picture's colour values that carry a hidden bit for `byteLength` bytes. */
export const embeddingRate = (width, height, byteLength) => (byteLength * 8) / channels(width, height);

/** Returns a copy of `rgba` carrying `data`. A value whose last bit is wrong moves by +1 or -1 at random. */
export function embed(rgba, width, height, data) {
  const out = new Uint8ClampedArray(rgba), pos = positions(width, height, data.length * 8);
  const coin = crypto.getRandomValues(new Uint8Array(data.length));
  for (let i = 0; i < pos.length; i++) {
    const k = byteIndex(pos[i]), bit = (data[i >> 3] >> (i & 7)) & 1, v = out[k];
    if ((v & 1) !== bit) out[k] = v === 0 ? 1 : v === 255 ? 254 : (coin[i >> 3] >> (i & 7)) & 1 ? v + 1 : v - 1;
  }
  for (let k = 3; k < out.length; k += 4) out[k] = 255; // opaque, so browsers do not rescale colours
  return out;
}

/** Read `byteLength` bytes back out. Any picture yields bytes; only a real carrier yields ones that open. */
export function extract(rgba, width, height, byteLength) {
  const pos = positions(width, height, byteLength * 8), data = new Uint8Array(byteLength);
  for (let i = 0; i < pos.length; i++) data[i >> 3] |= (rgba[byteIndex(pos[i])] & 1) << (i & 7);
  return data;
}
