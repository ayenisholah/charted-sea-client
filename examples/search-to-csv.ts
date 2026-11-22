// Submit Shopee search pages, wait for them, and write one CSV row per task.
// Bodies are raw platform JSON; this example records size and status, not products.
//   CHARTED_SEA_TOKEN=... npm run example -- examples/search-to-csv.ts tshirt hoodie > out.csv
import { createClient } from "charted-sea-client";

const keywords = process.argv.slice(2);
if (keywords.length === 0) {
  console.error("usage: search-to-csv <keyword>...");
  process.exit(1);
}

const cs = createClient();
const requests = keywords.map((k) => ({
  url: `https://shopee.sg/api/v4/search/search_items?keyword=${encodeURIComponent(k)}`,
}));

// A cached result up to an hour old is returned free of charge.
const submitted = await cs.tasks.run("shopee", requests, { cacheMaxAgeInSec: 3600 });
const results = await cs.tasks.waitForResults(
  "shopee",
  submitted.flatMap((t) => (t.uuid ? [t.uuid] : [])),
  {
    onProgress: (p) => {
      console.error(`${String(p.done)}/${String(p.total)} done`);
    },
  },
);

const csv = (v: string) => `"${v.replaceAll('"', '""')}"`;
console.log("url,status,bytes,error");
for (const t of results) {
  console.log(
    [csv(t.url), t.status, String(t.responseBody?.length ?? 0), csv(t.errorMessage ?? "")].join(
      ",",
    ),
  );
}
