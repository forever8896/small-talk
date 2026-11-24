// What this browser remembers: people (localStorage) and messages (IndexedDB). Nothing leaves the device.
const PEOPLE = "small-talk/people";

export const people = {
  all() { try { return JSON.parse(localStorage.getItem(PEOPLE)) ?? []; } catch { return []; } },
  save(list) { localStorage.setItem(PEOPLE, JSON.stringify(list)); },
  get(address) { return this.all().find((p) => p.address === address); },
  /** Adds the person if new. Returns { person, added }. */
  add(address, name) {
    const list = this.all(), found = list.find((p) => p.address === address);
    if (found) return { person: found, added: false };
    const person = { address, name: (name || "").trim().slice(0, 40) || `${address.slice(0, 9)}…${address.slice(-4)}` };
    list.push(person); this.save(list);
    return { person, added: true };
  },
  rename(address, name) { const list = this.all(), p = list.find((x) => x.address === address); if (p && name.trim()) { p.name = name.trim().slice(0, 40); this.save(list); } },
  remove(address) { this.save(this.all().filter((p) => p.address !== address)); },
};

let dbPromise;
function db() {
  return (dbPromise ??= new Promise((ok, fail) => {
    const req = indexedDB.open("small-talk", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("messages", { keyPath: "id" }).createIndex("thread", ["owner", "peer"]);
    req.onsuccess = () => ok(req.result); req.onerror = () => fail(req.error);
  }));
}
const done = (req) => new Promise((ok, fail) => { req.onsuccess = () => ok(req.result); req.onerror = () => fail(req.error); });

export const messages = {
  /** message: { id, owner, peer, dir: "in" | "out", text, ts, thumb, png? }. Returns false if it was already stored. */
  async put(message) {
    const store = (await db()).transaction("messages", "readwrite").objectStore("messages");
    if (await done(store.get(message.id))) return false;
    await done(store.put(message)); return true;
  },
  async thread(owner, peer) {
    const index = (await db()).transaction("messages").objectStore("messages").index("thread");
    return (await done(index.getAll([owner, peer]))).sort((a, b) => a.ts - b.ts);
  },
  async removeThread(owner, peer) {
    const store = (await db()).transaction("messages", "readwrite").objectStore("messages");
    for (const key of await done(store.index("thread").getAllKeys([owner, peer]))) store.delete(key);
  },
};
