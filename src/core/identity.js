// Everything one person needs, derived from a single recovery phrase:
// the account key, the ML-DSA-87 signing key bound to it, and the ML-KEM-1024 encryption key.
import { deriveClassicalKey, deriveCanonicalPqKey, addressFromPublicKey } from "@qorechain/qoresign";
import { deriveSealKeys } from "@qorechain/qoreseal";

/** `type`: "secp256k1" (native accounts, the default here) or "eth_secp256k1". */
export function identityFromMnemonic(mnemonic, type = "secp256k1") {
  const classicalKey = deriveClassicalKey({ mnemonic, type });
  const address = addressFromPublicKey(classicalKey.publicKey, type).bech32;
  return { address, classicalKey, pqKey: deriveCanonicalPqKey({ mnemonic, address }), sealKeys: deriveSealKeys({ mnemonic }) };
}
