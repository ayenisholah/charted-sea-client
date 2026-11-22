// Show what's still queued for a country, and cancel it only when asked to.
//   CHARTED_SEA_TOKEN=... npm run example -- examples/cancel-by-country.ts ID          # dry run
//   CHARTED_SEA_TOKEN=... npm run example -- examples/cancel-by-country.ts ID --yes    # cancel
import { createClient } from "charted-sea-client";

const country = process.argv[2];
const confirmed = process.argv.includes("--yes");
if (!country) {
  console.error("usage: cancel-by-country <COUNTRY> [--yes]");
  process.exit(1);
}

const cs = createClient();
const counts = await cs.tasks.count("shopee", {
  statuses: ["PENDING", "RUNNING", "BLOCKED", "ERROR"],
});
const queued = counts.filter((c) => c.country === country).reduce((n, c) => n + c.count, 0);
console.log(`${String(queued)} unfinished shopee task(s) in ${country}`);

if (queued > 0 && confirmed) {
  const result = await cs.tasks.cancel("shopee", { countries: [country] });
  console.log(`cancelled ${String(result.uuids.length)} task(s), including sub-tasks`);
} else if (queued > 0) {
  console.log("dry run; pass --yes to cancel");
}
