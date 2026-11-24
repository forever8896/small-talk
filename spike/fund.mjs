// Usage: node spike/fund.mjs <qor1 address> [QOR]. Sends test QOR from the "alice" identity.
import { identity } from "./lib.mjs";
const [to, qor = "1"] = process.argv.slice(2);
const alice = await identity("alice");
const r = await alice.tx.bankSend(to, [{ denom: "uqor", amount: String(Math.round(Number(qor) * 1e6)) }]);
console.log("sent", qor, "QOR:", r.transactionHash, "code", r.code);
