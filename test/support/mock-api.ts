import { http, HttpResponse, type JsonBodyType } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { fixture, type FixtureName } from "./fixtures.js";

export const BASE_URL = "https://api.test";
export const TEST_TOKEN = "cs_test_000";

/** Query parameters each endpoint documents in the API reference. */
const SURFACE: { method: string; path: RegExp; query: string[] }[] = [
  {
    method: "POST",
    path: /^\/scraping-tasks\/[^/]+\/(run|run-single)$/,
    query: [
      "waitForCompletion",
      "autoCancelAfterSec",
      "includeAllFields",
      "includeFields",
      "httpStatusOnError",
    ],
  },
  {
    method: "GET",
    path: /^\/scraping-tasks\/[^/]+$/,
    query: [
      "limit",
      "offset",
      "uuids",
      "urls",
      "minPendingAt",
      "maxPendingAt",
      "includeAllFields",
      "includeFields",
    ],
  },
  { method: "GET", path: /^\/scraping-tasks\/[^/]+\/count$/, query: ["statuses", "minPendingAt"] },
  { method: "POST", path: /^\/scraping-tasks\/[^/]+\/cancel$/, query: [] },
  {
    method: "GET",
    path: /^\/health\/session-metrics$/,
    query: ["startAtIncl", "endAtExcl", "granularity", "scrapers", "countries"],
  },
  {
    method: "GET",
    path: /^\/health\/scraping-task-metrics$/,
    query: ["startAtIncl", "endAtExcl", "granularity", "scrapers", "countries", "knownApis"],
  },
  { method: "POST", path: /^\/proxy-validate$/, query: [] },
  { method: "GET", path: /^\/proxy-configs$/, query: [] },
  { method: "PUT", path: /^\/proxy-configs$/, query: [] },
];

export interface Recorded {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Headers;
}

export const server = setupServer();
export const recorded: Recorded[] = [];
const violations: string[] = [];

server.events.on("request:start", ({ request }) => {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  const entry = SURFACE.find((e) => e.method === request.method && e.path.test(url.pathname));
  if (!entry) violations.push(`undocumented endpoint ${request.method} ${url.pathname}`);
  for (const key of Object.keys(query)) {
    if (!entry?.query.includes(key))
      violations.push(`undocumented query param ${key} on ${url.pathname}`);
  }
  if (request.headers.get("authorization") !== `Bearer ${TEST_TOKEN}`) {
    violations.push(`missing or wrong Authorization header on ${url.pathname}`);
  }
  recorded.push({ method: request.method, path: url.pathname, query, headers: request.headers });
});

/** Installs the mock API for a test file. Every test fails on an undocumented request. */
export function useMockApi(): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    server.resetHandlers();
    recorded.length = 0;
    const found = violations.splice(0);
    expect(found, "requests the API reference doesn't describe").toEqual([]);
  });
  afterAll(() => {
    server.close();
  });
}

/** Answers the fixture's request with its documented response, after checking query and body match. */
export function serveFixture(name: FixtureName): void {
  const f = fixture(name);
  const method = f.request.method.toLowerCase() as "get" | "post" | "put";
  server.use(
    http[method](`${BASE_URL}${f.request.path}`, async ({ request }) => {
      const url = new URL(request.url);
      expect(Object.fromEntries(url.searchParams), `${name}: query`).toEqual(f.request.query);
      const text = await request.text();
      expect(text === "" ? undefined : JSON.parse(text), `${name}: body`).toEqual(f.request.body);
      return HttpResponse.json(f.response.body as JsonBodyType, { status: f.response.status });
    }),
  );
}

/** Answers `method path` with each body in turn (the last one repeats). */
export function serveSequence(method: "get" | "post", path: string, bodies: JsonBodyType[]): void {
  let i = 0;
  server.use(
    http[method](`${BASE_URL}${path}`, () =>
      HttpResponse.json(bodies[Math.min(i++, bodies.length - 1)] ?? null),
    ),
  );
}
