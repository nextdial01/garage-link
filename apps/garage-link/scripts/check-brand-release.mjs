import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const required = ["src/lib/brand.ts", "src/app/.well-known/kannagi-release.json/route.ts", "public/favicon.ico", "public/brand/garage-link/og-1200x630.png", "public/brand/garage-link/pwa-192.png", "public/brand/garage-link/pwa-512.png"];
for (const path of required) assert.ok(existsSync(path), `missing ${path}`);
const og = readFileSync("public/brand/garage-link/og-1200x630.png");
assert.equal(og.readUInt32BE(16), 1200); assert.equal(og.readUInt32BE(20), 630);
assert.match(readFileSync("src/app/layout.tsx", "utf8"), /summary_large_image/);
console.log("brand release contract passed");
