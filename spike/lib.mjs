// Shared helpers for the spikes: testnet endpoints, wallets kept in .secrets/, hybrid-signing clients.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { msg, createClient, generateMnemonic, deriveNativeAccount, directSignerFromPrivateKey, derivePqcCanonical, ensurePqcRegistered } from "@qorechain/sdk";
import { deriveSealKeys } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";

export const CHAIN_ID = "qorechain-diana";
export const REST = "https://api-testnet.qore.host";
export const RPC = "https://rpc-testnet.qore.host";
export const client = createClient({ endpoints: { rest: REST, rpc: RPC } });

/** Load (or create) a throwaway testnet identity. The mnemonic never leaves .secrets/. */
export async function identity(name) {
  const file = `.secrets/${name}.json`;
  let mnemonic;
  if (existsSync(file)) mnemonic = JSON.parse(readFileSync(file, "utf8")).mnemonic;
  else {
    mnemonic = generateMnemonic(256);
    const a = await deriveNativeAccount(mnemonic);
    writeFileSync(file, JSON.stringify({ network: CHAIN_ID + " (testnet only)", address: a.address, mnemonic }, null, 2), { mode: 0o600 });
  }
  const account = await deriveNativeAccount(mnemonic);
  const signer = await directSignerFromPrivateKey(account.privateKey, "qor");
  const pqcKeypair = derivePqcCanonical(account.address, mnemonic);
  const tx = await client.connectTx(signer, { pqcKeypair });
  const sealKeys = deriveSealKeys({ mnemonic });
  return { name, address: account.address, tx, pqcKeypair, sealKeys };
}

export async function uqor(address) {
  const { balances } = await client.rest.getAllBalances(address);
  return BigInt(balances.find((b) => b.denom === "uqor")?.amount ?? "0");
}

/** Bind the ML-DSA-87 key (once), then publish the ML-KEM-1024 key (once). */
export async function ensureKeys(id) {
  const reg = await ensurePqcRegistered(id.tx, { pqcKeypair: id.pqcKeypair, rest: REST, fee: { amount: [{ denom: "uqor", amount: "60000" }], gas: "600000" } });
  const kem = await fetchKemKey({ rest: REST, address: id.address });
  const same = kem.registered && Buffer.compare(Buffer.from(kem.publicKey), Buffer.from(id.sealKeys.mlkemPublicKey)) === 0;
  let kemTx = null;
  if (!same) {
    const m = msg.pqc.registerKemKey({ sender: id.address, publicKey: id.sealKeys.mlkemPublicKey });
    const res = await id.tx.signAndBroadcast([m], "auto");
    if (res.code !== 0) throw new Error("KEM registration failed: " + res.rawLog);
    kemTx = res.transactionHash;
  }
  return { pqcTx: reg.alreadyRegistered ? null : reg.txHash, kemTx };
}
