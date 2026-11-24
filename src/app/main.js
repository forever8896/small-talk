import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { identityFromMnemonic } from "../core/identity.js";
import { status, publishKeys } from "../core/chain.js";
import { hide, reveal } from "../core/message.js";
import { openPicture, toPng, readPng, thumbnail } from "./image.js";
import { people, messages } from "./store.js";

const CHAIN_ID = "qorechain-diana", REST = "/lcd", STORE = "small-talk/mnemonic";
const FAUCET = "https://dashboard.qorechain.io/faucet";
const ADDRESS = /^qor1[0-9a-z]{38}$/;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children); return n; };
const say = (node, text, error = false) => { node.textContent = text; node.classList.toggle("error", error); };
const short = (a) => `${a.slice(0, 9)}…${a.slice(-4)}`;
const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
const messageId = async (from, to, ts, text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([from, to, ts, text]))));

let toastTimer;
function toast(text, ms = 5000) { $("toast").textContent = text; $("toast").hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => ($("toast").hidden = true), ms); }

// ---- you ----
let me, ready = false;
const inviteLink = () => `${location.origin}/#add=${me.address}`;
function loadIdentity() {
  let phrase = localStorage.getItem(STORE);
  if (!phrase) { phrase = generateMnemonic(wordlist, 256); localStorage.setItem(STORE, phrase); }
  me = identityFromMnemonic(phrase);
  $("me-address").textContent = me.address; $("me-phrase").textContent = phrase; $("me-link").textContent = inviteLink();
}
async function refreshYou() {
  let s;
  try { s = await status({ rest: REST, me }); } catch { say($("me-hint"), "Could not reach the testnet.", true); return; }
  ready = s.signingKey && s.encryptionKey;
  $("you-dot").classList.toggle("ready", ready);
  $("me-chip-label").textContent = ready ? "You" : "Set up";
  const item = (done, text) => el("li", { className: done ? "done" : "", textContent: text });
  $("me-status").replaceChildren(item(s.qor > 0 || ready, `Test QOR: ${s.qor.toFixed(2)}`), item(s.signingKey, "Signing key (ML-DSA-87) on chain"), item(s.encryptionKey, "Encryption key (ML-KEM-1024) on chain"));
  $("me-publish").hidden = ready || s.qor < 0.1;
  $("me-hint").classList.remove("error");
  if (ready) $("me-hint").textContent = "You're set. Send people your invite link so they can write to you.";
  else if (s.qor < 0.1) $("me-hint").replaceChildren("Publishing your keys costs about 0.06 test QOR. Paste your address into the ", el("a", { href: FAUCET, target: "_blank", rel: "noopener", textContent: "faucet" }), ", then come back.");
  else $("me-hint").textContent = s.otherEncryptionKey ? "A different encryption key is on chain for this address. Publishing replaces it." : "";
}
$("me-chip").onclick = () => { $("you").showModal(); refreshYou(); };
$("me-copy").onclick = () => navigator.clipboard.writeText(me.address).then(() => toast("Address copied"));
$("me-copy-link").onclick = () => navigator.clipboard.writeText(inviteLink()).then(() => toast("Invite link copied"));
$("me-publish").onclick = async () => {
  $("me-publish").disabled = true;
  try { await publishKeys({ rest: REST, chainId: CHAIN_ID, me, onStep: (s) => say($("me-hint"), `Publishing your ${s}…`) }); }
  catch (e) { say($("me-hint"), e.message, true); $("me-publish").disabled = false; return; }
  $("me-publish").disabled = false; await refreshYou();
};
let importArmed = false;
$("me-import").oninput = () => { importArmed = false; $("me-import-go").textContent = "Switch to this phrase"; };
$("me-import-go").onclick = () => {
  const phrase = $("me-import").value.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(phrase, wordlist)) return say($("me-hint"), "That is not a valid recovery phrase.", true);
  if (!importArmed) { importArmed = true; $("me-import-go").textContent = "Replace the current phrase for good"; return say($("me-hint"), "The phrase stored in this browser will be lost unless you wrote it down. Press again to confirm.", true); }
  localStorage.setItem(STORE, phrase); location.reload();
};

// ---- people ----
let current = null; // address of the open conversation
function renderPeople() {
  $("people-list").replaceChildren(...people.all().map((p) => {
    const b = el("button", { textContent: p.name, title: p.address }); b.setAttribute("aria-current", p.address === current);
    b.onclick = () => openThread(p.address);
    return el("li", {}, b);
  }));
}
function parseInvite(text) {
  const t = text.trim(), hash = t.includes("#") ? new URLSearchParams(t.slice(t.indexOf("#") + 1)) : null;
  const address = hash?.get("add") ?? t;
  return ADDRESS.test(address) ? { address, name: hash?.get("name") ?? "" } : null;
}
function addPerson(text) {
  const invite = parseInvite(text);
  if (!invite) return say($("add-status"), "That is not an invite link or a qor1 address.", true), false;
  if (invite.address === me.address) return say($("add-status"), "That's you.", true), false;
  people.add(invite.address, invite.name); say($("add-status"), ""); openThread(invite.address);
  return true;
}
$("add-form").onsubmit = (e) => { e.preventDefault(); if (addPerson($("add-input").value)) $("add-input").value = ""; };
$("peer-name").onchange = () => { people.rename(current, $("peer-name").value); renderPeople(); };
let removeArmed = false;
$("peer-remove").onclick = async () => {
  if (!removeArmed) { removeArmed = true; $("peer-remove").textContent = "Remove for good?"; setTimeout(() => { removeArmed = false; $("peer-remove").textContent = "Remove"; }, 4000); return; }
  await messages.removeThread(me.address, current); people.remove(current); current = null; showThread(); renderPeople();
};

// ---- conversation ----
let peerOk = false;
function bubble(m) {
  const li = el("li", { className: m.dir });
  if (m.thumb) li.append(el("img", { src: m.thumb, alt: m.dir === "out" ? "The picture carrying your message" : "The picture this message arrived in" }));
  li.append(el("p", { className: "text", textContent: m.text }));
  const meta = el("div", { className: "meta" }, el("span", { textContent: new Date(m.ts * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) }));
  if (m.dir === "in") meta.append(el("span", { className: "ok", textContent: "Signature checked on chain" }));
  if (m.png) {
    const file = new File([m.png], "picture.png", { type: "image/png" }), actions = el("span", { className: "actions" });
    const save = el("a", { className: "button", textContent: "Save picture", download: "picture.png" });
    save.onclick = () => { save.href = URL.createObjectURL(m.png); setTimeout(() => URL.revokeObjectURL(save.href), 60000); };
    actions.append(save);
    if (navigator.canShare?.({ files: [file] })) { const share = el("button", { textContent: "Share" }); share.onclick = () => navigator.share({ files: [file] }).catch(() => {}); actions.append(share); }
    meta.append(actions);
  }
  li.append(meta);
  return li;
}
async function showThread() {
  const person = current && people.get(current);
  $("thread-empty").hidden = !!person; $("thread-head").hidden = $("composer").hidden = !person; $("peer-status").hidden = true;
  $("messages").replaceChildren();
  if (!person) return;
  $("peer-name").value = person.name; $("peer-address").textContent = person.address;
  $("messages").replaceChildren(...(await messages.thread(me.address, person.address)).map(bubble));
  $("messages").scrollTop = $("messages").scrollHeight;
  peerOk = false; canSend();
  try {
    const kem = await fetchKemKey({ rest: REST, address: person.address });
    if (current !== person.address) return;
    peerOk = kem.registered;
    $("peer-status").hidden = peerOk;
    if (!peerOk) say($("peer-status"), "This person has not published an encryption key yet, so nothing can be sealed to them. They need to open Small Talk and finish setting up.", true);
  } catch { $("peer-status").hidden = false; say($("peer-status"), "Could not reach the testnet.", true); }
  canSend();
}
function openThread(address) { current = address; renderPeople(); return showThread(); }

// ---- writing ----
let picture = null;
const canSend = () => { $("send").disabled = !(picture && peerOk && $("text").value.trim()); };
$("text").oninput = canSend;
async function pick(file) {
  if (!file) return;
  try { picture = await openPicture(file); $("pick-label").textContent = `${file.name.slice(0, 24)} · ${picture.width}×${picture.height}`; say($("compose-status"), ""); }
  catch { picture = null; say($("compose-status"), "That file could not be opened as a picture.", true); }
  canSend();
}
$("pick-file").onchange = (e) => pick(e.target.files[0]);
$("snap-file").onchange = (e) => pick(e.target.files[0]);
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  if (!ready) { await refreshYou(); if (!ready) { $("you").showModal(); return say($("compose-status"), "Publish your own keys first, so the recipient can check the message is from you.", true); } }
  $("send").disabled = true; say($("compose-status"), "Sealing and hiding…");
  try {
    const peer = current, text = $("text").value;
    const { rgba, ts } = await hide({ rest: REST, chainId: CHAIN_ID, me, to: peer, text, ...picture });
    const out = { rgba, width: picture.width, height: picture.height };
    await messages.put({ id: await messageId(me.address, peer, ts, text), owner: me.address, peer, dir: "out", text, ts, thumb: await thumbnail(out), png: toPng(out) });
    $("text").value = ""; picture = null; $("pick-label").textContent = "Picture"; $("pick-file").value = ""; $("snap-file").value = "";
    say($("compose-status"), "Hidden. Save the picture and send it as a file, not as a photo: apps that recompress pictures destroy the message.");
    if (current === peer) await showThread();
  } catch (err) { say($("compose-status"), err.message, true); }
  canSend();
};

// ---- reading: drop, paste or pick a picture anywhere ----
async function check(file) {
  if (!file) return;
  toast("Looking…", 20000);
  const png = await readPng(file);
  if (!png) return toast("Only PNG files can carry a message. If this arrived as a JPEG, the app that delivered it recompressed it.", 8000);
  let got;
  try { got = await reveal({ rest: REST, chainId: CHAIN_ID, me, ...png }); }
  catch (e) { return toast(`A message opened, but it failed its checks and is not shown: ${e.message}`, 9000); }
  if (!got) return toast("Nothing in this picture for you. It may be an ordinary picture, or a message for someone else: the two look the same.", 8000);
  const { added } = people.add(got.from);
  const fresh = await messages.put({ id: await messageId(got.from, me.address, got.ts, got.text), owner: me.address, peer: got.from, dir: "in", text: got.text, ts: got.ts, thumb: await thumbnail(png) });
  toast(fresh ? (added ? "A message from someone new." : `A message from ${people.get(got.from).name}.`) : "You already have this one.", 4000);
  await openThread(got.from);
}
$("check-file").onchange = (e) => { check(e.target.files[0]); e.target.value = ""; };
let depth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; $("veil").hidden = false; } });
addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; $("veil").hidden = true; } });
addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener("drop", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; $("veil").hidden = true; check(e.dataTransfer.files[0]); });
addEventListener("paste", (e) => { const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/")); if (file) { e.preventDefault(); check(file); } });

// ---- start ----
loadIdentity(); renderPeople(); refreshYou();
if (location.hash.startsWith("#add=")) { addPerson(location.href); history.replaceState(null, "", location.pathname); }
else if (people.all().length) openThread(people.all()[0].address);
