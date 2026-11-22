// Imports the built package as ESM and as CJS and checks the public surface is there.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const esm = await import("../dist/index.js");
const cjs = createRequire(import.meta.url)("../dist/index.cjs");

for (const [format, mod] of [
  ["esm", esm],
  ["cjs", cjs],
]) {
  assert.equal(typeof mod.redact, "function", `${format}: redact export`);
  assert.equal(mod.redact("http://u:p@h"), "http://***@h", `${format}: redact works`);
}
console.log("ESM and CJS imports OK");
