// Check recent platform health before spending credits on a batch, as the API docs recommend.
//   CHARTED_SEA_TOKEN=... npm run example -- examples/health-gated-batch.ts
import { createClient, type TaskMetric } from "charted-sea-client";

const MIN_SUCCESS_RATE = 0.8;
const cs = createClient();

const health = await cs.health.taskMetrics({
  startAtIncl: "LAST_1H",
  granularity: "TOTAL",
  scrapers: ["SHOPEE"],
  countries: ["SG"],
  knownApis: ["PRODUCT_SEARCH"],
});

const rows: TaskMetric[] = health.periods.flatMap((p) => p.metrics);
const healthy = rows.some(
  (m) => m.confidence === "HIGH" && m.successRate !== null && m.successRate >= MIN_SUCCESS_RATE,
);
for (const m of rows) {
  console.error(
    `${m.country} ${m.device} ${m.knownApi}: ${String(m.successRate)} (${m.confidence})`,
  );
}

if (!healthy) {
  console.error(
    `Success rate below ${String(MIN_SUCCESS_RATE)} or low confidence; try again later.`,
  );
  process.exit(2);
}

const [task] = await cs.tasks.run(
  "shopee",
  [{ url: "https://shopee.sg/api/v4/search/search_items?keyword=tshirt" }],
  { cacheMaxAgeInSec: 3600 },
);
if (task?.uuid) {
  const [done] = await cs.tasks.waitForResults("shopee", [task.uuid]);
  console.log(done?.status);
}
