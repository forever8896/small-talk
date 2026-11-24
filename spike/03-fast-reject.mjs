// Can "not for me" be decided from the first ~2 KB (KEM ciphertext + salt + wrapped key), without the payload?
import { seal, open, generateSealKeys } from "@qorechain/qoreseal";
const bob = generateSealKeys(), eve = generateSealKeys();
const env = seal({ chainId: "c", purpose: "p", recipients: [{ mlkemPublicKey: bob.mlkemPublicKey }], plaintext: new Uint8Array(8192), mode: "mlkem", anonymous: true });
const stub = env.slice(0, 1672 + 16); // header + a 16-byte "payload" that cannot authenticate
const tryOpen = (label, envelope, keys) => { try { open({ chainId: "c", purpose: "p", envelope, keys }); console.log(label, "-> opened"); } catch (e) { console.log(label, "->", e.code, "|", e.message); } };
tryOpen("right key, full   ", env, bob);
tryOpen("right key, stub   ", stub, bob);
tryOpen("wrong key, stub   ", stub, eve);
tryOpen("wrong key, full   ", env, eve);
let t = performance.now(); for (let i = 0; i < 50; i++) try { open({ chainId: "c", purpose: "p", envelope: stub, keys: eve }); } catch {}
console.log("ms per rejected stub:", ((performance.now() - t) / 50).toFixed(2));
