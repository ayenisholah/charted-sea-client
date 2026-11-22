import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { healthQuery, type HealthQuery } from "../../src/resources/health.js";
import { testClient } from "../support/client.js";
import { recorded, serveFixture, useMockApi } from "../support/mock-api.js";

useMockApi();

const base: HealthQuery = {
  startAtIncl: "LAST_24H",
  granularity: "HOUR",
  scrapers: ["SHOPEE"],
  countries: ["SG", "ID"],
};

describe("health contract (API reference examples)", () => {
  it("FR-1: sessionMetrics matches the documented request and keeps every field", async () => {
    serveFixture("health-session-metrics");
    const { client } = testClient();
    const report = await client.health.sessionMetrics(base);
    expect(report.periods).toHaveLength(2);
    expect(report.periods[0]?.metrics[1]).toMatchObject({
      country: "ID",
      preparationSuccessRate: 0.72,
      p95ProxyBytes: 9234000,
    });
  });

  it("FR-1: taskMetrics sends knownApis and returns per-endpoint rows", async () => {
    serveFixture("health-task-metrics");
    const { client } = testClient();
    const report = await client.health.taskMetrics({
      ...base,
      knownApis: ["PRODUCT_SEARCH", "PRODUCT_DETAIL"],
    });
    expect(report.knownApis).toEqual(["PRODUCT_SEARCH", "PRODUCT_DETAIL"]);
    expect(
      report.periods[0]?.metrics.map((m) => `${m.country}/${m.knownApi}:${String(m.successRate)}`),
    ).toEqual([
      "SG/PRODUCT_SEARCH:0.97",
      "SG/PRODUCT_DETAIL:0.94",
      "ID/PRODUCT_SEARCH:0.65",
      "ID/UNKNOWN:0.88",
    ]);
  });
});

describe("FR-7: health queries are checked before any request", () => {
  const now = Date.parse("2026-06-11T00:00:00Z");

  it.each([
    [{ granularity: "WEEK" as never }, /granularity/],
    [{ scrapers: [] }, /scrapers/],
    [{ countries: [] }, /countries/],
    [{ startAtIncl: "2026-06-01T00:00:00Z", endAtExcl: "2026-06-09T00:00:01Z" }, /7 days/],
    [{ startAtIncl: "2026-06-03T00:00:00Z" }, /7 days/],
    [{ startAtIncl: "2026-06-05T00:00:00Z", endAtExcl: "2026-06-04T00:00:00Z" }, /before/],
    [{ startAtIncl: "yesterday" }, /startAtIncl is not a valid/],
    [{ endAtExcl: "later" }, /endAtExcl is not a valid/],
  ])("rejects %j", async (patch, message) => {
    expect(() => healthQuery({ ...base, ...patch }, now)).toThrow(message);
    const { client } = testClient();
    await expect(client.health.sessionMetrics({ ...base, ...patch })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(recorded).toHaveLength(0);
  });

  it("accepts exactly 7 days, Dates, NOW and a shortcut with an explicit end", () => {
    expect(() => healthQuery({ ...base, startAtIncl: "2026-06-04T00:00:00Z" }, now)).not.toThrow();
    expect(() =>
      healthQuery(
        { ...base, startAtIncl: new Date("2026-06-10T00:00:00Z"), endAtExcl: new Date(now) },
        now,
      ),
    ).not.toThrow();
    expect(() =>
      healthQuery({ ...base, startAtIncl: "2026-06-10T00:00:00Z", endAtExcl: "NOW" }, now),
    ).not.toThrow();
    expect(healthQuery({ ...base, endAtExcl: "2026-06-11T00:00:00Z" }, now)).toMatchObject({
      startAtIncl: "LAST_24H",
      endAtExcl: "2026-06-11T00:00:00Z",
    });
  });
});
