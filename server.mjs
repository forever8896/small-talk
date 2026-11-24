// Production server, no dependencies: the built page, the /lcd pass-through to the testnet REST
// endpoint (which sends no CORS headers), and the Wall. Usage: npm run build && node server.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { handleWall } from "./wall.mjs";

const PORT = Number(process.env.PORT ?? 5180), LCD = process.env.LCD ?? "https://api-testnet.qore.host", DIST = "dist";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };

async function lcd(req, res) {
  if (req.method !== "GET" && req.method !== "POST") { res.writeHead(405).end(); return; }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 256 * 1024) { res.writeHead(413).end(); return; } chunks.push(c); }
  const upstream = await fetch(LCD + req.url.slice(4), { method: req.method, headers: { "content-type": req.headers["content-type"] ?? "application/json" }, body: req.method === "POST" ? Buffer.concat(chunks) : undefined });
  res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/lcd/")) return await lcd(req, res);
    if (await handleWall(req, res)) return;
    const path = normalize(new URL(req.url, "http://x").pathname).replace(/^(\.\.[/\\])+/, "");
    const file = join(DIST, path === "/" || !extname(path) ? "index.html" : path);
    const data = await readFile(file).catch(() => null);
    if (!data) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "x-content-type-options": "nosniff", "cache-control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
    res.end(data);
  } catch (e) { if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" }); res.end("upstream error"); }
}).listen(PORT, () => console.log(`Small Talk on http://localhost:${PORT}`));
