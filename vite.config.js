import { defineConfig } from "vite";
import { handleWall } from "./wall.mjs";

// The public testnet REST endpoint sends no CORS headers, so the page reaches it through
// /lcd on its own origin. Only public queries and already-signed transactions pass through.
const lcd = { "/lcd": { target: "https://api-testnet.qore.host", changeOrigin: true, rewrite: (p) => p.replace(/^\/lcd/, "") } };
// The Wall runs inside the dev server; in production server.mjs serves the same handler.
const wall = { name: "wall", configureServer(server) { server.middlewares.use((req, res, next) => { handleWall(req, res).then((handled) => handled || next(), next); }); } };

export default defineConfig({ plugins: [wall], server: { host: true, port: 5180, proxy: lcd, watch: { ignored: ["**/wall-data/**"] } }, build: { target: "es2022" } });
