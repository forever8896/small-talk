import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { identityFromMnemonic } from "../core/identity.js";
import { status, publishKeys } from "../core/chain.js";
import { hide, reveal } from "../core/message.js";
import { openPicture, toPng, readPng } from "./image.js";

const CHAIN_ID = "qorechain-diana", REST = "/lcd", STORE = "small-talk/mnemonic";
const FAUCET = "https://dashboard.qorechain.io/faucet";
const $ = (id) => document.getElementById(id);
const say = (el, text, error = false) => { el.textContent = text; el.classList.toggle("error", error); };
const short = (a) => `${a.slice(0, 10)}…${a.slice(-6)}`;

// ---- identity ----
let me, ready = false;
function loadIdentity() {
  let phrase = localStorage.getItem(STORE);
  if (!phrase) { phrase = generateMnemonic(wordlist, 256); localStorage.setItem(STORE, phrase); }
  me = identityFromMnemonic(phrase);
  $("me-address").textContent = me.address; $("me-phrase").textContent = phrase;
}
async function refreshYou() {
  let s;
  try { s = await status({ rest: REST, me }); } catch { say($("me-hint"), "Could not reach the testnet.", true); return; }
  ready = s.signingKey && s.encryptionKey;
  $("you-dot").classList.toggle("ready", ready);
  const item = (done, text) => `<li class="${done ? "done" : ""}">${text}</li>`;
  $("me-status").innerHTML = item(s.qor > 0 || ready, `Test QOR: ${s.qor.toFixed(2)}`) + item(s.signingKey, "Signing key (ML-DSA-87) on chain") + item(s.encryptionKey, "Encryption key (ML-KEM-1024) on chain");
  $("me-publish").hidden = ready || s.qor < 0.1;
  $("me-hint").innerHTML = ready ? "You're set. Give people your address so they can write to you."
    : s.qor < 0.1 ? `Publishing your keys costs about 0.06 test QOR. Paste your address into the <a href="${FAUCET}" target="_blank" rel="noopener">faucet</a>, then come back.`
    : s.otherEncryptionKey ? "A different encryption key is on chain for this address. Publishing replaces it." : "";
  $("me-hint").classList.remove("error");
}
$("me-copy").onclick = () => navigator.clipboard.writeText(me.address);
$("me-publish").onclick = async () => {
  $("me-publish").disabled = true;
  try { await publishKeys({ rest: REST, chainId: CHAIN_ID, me, onStep: (s) => say($("me-hint"), `Publishing your ${s}…`) }); }
  catch (e) { say($("me-hint"), e.message, true); $("me-publish").disabled = false; return; }
  $("me-publish").disabled = false; await refreshYou();
};
$("me-import-go").onclick = () => {
  const phrase = $("me-import").value.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(phrase, wordlist)) return say($("me-hint"), "That is not a valid recovery phrase.", true);
  if (!confirm("Replace the phrase stored in this browser? The current one cannot be recovered unless you wrote it down.")) return;
  localStorage.setItem(STORE, phrase); $("me-import").value = ""; loadIdentity(); refreshYou();
};

// ---- tabs ----
for (const tab of document.querySelectorAll("[role=tab]")) tab.onclick = () => {
  for (const t of document.querySelectorAll("[role=tab]")) t.setAttribute("aria-selected", t === tab);
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== tab.dataset.tab;
  if (tab.dataset.tab === "you") refreshYou();
};
function dropZone(zone, input, onFile) {
  input.onchange = () => input.files[0] && onFile(input.files[0]);
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("over"); };
  zone.ondragleave = () => zone.classList.remove("over");
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove("over"); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); };
}

// ---- hide ----
let picture, recipientOk = false, lastUrl;
const canHide = () => { $("hide-go").disabled = !(picture && recipientOk && $("text").value.trim()); };
let toTimer;
$("to").oninput = () => {
  recipientOk = false; canHide(); clearTimeout(toTimer);
  const to = $("to").value.trim();
  if (!/^qor1[0-9a-z]{38}$/.test(to)) return say($("to-status"), to ? "A QoreChain address starts with qor1 and has 42 characters." : "");
  toTimer = setTimeout(async () => {
    try {
      const kem = await fetchKemKey({ rest: REST, address: to });
      if ($("to").value.trim() !== to) return;
      recipientOk = kem.registered;
      say($("to-status"), kem.registered ? `Encryption key found on chain (published at block ${kem.registeredHeight}).` : "This address has not published an encryption key yet, so nothing can be sealed to it.", !kem.registered);
    } catch { say($("to-status"), "Could not reach the testnet.", true); }
    canHide();
  }, 250);
};
$("text").oninput = canHide;
dropZone($("hide-drop"), $("hide-file"), async (file) => {
  try { picture = await openPicture(file); $("hide-drop-label").textContent = `${file.name} · ${picture.width} × ${picture.height}`; say($("hide-status"), ""); }
  catch { picture = null; say($("hide-status"), "That file could not be opened as a picture.", true); }
  canHide();
});
$("hide-go").onclick = async () => {
  if (!ready) { await refreshYou(); if (!ready) return say($("hide-status"), "Publish your own keys first (the You tab), so the recipient can check the message is from you.", true); }
  $("hide-go").disabled = true; $("hide-result").hidden = true; say($("hide-status"), "Sealing and hiding…");
  try {
    const before = picture.rgba;
    const { rgba } = await hide({ rest: REST, chainId: CHAIN_ID, me, to: $("to").value.trim(), text: $("text").value, ...picture });
    let changed = 0; for (let i = 0; i < rgba.length; i++) changed += rgba[i] !== before[i];
    const blob = toPng({ rgba, width: picture.width, height: picture.height });
    if (lastUrl) URL.revokeObjectURL(lastUrl); lastUrl = URL.createObjectURL(blob);
    $("hide-preview").src = lastUrl; $("hide-download").href = lastUrl;
    say($("hide-facts"), `${(blob.size / 1e6).toFixed(1)} MB. ${changed.toLocaleString()} colour values moved by one step out of ${(picture.width * picture.height * 3).toLocaleString()} (${((100 * changed) / (picture.width * picture.height * 3)).toFixed(1)}%).`);
    $("hide-result").hidden = false; say($("hide-status"), "");
  } catch (e) { say($("hide-status"), e.message, true); }
  canHide();
};

// ---- reveal ----
dropZone($("reveal-drop"), $("reveal-file"), async (file) => {
  $("reveal-result").hidden = true; say($("reveal-status"), "Looking…");
  const png = await readPng(file);
  if (!png) return say($("reveal-status"), "Only PNG files can carry a message. If this arrived as a JPEG, the app that delivered it recompressed it.", true);
  try {
    const got = await reveal({ rest: REST, chainId: CHAIN_ID, me, ...png });
    if (!got) return say($("reveal-status"), "Nothing in this picture for you. It may be an ordinary picture, or a message for someone else: the two look the same.");
    $("reveal-text").textContent = got.text;
    $("reveal-from").textContent = `from ${short(got.from)}`; $("reveal-from").title = got.from;
    $("reveal-when").textContent = new Date(got.ts * 1000).toLocaleString();
    $("reveal-proof").textContent = "Signature checked against the sender's ML-DSA-87 key on chain.";
    $("reveal-result").hidden = false; say($("reveal-status"), "");
  } catch (e) { say($("reveal-status"), `A message opened, but it failed its checks and is not shown: ${e.message}`, true); }
});

loadIdentity(); refreshYou();
