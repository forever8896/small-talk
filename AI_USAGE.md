# AI usage

This project is built by one person working with Claude Code (Anthropic) in the terminal.
This file is kept up to date as the work goes on.

## Workflow

- The human sets direction and makes the decisions; the assistant researches, proposes, writes
  code and tests, runs them, and reports what did and did not work.
- Third-party code (the QoreChain kits and every npm dependency) is installed and run inside a
  Docker container that can only see the project folder.
- Claims are checked against the live testnet before they are written down: the end-to-end test
  and the key-publishing test both run against `qorechain-diana`.

## What the human decided

- The idea and its direction: hidden messaging as the use case, pictures rather than text as the
  carrier, and removing the on-chain trace of who talks to whom.
- Not installing the wallet extension, which led to registering through the SDK instead.
- Turning it from a converter into a messenger: conversations, invite links, and the Wall as a
  way to deliver with no direct contact (the "mixer" idea was the human's).
- Scope, naming, what gets published and when.

## What the assistant produced

- All code in `src/`, `test/` and `spike/`, and the first drafts of the documentation.
- The design consequences of those decisions: a self-contained sealed message per picture
  instead of a handshake, QoreSeal's anonymous mode, and binding the signature to the recipient.
- Finding that raw ML-KEM ciphertexts are biased and would fingerprint a carrier picture, and the
  encoding that removes the bias.
- Finding that the testnet REST endpoint has no CORS headers, native memos cap at 256 characters
  and native contract uploads are closed, which shaped the architecture.

## Known corrections

- An early description said part of the hiding positions would be secret. That was dropped: all
  positions are public, and the README says so.
