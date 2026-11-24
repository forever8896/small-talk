// Reads and writes against a QoreChain REST endpoint. Works in the browser and in Node.
// Signing happens locally; only signed transactions and public queries leave the machine.
import { TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { encodeSecp256k1Pubkey } from "@cosmjs/amino";
import { encodePubkey, makeAuthInfoBytes } from "@cosmjs/proto-signing";
import { buildRegisterPqKeyMessage, signHybrid } from "@qorechain/qoresign";
import { fetchPqKeyStatus, simulateTx, submitWithSignBytesFallback, broadcastTx } from "@qorechain/qoresign/network";
import { buildRegisterKemKeyMessage, describeKemRegistryError } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";

const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function getJson(rest, path) { const r = await fetch(rest + path); return r.ok ? r.json() : null; }

/** What the chain knows about this identity: balance and whether each key is published. */
export async function status({ rest, me }) {
  const [bal, pq, kem] = await Promise.all([
    getJson(rest, `/cosmos/bank/v1beta1/balances/${me.address}/by_denom?denom=uqor`),
    fetchPqKeyStatus({ rest, address: me.address }),
    fetchKemKey({ rest, address: me.address }),
  ]);
  return {
    qor: Number(bal?.balance?.amount ?? 0) / 1e6,
    signingKey: pq.registered,
    encryptionKey: kem.registered && same(kem.publicKey, me.sealKeys.mlkemPublicKey),
    otherEncryptionKey: kem.registered && !same(kem.publicKey, me.sealKeys.mlkemPublicKey),
  };
}

async function sendTx({ rest, chainId, me, msgs, mode = "hybrid" }) {
  const info = (await getJson(rest, `/cosmos/auth/v1beta1/account_info/${me.address}`))?.info;
  if (!info) throw new Error("This account has no test QOR yet. Get some from the faucet first.");
  const bodyBytes = TxBody.encode(TxBody.fromPartial({ messages: msgs })).finish();
  const sign = (gas) => signHybrid({
    chainId, accountNumber: BigInt(info.account_number), bodyBytes,
    authInfoBytes: makeAuthInfoBytes(
      [{ pubkey: encodePubkey(encodeSecp256k1Pubkey(me.classicalKey.publicKey)), sequence: BigInt(info.sequence ?? "0") }],
      [{ denom: "uqor", amount: ((gas + 9n) / 10n).toString() }], Number(gas), undefined, undefined, 1),
    classicalKey: me.classicalKey, pqKey: me.pqKey, mode,
  }).txBytes;
  const sim = await simulateTx({ rest, txBytes: sign(600_000n) });
  const res = mode === "hybrid"
    ? await submitWithSignBytesFallback({ rest, chainId, sign: () => sign(sim.suggestedGasLimit) })
    : await broadcastTx({ rest, txBytes: sign(sim.suggestedGasLimit) });
  if (res.code !== 0) throw new Error(describeKemRegistryError(res.codespace, res.code) ?? res.log);
  for (let i = 0; i < 40; i++) {
    const tx = await getJson(rest, `/cosmos/tx/v1beta1/txs/${res.txhash}`);
    if (tx) { if (tx.tx_response.code !== 0) throw new Error(tx.tx_response.raw_log); return res.txhash; }
    await sleep(1500);
  }
  throw new Error("The transaction was not confirmed in time: " + res.txhash);
}

/**
 * Publish whatever is missing: first the ML-DSA-87 signing key (the one transaction the chain
 * accepts with a classical signature), then the ML-KEM-1024 encryption key, signed with both.
 * `onStep` is called with a short label before each transaction. Returns the transaction hashes.
 */
export async function publishKeys({ rest, chainId, me, onStep = () => {} }) {
  const s = await status({ rest, me }), out = {};
  if (!s.signingKey) {
    onStep("signing key");
    const msg = buildRegisterPqKeyMessage({ chainId, account: me.address, pqKey: me.pqKey, classicalPublicKey: me.classicalKey.publicKey });
    out.signingKeyTx = await sendTx({ rest, chainId, me, msgs: [msg], mode: "classicalOnly" });
  }
  if (!s.encryptionKey) {
    onStep("encryption key");
    const msg = buildRegisterKemKeyMessage({ sender: me.address, mlkemPublicKey: me.sealKeys.mlkemPublicKey });
    out.encryptionKeyTx = await sendTx({ rest, chainId, me, msgs: [msg] });
  }
  return out;
}
