// Development aid, not loaded by the page: a second identity that lives only in this tab's memory,
// so the whole flow can be exercised in one browser. Use from the console: await import("/src/app/dev.js")
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { identityFromMnemonic } from "../core/identity.js";
import { status, publishKeys } from "../core/chain.js";
import { hide, reveal } from "../core/message.js";

const CHAIN_ID = "qorechain-diana", REST = "/lcd";
// kept for the life of the tab, so reloads keep the same second identity
const phrase = sessionStorage.getItem("small-talk/dev-other") ?? generateMnemonic(wordlist, 256);
sessionStorage.setItem("small-talk/dev-other", phrase);
export const other = identityFromMnemonic(phrase);
export const otherStatus = () => status({ rest: REST, me: other });
export const otherPublish = () => publishKeys({ rest: REST, chainId: CHAIN_ID, me: other });
export const otherHide = (to, text, picture) => hide({ rest: REST, chainId: CHAIN_ID, me: other, to, text, ...picture });
export const otherReveal = (picture) => reveal({ rest: REST, chainId: CHAIN_ID, me: other, ...picture });
