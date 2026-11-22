// Hashes the shared API-reference fixtures so charted-sea-rs can detect drift.
//   node scripts/hash-fixtures.mjs          check test/fixtures/fixtures.sha256
//   node scripts/hash-fixtures.mjs --write  rewrite it
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../test/fixtures/", import.meta.url);
const dir = new URL("api-reference/", root);
const hashFile = new URL("fixtures.sha256", root);

const hash = createHash("sha256");
for (const name of readdirSync(dir)
  .filter((n) => n.endsWith(".json"))
  .sort()) {
  hash.update(`${name}\0`);
  // Normalise line endings so Windows checkouts hash the same.
  hash.update(readFileSync(new URL(name, dir), "utf8").replace(/\r\n/g, "\n"));
  hash.update("\0");
}
const digest = `${hash.digest("hex")}\n`;

if (process.argv.includes("--write")) {
  writeFileSync(hashFile, digest);
  console.log(`Wrote ${digest.trim()}`);
} else if (readFileSync(hashFile, "utf8") !== digest) {
  console.error(
    "test/fixtures/fixtures.sha256 is stale. Run `node scripts/hash-fixtures.mjs --write` and copy the fixtures to charted-sea-rs.",
  );
  process.exit(1);
} else {
  console.log(`Fixtures hash OK: ${digest.trim()}`);
}
