// The Wall: a public pile of pictures. Anyone posts, anyone reads, the server understands nothing.
// A request handler with no dependencies, shared by the dev server (vite.config.js) and server.mjs.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.WALL_DIR ?? "wall-data";
const MAX_BYTES = 4 * 1024 * 1024, MAX_SIDE = 2000, KEEP = 300, PER_HOUR = 20;
const ADMIN = process.env.WALL_ADMIN_TOKEN;
const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

mkdirSync(DIR, { recursive: true });
/** Newest last. File names are `<ms timestamp>-<id>-<width>x<height>.png`. */
let index = readdirSync(DIR).map((f) => /^(\d+)-([0-9a-f]{16})-(\d+)x(\d+)\.png$/.exec(f)).filter(Boolean)
  .map(([file, ts, id, w, h]) => ({ id, ts: Number(ts), width: Number(w), height: Number(h), bytes: statSync(join(DIR, file)).size, file }))
  .sort((a, b) => a.ts - b.ts);

const recent = new Map(); // ip -> timestamps of posts in the last hour
function allowed(ip) {
  const now = Date.now(), list = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= PER_HOUR) return false;
  list.push(now); recent.set(ip, list); return true;
}
const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
function body(req) {
  return new Promise((ok, fail) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BYTES) { fail(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", fail);
  });
}
/** Width, height and whether this is the kind of PNG the page writes (8-bit RGB or RGBA, not interlaced). */
function inspect(png) {
  if (png.length < 33 || !png.subarray(0, 8).equals(MAGIC) || png.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (png[24] !== 8 || (png[25] !== 2 && png[25] !== 6) || png[28] !== 0) return null;
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) return null;
  return { width, height };
}

/** Handles /wall requests. Returns false when the request is not for the Wall. */
export async function handleWall(req, res) {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/wall" && !url.pathname.startsWith("/wall/")) return false;
  const one = /^\/wall\/([0-9a-f]{16})(\.png)?$/.exec(url.pathname);

  if (req.method === "GET" && url.pathname === "/wall") {
    const after = Number(url.searchParams.get("after") ?? 0);
    json(res, 200, index.filter((e) => e.ts > after).map(({ file, ...e }) => e));
  } else if (req.method === "GET" && one) {
    const entry = index.find((e) => e.id === one[1]);
    if (!entry) return json(res, 404, { error: "not found" }), true;
    res.writeHead(200, { "content-type": "image/png", "content-length": entry.bytes, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
    res.end(readFileSync(join(DIR, entry.file)));
  } else if (req.method === "POST" && url.pathname === "/wall") {
    const ip = (req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"]?.split(",")[0] ?? req.socket.remoteAddress ?? "").trim();
    if (!allowed(ip)) return json(res, 429, { error: "Too many pictures from this address. Try again in an hour." }), true;
    let png; try { png = await body(req); } catch { return json(res, 413, { error: "Pictures on the Wall can be up to 4 MB." }), true; }
    const info = inspect(png);
    if (!info) return json(res, 415, { error: "The Wall takes 8-bit colour PNG pictures up to 2000 pixels a side." }), true;
    const id = createHash("sha256").update(png).digest("hex").slice(0, 16);
    if (!index.some((e) => e.id === id)) {
      const ts = Date.now(), file = `${ts}-${id}-${info.width}x${info.height}.png`;
      writeFileSync(join(DIR, file), png);
      index.push({ id, ts, ...info, bytes: png.length, file });
      while (index.length > KEEP) { const old = index.shift(); try { unlinkSync(join(DIR, old.file)); } catch {} }
    }
    json(res, 200, { id });
  } else if (req.method === "DELETE" && one) {
    if (!ADMIN || req.headers["x-admin-token"] !== ADMIN) return json(res, 403, { error: "forbidden" }), true;
    const i = index.findIndex((e) => e.id === one[1]);
    if (i >= 0) { try { unlinkSync(join(DIR, index[i].file)); } catch {} index.splice(i, 1); }
    json(res, 200, { removed: i >= 0 });
  } else json(res, 405, { error: "method not allowed" });
  return true;
}
