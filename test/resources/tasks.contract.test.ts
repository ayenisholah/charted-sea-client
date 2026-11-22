import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { NetworkError, ValidationError } from "../../src/errors.js";
import { UUID_BATCH_SIZE } from "../../src/resources/tasks.js";
import type { Task, TaskRequest } from "../../src/types.js";
import { testClient } from "../support/client.js";
import { fixture } from "../support/fixtures.js";
import { BASE_URL, recorded, server, serveFixture, useMockApi } from "../support/mock-api.js";

useMockApi();

const runBody = fixture("run-sync").request.body as {
  requests: TaskRequest[];
  cacheMaxAgeInSec: number;
};

describe("tasks contract (API reference examples)", () => {
  it("FR-1/FR-2: run is asynchronous by default and matches the documented request", async () => {
    serveFixture("run-async");
    const { client } = testClient();
    const tasks = await client.tasks.run("shopee", runBody.requests, {
      autoCancelAfterSec: 1200,
      cacheMaxAgeInSec: 3600,
    });
    expect(tasks.map((t) => t.status)).toEqual(["PENDING", "PENDING", "PENDING"]);
    expect(tasks.every((t) => typeof t.uuid === "string")).toBe(true);
  });

  it("FR-1: run with wait: true returns task outcomes as data", async () => {
    serveFixture("run-sync");
    const { client } = testClient();
    const tasks = await client.tasks.run("shopee", runBody.requests, {
      wait: true,
      autoCancelAfterSec: 1200,
      cacheMaxAgeInSec: 3600,
    });
    expect(tasks.map((t) => t.status)).toEqual([
      "SUCCESS",
      "ERROR_TOO_MANY_TIMES",
      "BLOCKED_TOO_MANY_TIMES",
    ]);
    expect(tasks[1]?.errorMessage).toBe("... explanation ...");
    expect(tasks[2]?.payload).toEqual(runBody.requests[2]?.payload);
  });

  it("FR-9: scraper-specific parameters pass through to the body root unchanged", async () => {
    serveFixture("run-scraper-params");
    const { client } = testClient();
    await client.tasks.run(
      "shopee",
      [{ url: "https://shopee.co.id/api/v4/search/search_items?keyword=tshirt" }],
      {
        scraperParams: {
          productSearch_enrichUrlQuery_pageSize: 60,
          productSearch_crawlNextPages: true,
          productSearch_crawlNextPages_maxPages: 3,
          productSearch_crawlProductDetails: true,
        },
      },
    );
  });

  it("FR-1: runSingle puts the request fields at the body root", async () => {
    serveFixture("run-single-sync");
    const { client } = testClient();
    const task = await client.tasks.runSingle(
      "shopee",
      { url: (fixture("run-single-sync").request.body as { url: string }).url },
      { wait: true, autoCancelAfterSec: 1200 },
    );
    expect(task.status).toBe("SUCCESS");
  });

  it("FR-1: read, count and cancel match the documented requests", async () => {
    serveFixture("read-tasks");
    serveFixture("count-tasks");
    serveFixture("cancel-tasks");
    const { client } = testClient();
    const uuids = fixture("read-tasks").request.query["uuids"]?.split(",") ?? [];
    const read = await client.tasks.read("shopee", { uuids, limit: 20, offset: 0 });
    expect(read.map((t) => t.uuid)).toEqual(uuids);

    const counts = await client.tasks.count("shopee", {
      statuses: ["PENDING", "RUNNING", "BLOCKED", "ERROR"],
      minPendingAt: "2026-07-01T00:00:00Z",
    });
    expect(counts).toHaveLength(3);

    const cancelBody = fixture("cancel-tasks").request.body as {
      uuids: string[];
      countries: string[];
    };
    const cancelled = await client.tasks.cancel("shopee", cancelBody);
    expect(cancelled.uuids).toHaveLength(5);
  });

  it("FR-1: read accepts the page object the live API returns", async () => {
    serveFixture("read-tasks-live");
    const { client } = testClient();
    const [task] = await client.tasks.read("shopee", {
      uuids: ["27eb6795-7e90-4928-9f13-cbb753f4563c"],
      limit: 1,
    });
    expect(task).toMatchObject({ status: "BLOCKED", responseBody: "..." });
  });

  it("FR-5: splits more than 100 UUIDs into batches, requests each once, merges in input order", async () => {
    const uuids = Array.from(
      { length: 250 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    server.use(
      http.get(`${BASE_URL}/scraping-tasks/shopee`, ({ request }) => {
        const asked = new URL(request.url).searchParams.get("uuids")?.split(",") ?? [];
        // Answer in reverse order and drop one, to prove the merge.
        const tasks: Task[] = asked
          .filter((u) => !u.endsWith("042"))
          .reverse()
          .map((uuid) => ({
            uuid,
            url: `https://x/${uuid}`,
            status: "SUCCESS",
            responseBody: "{}",
          }));
        return HttpResponse.json(tasks);
      }),
    );
    const { client } = testClient();
    const tasks = await client.tasks.read("shopee", { uuids: [...uuids, uuids[0] ?? ""] });
    const batches = recorded.map((r) => r.query["uuids"]?.split(",") ?? []);
    expect(batches.map((b) => b.length)).toEqual([UUID_BATCH_SIZE, UUID_BATCH_SIZE, 50]);
    expect(batches.flat()).toEqual(uuids);
    expect(recorded.map((r) => r.query["limit"])).toEqual(["100", "100", "50"]);
    expect(tasks.map((t) => t.uuid)).toEqual(uuids.filter((u) => !u.endsWith("042")));
  });

  it("reads without UUIDs and with an empty UUID list", async () => {
    server.use(http.get(`${BASE_URL}/scraping-tasks/lazada`, () => HttpResponse.json([])));
    const { client } = testClient();
    await expect(client.tasks.read("lazada")).resolves.toEqual([]);
    await expect(client.tasks.read("lazada", { uuids: [] })).resolves.toEqual([]);
    expect(recorded).toHaveLength(1); // an empty UUID list sends nothing
  });

  it("encodes the scraper path segment", async () => {
    server.use(
      http.get(`${BASE_URL}/scraping-tasks/shopee-android/count`, () => HttpResponse.json([])),
    );
    const { client } = testClient();
    await expect(client.tasks.count("shopee-android")).resolves.toEqual([]);
  });

  it("NFR-2: a run whose connection drops is sent exactly once and flagged maybeSubmitted", async () => {
    server.use(http.post(`${BASE_URL}/scraping-tasks/shopee/run`, () => HttpResponse.error()));
    const { client } = testClient();
    const error = await client.tasks
      .run("shopee", [{ url: "https://shopee.sg/x" }])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).maybeSubmitted).toBe(true);
    expect(recorded).toHaveLength(1);
  });

  it.each([
    ["empty requests", (c: ReturnType<typeof testClient>["client"]) => c.tasks.run("shopee", [])],
    [
      "empty scraper",
      (c: ReturnType<typeof testClient>["client"]) => c.tasks.run(" ", [{ url: "u" }]),
    ],
    [
      "reserved scraperParams key",
      (c: ReturnType<typeof testClient>["client"]) =>
        c.tasks.run("shopee", [{ url: "u" }], { scraperParams: { requests: [] } }),
    ],
    [
      "cancel with nothing",
      (c: ReturnType<typeof testClient>["client"]) =>
        c.tasks.cancel("shopee", { uuids: [], countries: [] }),
    ],
    [
      "limit with > 100 uuids",
      (c: ReturnType<typeof testClient>["client"]) =>
        c.tasks.read("shopee", {
          uuids: Array.from({ length: 101 }, (_, i) => String(i)),
          limit: 5,
        }),
    ],
  ])("rejects %s locally without a request", async (_label, call) => {
    const { client } = testClient();
    await expect(call(client)).rejects.toBeInstanceOf(ValidationError);
    expect(recorded).toHaveLength(0);
  });

  it("cancels by UUID only", async () => {
    server.use(
      http.post(`${BASE_URL}/scraping-tasks/shopee/cancel`, async ({ request }) => {
        expect(await request.json()).toEqual({ uuids: ["a"] });
        return HttpResponse.json({ uuids: ["a"] });
      }),
    );
    const { client } = testClient();
    await expect(client.tasks.cancel("shopee", { uuids: ["a"] })).resolves.toEqual({
      uuids: ["a"],
      countries: [],
    });
  });

  it("cancels by country only", async () => {
    server.use(
      http.post(`${BASE_URL}/scraping-tasks/shopee/cancel`, async ({ request }) => {
        expect(await request.json()).toEqual({ countries: ["ID"] });
        return HttpResponse.json({ uuids: [], countries: ["ID"] });
      }),
    );
    const { client } = testClient();
    await expect(client.tasks.cancel("shopee", { countries: ["ID"] })).resolves.toEqual({
      uuids: [],
      countries: ["ID"],
    });
  });

  it("uses autoCancelAfterSec + 30 s as the timeout for synchronous runs", async () => {
    let signal: AbortSignal | undefined;
    const { client } = testClient({
      fetch: async (_url, init) => {
        signal = init?.signal ?? undefined;
        return HttpResponse.json([]);
      },
    });
    await client.tasks.runSingle("shopee", { url: "u" }, { wait: true }).catch(() => undefined);
    expect(signal?.aborted).toBe(false);
  });
});
