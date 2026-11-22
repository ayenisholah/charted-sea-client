// Live smoke test against the real API. Spends at most one task credit the first time;
// cacheMaxAgeInSec=86400 makes repeat runs within a day free. Never part of `npm test`.
import { describe, expect, it } from "vitest";
import { createClient } from "../../src/client.js";
import { isTerminalStatus } from "../../src/polling/status.js";

const token = process.env["CHARTED_SEA_TOKEN"];
const URL_UNDER_TEST = "https://shopee.sg/api/v4/search/search_items?keyword=tshirt";

describe.skipIf(!token)("live API", () => {
  const cs = createClient({ token: token ?? "" });

  it("reads task health for Shopee SG", async () => {
    const report = await cs.health.taskMetrics({
      startAtIncl: "LAST_1H",
      granularity: "TOTAL",
      scrapers: ["SHOPEE"],
      countries: ["SG"],
    });
    console.info("health:", JSON.stringify(report.periods.flatMap((p) => p.metrics)));
    expect(report.granularity).toBe("TOTAL");
  });

  it("runs one cached task asynchronously and waits for it", async () => {
    const submitted = await cs.tasks.run("shopee", [{ url: URL_UNDER_TEST }], {
      cacheMaxAgeInSec: 86_400,
    });
    // Records the undocumented async response shape (open question 1).
    console.info(
      "async run response:",
      JSON.stringify(
        submitted.map(({ responseBody, ...rest }) => ({
          ...rest,
          responseBodyLength: responseBody?.length ?? null,
        })),
      ),
    );
    expect(submitted).toHaveLength(1);
    const uuid = submitted[0]?.uuid;
    expect(typeof uuid).toBe("string");

    const [task] = await cs.tasks.waitForResults("shopee", [uuid ?? ""], {
      maxWaitMs: 10 * 60_000,
      onProgress: (p) => {
        console.info("progress:", JSON.stringify(p));
      },
    });
    console.info(
      "final:",
      task?.status,
      task?.errorMessage ?? "",
      `${String(task?.responseBody?.length ?? 0)} chars`,
    );
    expect(task && isTerminalStatus(task.status)).toBe(true);
  });
});
