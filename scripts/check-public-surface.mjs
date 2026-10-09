#!/usr/bin/env node
/**
 * Public pages must not contain the phrases security scanners treat as a
 * credential harvest, even in a denial. Operator desk files are excluded.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/routes", "src/components", "src/lib/og-copy.ts", "src/lib/seo.ts"];
const SKIP = /(?:^|\/)arise/;
const BANNED = [
  /seed phrase/i,
  /private key/i,
  /mnemonic/i,
  /recovery phrase/i,
  /type="password"/,
  /http-equiv=["']refresh/i,
  /\badobe\b/i,
];

function files(path, out = []) {
  const st = statSync(path);
  if (st.isFile()) {
    if (/\.(tsx|ts)$/.test(path)) out.push(path);
    return out;
  }
  for (const name of readdirSync(path)) {
    if (name === "node_modules") continue;
    files(join(path, name), out);
  }
  return out;
}

const hits = [];
for (const root of ROOTS) {
  for (const file of files(root)) {
    if (SKIP.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const rule of BANNED) {
      if (rule.test(text)) hits.push(`${file}: ${rule}`);
    }
  }
}

if (hits.length) {
  console.error("public surface check failed");
  for (const hit of hits) console.error(hit);
  process.exit(1);
}
console.log("public surface check ok");
