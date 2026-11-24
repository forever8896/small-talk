import { defineConfig } from "vite";

// The public testnet REST endpoint sends no CORS headers, so the page reaches it through
// /lcd on its own origin. Only public queries and already-signed transactions pass through.
const lcd = { "/lcd": { target: "https://api-testnet.qore.host", changeOrigin: true, rewrite: (p) => p.replace(/^\/lcd/, "") } };
export default defineConfig({ server: { host: true, port: 5180, proxy: lcd }, preview: { host: true, port: 5180, proxy: lcd }, build: { target: "es2022" } });
