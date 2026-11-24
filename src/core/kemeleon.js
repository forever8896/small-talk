// Make an ML-KEM-1024 ciphertext look like uniform random bytes, and back.
//
// A raw ML-KEM ciphertext is NOT uniform: each coefficient is a value mod q = 3329 rounded
// into 2^d buckets, so some bucket values are about twice as likely as others. Hidden in a
// picture, that bias would be a fingerprint. Following the Kemeleon idea (obfuscated KEMs):
// undo the rounding by picking a random preimage mod q for every coefficient, then write
// the whole vector as one big base-q integer. Only integers below 2^(8*ENCODED_LENGTH) are
// accepted, so the accepted outputs are uniform over byte strings; the sender simply seals
// again when a draw is rejected (a little over half the time).
const Q = 3329;
const N_U = 1024, D_U = 11; // c1: 4 polynomials x 256 coefficients, 11 bits each
const N_V = 256, D_V = 5; //  c2: 1 polynomial, 5 bits each
export const CIPHERTEXT_LENGTH = 1568;
export const ENCODED_LENGTH = 1872; // floor(1280 * log2(3329) / 8)

const compress = (x, d) => Math.round((x * (1 << d)) / Q) % (1 << d);
function preimageTable(d) {
  const t = Array.from({ length: 1 << d }, () => []);
  for (let x = 0; x < Q; x++) t[compress(x, d)].push(x);
  return t;
}
const PRE_U = preimageTable(D_U), PRE_V = preimageTable(D_V);

function unpack(bytes, offset, count, d) {
  const out = new Uint16Array(count);
  let acc = 0, bits = 0, p = offset;
  for (let i = 0; i < count; i++) {
    while (bits < d) { acc |= bytes[p++] << bits; bits += 8; }
    out[i] = acc & ((1 << d) - 1); acc >>>= d; bits -= d;
  }
  return out;
}
function pack(values, d, out, offset) {
  let acc = 0, bits = 0, p = offset;
  for (const v of values) {
    acc |= v << bits; bits += d;
    while (bits >= 8) { out[p++] = acc & 0xff; acc >>>= 8; bits -= 8; }
  }
  return p;
}
function randomBelow(n) { // n is tiny (1..3); rejection keeps it exact
  const b = new Uint8Array(1);
  for (;;) { crypto.getRandomValues(b); if (b[0] < 256 - (256 % n)) return b[0] % n; }
}
const pick = (list) => list[randomBelow(list.length)];

/** Returns ENCODED_LENGTH uniform-looking bytes, or null when this ciphertext draws a rejected value. */
export function encodeCiphertext(ct) {
  if (ct.length !== CIPHERTEXT_LENGTH) throw new Error("not an ML-KEM-1024 ciphertext");
  const u = unpack(ct, 0, N_U, D_U), v = unpack(ct, (N_U * D_U) / 8, N_V, D_V);
  const coeffs = [];
  for (const c of u) coeffs.push(pick(PRE_U[c]));
  for (const c of v) coeffs.push(pick(PRE_V[c]));
  // Horner in chunks keeps the BigInt work small: fold 4 coefficients at a time.
  let r = 0n; const q4 = BigInt(Q) ** 4n;
  for (let i = coeffs.length - 4; i >= 0; i -= 4) {
    const chunk = ((coeffs[i + 3] * Q + coeffs[i + 2]) * Q + coeffs[i + 1]) * Q + coeffs[i]; // < 2^47, exact in a double
    r = r * q4 + BigInt(chunk);
  }
  if (r >> BigInt(8 * ENCODED_LENGTH) !== 0n) return null;
  const out = new Uint8Array(ENCODED_LENGTH);
  for (let i = 0; i < ENCODED_LENGTH; i++) { out[i] = Number(r & 0xffn); r >>= 8n; }
  return out;
}

/** Inverse of encodeCiphertext. Any ENCODED_LENGTH bytes decode to some ciphertext-shaped value. */
export function decodeCiphertext(enc) {
  if (enc.length !== ENCODED_LENGTH) throw new Error("wrong encoded length");
  let hex = ""; for (let i = enc.length - 1; i >= 0; i--) hex += enc[i].toString(16).padStart(2, "0");
  let r = BigInt("0x" + hex);
  const q4 = BigInt(Q) ** 4n, total = N_U + N_V, coeffs = new Uint16Array(total);
  for (let i = 0; i < total; i += 4) {
    let chunk = Number(r % q4); r /= q4;
    for (let j = 0; j < 4; j++) { coeffs[i + j] = chunk % Q; chunk = Math.floor(chunk / Q); }
  }
  const ct = new Uint8Array(CIPHERTEXT_LENGTH);
  const p = pack(Array.from(coeffs.subarray(0, N_U), (x) => compress(x, D_U)), D_U, ct, 0);
  pack(Array.from(coeffs.subarray(N_U), (x) => compress(x, D_V)), D_V, ct, p);
  return ct;
}
