// Spike 1: can Alice seal a session key to Bob's on-chain ML-KEM key with no recipient marker in the bytes?
import { randomBytes } from "node:crypto";
import { seal, open, parseEnvelope, generateSealKeys, isQoreSealError } from "@qorechain/qoreseal";
import { fetchMlkemPublicKey } from "@qorechain/qoreseal/network";
import { CHAIN_ID, REST, identity, uqor, ensureKeys } from "./lib.mjs";

const alice = await identity("alice"), bob = await identity("bob");
console.log("alice", alice.address, "\nbob  ", bob.address);
if ((await uqor(bob.address)) < 1_000_000n) {
  const r = await alice.tx.bankSend(bob.address, [{ denom: "uqor", amount: "5000000" }]);
  console.log("funded bob:", r.transactionHash);
}
for (const id of [alice, bob]) console.log(id.name, "keys:", JSON.stringify(await ensureKeys(id)));

const PURPOSE = "small-talk/handshake/v1";
const sessionKey = randomBytes(32);
const bobKey = await fetchMlkemPublicKey({ rest: REST, address: bob.address }); // from the chain, not from Bob
const envelope = seal({ chainId: CHAIN_ID, purpose: PURPOSE, recipients: [{ mlkemPublicKey: bobKey }], plaintext: sessionKey, mode: "mlkem", anonymous: true });
const p = parseEnvelope(envelope);
console.log("envelope bytes:", envelope.length, "| mode:", p.mode, "| anonymous:", p.anonymous, "| hint:", Buffer.from(p.entries[0].hint).toString("hex"));

const got = open({ chainId: CHAIN_ID, purpose: PURPOSE, envelope, keys: bob.sealKeys });
console.log("bob opens:", Buffer.compare(Buffer.from(got), sessionKey) === 0 ? "OK, same session key" : "MISMATCH");
for (const [who, keys] of [["alice (sender)", alice.sealKeys], ["stranger", generateSealKeys()]]) {
  try { open({ chainId: CHAIN_ID, purpose: PURPOSE, envelope, keys }); console.log(who, "opened it: BAD"); }
  catch (e) { console.log(who, "cannot open:", isQoreSealError(e) ? e.code : e.message); }
}
