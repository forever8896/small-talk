// Turn a QoreSeal envelope into bytes with no recognisable structure ("wire"), and back.
//
// A one-recipient, anonymous, ML-KEM-only envelope is laid out as:
//   [0,10)  constant magic/version/mode   [10,26) salt        [26,28) recipient count = 1
//   [28,44) hint, all zero when anonymous [44,1612) ML-KEM ciphertext
//   [1612,1660) wrapped key               [1660,1672) nonce   [1672,…) payload ciphertext + tag
// The constant bytes are dropped (they would be a signature), the ML-KEM ciphertext is
// re-encoded to uniform bytes, and everything else is already random-looking.
import { seal, open, isQoreSealError } from "@qorechain/qoreseal";
import { encodeCiphertext, decodeCiphertext, ENCODED_LENGTH } from "./kemeleon.js";

export const PURPOSE = "small-talk/picture/v1";
const PREFIX = Uint8Array.from([0x51, 0x53, 0x45, 0x4c, 1, 2, 2, 1, 1, 1]); // "QSEL" + version/mode/flags
const SALT = 16, KEM = 1568, WRAPPED = 48, NONCE = 12, TAG = 16, HEADER = 1672;
/** Plaintext is padded to one of these sizes so the length says little about the message. */
export const BUCKETS = [8192, 16384, 32768];
export const wireLength = (bucket) => ENCODED_LENGTH + SALT + WRAPPED + NONCE + bucket + TAG;

function pad(plaintext) {
  const bucket = BUCKETS.find((b) => b >= plaintext.length + 4);
  if (!bucket) throw new Error("message too long");
  const out = crypto.getRandomValues(new Uint8Array(bucket)); // random fill; it is encrypted anyway
  new DataView(out.buffer).setUint32(0, plaintext.length);
  out.set(plaintext, 4);
  return out;
}
function unpad(padded) {
  const n = new DataView(padded.buffer, padded.byteOffset).getUint32(0);
  if (n > padded.length - 4) throw new Error("bad padding");
  return padded.subarray(4, 4 + n);
}

/** Seal `plaintext` to one ML-KEM-1024 public key and return unstructured bytes. */
export function sealToWire({ chainId, mlkemPublicKey, plaintext }) {
  const padded = pad(plaintext);
  for (let attempt = 0; attempt < 64; attempt++) {
    const env = seal({ chainId, purpose: PURPOSE, recipients: [{ mlkemPublicKey }], plaintext: padded, mode: "mlkem", anonymous: true });
    for (let i = 0; i < PREFIX.length; i++) if (env[i] !== PREFIX[i]) throw new Error("unexpected envelope layout (QoreSeal version changed?)");
    if (env.length !== HEADER + padded.length + TAG) throw new Error("unexpected envelope size");
    const kem = encodeCiphertext(env.subarray(44, 44 + KEM));
    if (!kem) continue; // rejected draw: seal again with fresh randomness
    const wire = new Uint8Array(wireLength(padded.length));
    let p = 0;
    for (const part of [kem, env.subarray(10, 26), env.subarray(1612, 1660), env.subarray(1660, 1672), env.subarray(HEADER)]) { wire.set(part, p); p += part.length; }
    return wire;
  }
  throw new Error("could not encode ciphertext");
}

/** Try to open `wire` (exactly wireLength(bucket) bytes). Returns the plaintext, or null if it is not for these keys. */
export function openWire({ chainId, keys, wire }) {
  const bucket = wire.length - wireLength(0);
  if (!BUCKETS.includes(bucket)) throw new Error("not a wire length");
  let p = 0; const take = (n) => wire.subarray(p, (p += n));
  const kem = decodeCiphertext(take(ENCODED_LENGTH)), salt = take(SALT), wrapped = take(WRAPPED), nonce = take(NONCE), ct = take(bucket + TAG);
  const env = new Uint8Array(HEADER + ct.length);
  env.set(PREFIX, 0); env.set(salt, 10); env[27] = 1; // count = 1; hint stays zero
  env.set(kem, 44); env.set(wrapped, 1612); env.set(nonce, 1660); env.set(ct, HEADER);
  try { return unpad(open({ chainId, purpose: PURPOSE, envelope: env, keys })); }
  catch (e) { if (isQoreSealError(e)) return null; throw e; }
}
