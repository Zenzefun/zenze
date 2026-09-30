import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../.output/", import.meta.url).pathname;
const assets = join(root, "public/assets");
if (!existsSync(assets)) {
  console.log("[css] no assets dir");
  process.exit(0);
}

const files = readdirSync(assets).filter((name) => /^styles-[A-Za-z0-9_-]+\.css$/.test(name));
if (files.length === 0) {
  console.log("[css] no stylesheet emitted");
  process.exit(0);
}
const real = files[0];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(mjs|js|json|html|css)$/.test(name)) out.push(path);
  }
  return out;
}

const refs = new Set();
for (const path of walk(root)) {
  const text = readFileSync(path, "utf8");
  const found = text.match(/styles-[A-Za-z0-9_-]+\.css/g) || [];
  if (found.length === 0) continue;
  let next = text;
  for (const name of found) {
    refs.add(name);
    if (name !== real) next = next.split(name).join(real);
  }
  if (next !== text) writeFileSync(path, next);
}

for (const name of refs) {
  if (name === real) continue;
  copyFileSync(join(assets, real), join(assets, name));
}

console.log("[css]", real, "aliases", [...refs].filter((name) => name !== real).join(" ") || "none");
