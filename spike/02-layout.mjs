// Where does each field sit in a one-recipient, anonymous, ML-KEM-only envelope? Which bytes are constant?
import { seal, parseEnvelope, generateSealKeys } from "@qorechain/qoreseal";
const k = generateSealKeys(); const hex = (b) => Buffer.from(b).toString("hex");
const mk = (n) => seal({ chainId: "qorechain-diana", purpose: "p", recipients: [{ mlkemPublicKey: k.mlkemPublicKey }], plaintext: new Uint8Array(n), mode: "mlkem", anonymous: true });
const a = Buffer.from(mk(100)), b = Buffer.from(mk(100)), p = parseEnvelope(a);
const at = (f) => a.indexOf(Buffer.from(f));
const e = p.entries[0];
console.log("len", a.length, "header", p.header.length, "salt", p.salt.length, "@", at(p.salt), "| kemCt @", at(e.mlkemCiphertext), "| wrapped", e.wrappedKey.length, "@", at(e.wrappedKey), "| nonce", p.nonce.length, "@", at(p.nonce), "| ct", p.ciphertext.length, "@", at(p.ciphertext));
const same = []; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same.push(i);
console.log("constant offsets (two random envelopes):", same.filter((i) => i < 60).join(","), "… total", same.length);
console.log("first 40 bytes:", hex(a.subarray(0, 40)));
