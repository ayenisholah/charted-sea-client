// NFR-4 / ADR 0002: the published package has no runtime dependencies.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const fields = ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies"];
const found = fields.flatMap((f) => Object.keys(pkg[f] ?? {}).map((d) => `${f}: ${d}`));
if (found.length > 0) {
  console.error(`Runtime dependencies are not allowed (ADR 0002):\n  ${found.join("\n  ")}`);
  process.exit(1);
}
console.log("No runtime dependencies.");
