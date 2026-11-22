// The README quick start, run against the mock API. If this breaks, the README is wrong.
import { describe, expect, it } from "vitest";
import { fixture } from "./support/fixtures.js";
import { serveFixture, serveSequence, useMockApi } from "./support/mock-api.js";
import { testClient } from "./support/client.js";

useMockApi();

describe("README quick start", () => {
  it("submits, waits and reports each task", async () => {
    serveFixture("run-scraper-params");
    const uuid = "1ce16c7b-26f1-4851-a281-e09f79ce2de9";
    const url = "https://shopee.co.id/api/v4/search/search_items?keyword=tshirt";
    serveSequence("get", "/scraping-tasks/shopee", [
      [{ uuid, url, status: "RUNNING", responseBody: null }],
      [{ uuid, url, status: "SUCCESS", responseBody: '{"items":[]}' }],
    ]);
    const { client: cs } = testClient();
    const log: string[] = [];

    // --- README ---
    const submitted = await cs.tasks.run("shopee", [{ url }], {
      scraperParams: (({ requests: _r, ...rest }) => rest)(
        fixture("run-scraper-params").request.body as Record<string, unknown>,
      ),
    });

    const results = await cs.tasks.waitForResults(
      "shopee",
      submitted.flatMap((t) => (t.uuid ? [t.uuid] : [])),
      { maxWaitMs: 10 * 60_000 },
    );

    for (const task of results) {
      if (task.status === "SUCCESS") log.push(`${task.url} ${String(task.responseBody?.length)}`);
      else log.push(`${task.url} ${task.status} ${String(task.errorMessage)}`);
    }
    // --- end README ---

    expect(log).toEqual([`${url} 12`]);
  });
});
