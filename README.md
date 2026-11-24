# Small Talk

**Messages that don't look like messages.** Write to a QoreChain address, and the message is
sealed with post-quantum encryption and hidden inside an ordinary picture. Everyone sees the
picture. Only the recipient's browser finds anything in it, and it can check who wrote it.

Built for [Build Before Q-Day](https://build.qorechain.io), the QoreChain developer fest
(category: Encrypted Apps). Testnet only (`qorechain-diana`).

> Status: work in progress. The core is tested end to end on testnet; the web page is a first
> version. See [Limits](#limits) before trusting it with anything.

## Why

Encrypted traffic is recorded today to be decrypted later. Messages someone bothered to hide
are the first ones worth keeping. And hidden messaging has a failure mode ordinary encryption
does not: if the key exchange is ever broken, the adversary learns not only what was said but
that every harmless-looking picture was a message. The disguise fails retroactively.

So the key exchange has to hold after Q-Day, and it has to leave no trace of who talked to whom.

## How it works

1. **Keys on chain.** Each person publishes two public keys bound to their account: an
   ML-DSA-87 signing key and an ML-KEM-1024 encryption key (the chain's KEM key registry).
   That is the only thing written to the chain. No message, and no record of a conversation.
2. **Seal.** The sender reads the recipient's ML-KEM-1024 key from the chain and seals the
   message to it with [QoreSeal](https://github.com/qorechain/qoreseal), in anonymous mode:
   the envelope carries no hint of who it is for.
3. **Sign.** Inside the envelope, the message is signed with the sender's hybrid
   secp256k1 + ML-DSA-87 keys ([QoreSign](https://github.com/qorechain/qoresign)). The
   signature covers the recipient's address and the exact key it was sealed to.
4. **Remove the fingerprint.** A raw ML-KEM ciphertext is not random-looking: its values are
   rounded in a way that leaves a measurable bias. The ciphertext is re-encoded so the result
   is uniform bytes, and the envelope's constant header is dropped (`src/core/kemeleon.js`,
   `src/core/wire.js`).
5. **Hide.** Those bytes go into the last bit of colour values spread across the picture.
   A value that needs changing moves by one step, up or down at random (`src/core/stego.js`).
6. **Reveal.** The recipient's browser reads the same positions from any PNG, rebuilds the
   envelope and tries its own key. If it opens, the signature is checked against the sender's
   keys on chain. If not, it is just a picture: "not for me" and "nothing there" look the same.

Everything runs in the page. The chain is only read for public keys.

## Using it

- **People.** Everyone has an invite link. Add someone with theirs and you get a conversation
  with them; names and messages are kept in your browser only.
- **Write.** Type, pick a picture, and the page gives you a PNG to save or share.
- **Read.** Drop or paste a picture anywhere on the page. If it is for you, it lands in the
  sender's conversation with the signature checked.
- **The Wall.** A public pile of pictures that anyone can post to, including ordinary ones.
  Your page quietly checks each new picture; one that is for you appears in your conversations.
  The sender never sends you anything directly, so no chat app holds a record linking the two
  of you. The server stores the pictures and understands nothing about them. A picture that
  is not yours is ruled out from its first 2 KB in a few milliseconds.

## Limits

- **Recompression destroys the message.** Send the PNG as a file. Apps that re-encode pictures
  (most "send as photo" paths, and social networks) wipe it.
- **Use a picture nobody else has.** Anyone holding the original can compare the two.
- **Hard to detect is not proven undetectable.** The hidden bytes are designed to be
  indistinguishable from random, and a message changes a few percent of colour values by one
  step. Whether that survives a determined statistical analysis of a given picture has not
  been measured here.
- **The hiding positions are public.** They are derived from the picture's size, because the
  recipient has had no contact with the sender. Secrecy rests on step 4, not on the positions.
- **The ciphertext encoding follows the idea of Kemeleon, not the specification.** It is not a
  conforming implementation of the IETF draft and has not been reviewed. Like Kemeleon, its
  uniformity depends on the module-LWE assumption.
- **The sender must have published keys too**, so the chain shows that an address uses this
  kind of key. It does not show who it writes to, when, or whether it ever has.
- **The Wall's server sees who uploads and who downloads.** It cannot tell which pictures carry
  messages or for whom, but it sees IP addresses like any web server. Readers download every
  picture, so that part reveals nothing about which one mattered.
- **The recovery phrase is stored unencrypted in the browser.** Testnet only.
- QoreSeal itself is marked by its authors as pending external review.

## Run it

Needs Node.js 20 or newer.

```sh
npm install
npm run dev      # http://localhost:5180
npm test         # core tests; the end-to-end test needs two funded testnet identities in .secrets/
npm run build && npm start   # production: one small Node server for the page, /lcd and the Wall
```

`./dev.sh` and `./run.sh` do the same inside a Docker container that can only see this folder.

The public testnet REST endpoint sends no CORS headers, so the page reaches it through `/lcd`
on its own origin (see `vite.config.js` and `server.mjs`). Only public queries and signed
transactions pass through. The Wall (`wall.mjs`) keeps the newest 300 pictures on disk.

## Credits

- QoreChain kits: [`@qorechain/qoreseal`](https://github.com/qorechain/qoreseal) (Apache-2.0),
  [`@qorechain/qoresign`](https://github.com/qorechain/qoresign),
  [`@qorechain/sdk`](https://github.com/qorechain/qorechain-sdk). The transaction code in
  `src/core/chain.js` follows the official
  [workshop 3 example](https://github.com/qorechain/build-before-qday/tree/main/workshop-3/01-qoreseal).
- Kemeleon: F. Günther, D. Stebila, S. Veitch, "Obfuscated Key Exchange", CCS 2024
  ([ePrint 2024/1086](https://eprint.iacr.org/2024/1086)); IETF draft
  [draft-irtf-cfrg-kemeleon](https://datatracker.ietf.org/doc/draft-irtf-cfrg-kemeleon/).
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes), [`@scure/bip39`](https://github.com/paulmillr/scure-bip39),
  [`fast-png`](https://github.com/image-js/fast-png), [CosmJS](https://github.com/cosmos/cosmjs), [Vite](https://vite.dev).

## Licence

MIT. See [LICENSE](LICENSE). How AI was used to build this: [AI_USAGE.md](AI_USAGE.md).
