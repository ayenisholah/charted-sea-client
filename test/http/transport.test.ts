import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../src/config.js";
import { decodeAs, decodeTasks } from "../../src/decode.js";
import {
  AbortError,
  AuthError,
  ChartedSeaError,
  NetworkError,
  RateLimitError,
  ResponseError,
  ServerError,
  TimeoutError,
  ValidationError,
} from "../../src/errors.js";
import { createTransport, type RequestSpec } from "../../src/http/transport.js";
import { sleep as realSleep } from "../../src/timers.js";
import { fakeFetch, hang, json, type Reply } from "../support/fake-fetch.js";

const TOKEN = "cs_sentinel_9f8e7d6c5b4a";
const config: ResolvedConfig = {
  token: TOKEN,
  baseUrl: "https://api.test",
  timeoutMs: 1_000,
  retry: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000 },
  userAgent: "charted-sea-client/test",
};
const GET: RequestSpec = { method: "GET", path: "/scraping-tasks/shopee", idempotent: true };
const RUN: RequestSpec = {
  method: "POST",
  path: "/scraping-tasks/shopee/run",
  idempotent: false,
  body: { requests: [] },
};
const identity = (raw: unknown) => raw;

function setup(replies: Reply[], overrides: Partial<ResolvedConfig> = {}) {
  const fetch = fakeFetch(...replies);
  const sleep = vi.fn(async () => {});
  const logger = { debug: vi.fn() };
  const transport = createTransport({
    config: { ...config, ...overrides },
    fetch,
    sleep,
    random: () => 0.5,
    now: () => 0,
    logger,
  });
  return { fetch, sleep, logger, transport };
}

async function failure(promise: Promise<unknown>): Promise<ChartedSeaError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ChartedSeaError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
}

describe("transport", () => {
  it("FR-1: builds the URL, query, headers and JSON body", async () => {
    const { fetch, transport } = setup([json([])]);
    await transport.request(
      {
        ...RUN,
        query: {
          waitForCompletion: false,
          includeFields: ["uuid", "url"],
          minPendingAt: new Date("2026-07-01T00:00:00Z"),
          limit: 5,
          skip: undefined,
        },
      },
      identity,
    );
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.test/scraping-tasks/shopee/run?waitForCompletion=false&includeFields=uuid%2Curl&minPendingAt=2026-07-01T00%3A00%3A00.000Z&limit=5",
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"requests":[]}');
    expect(init?.headers).toEqual({
      authorization: `Bearer ${TOKEN}`,
      accept: "application/json",
      "user-agent": "charted-sea-client/test",
      "content-type": "application/json",
    });
  });

  it("sends GETs without a body or query string and decodes the response", async () => {
    const { fetch, transport, logger } = setup([json([{ url: "u", status: "SUCCESS" }])]);
    const tasks = await transport.request(GET, decodeAs(decodeTasks, "GET /x"));
    expect(tasks).toEqual([{ url: "u", status: "SUCCESS", responseBody: null }]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.test/scraping-tasks/shopee");
    expect(init?.body).toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith("charted-sea request", {
      endpoint: "GET /scraping-tasks/shopee",
      status: 200,
      durationMs: 0,
    });
  });

  it.each([
    [401, AuthError],
    [403, AuthError],
    [400, ValidationError],
    [422, ValidationError],
    [404, ResponseError],
    [501, ServerError],
  ])("maps HTTP %i to %o without retrying", async (status, type) => {
    const { fetch, transport } = setup([
      json({ message: "nope" }, status, { "x-request-id": "req-1" }),
    ]);
    const error = await failure(transport.request(GET, identity));
    expect(error).toBeInstanceOf(type);
    expect(error).toMatchObject({
      status,
      endpoint: "GET /scraping-tasks/shopee",
      requestId: "req-1",
      details: { message: "nope" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a non-JSON error body in the message only", async () => {
    const { transport } = setup([new Response("upstream down", { status: 400 })]);
    const error = await failure(transport.request(GET, identity));
    expect(error.message).toBe("GET /scraping-tasks/shopee failed with HTTP 400: upstream down");
    expect(error.details).toBeUndefined();
    const empty = await failure(
      setup([new Response("", { status: 400 })]).transport.request(GET, identity),
    );
    expect(empty.message).toBe("GET /scraping-tasks/shopee failed with HTTP 400");
  });

  it("rejects a 2xx body that isn't JSON", async () => {
    for (const body of ["<html>", ""]) {
      const error = await failure(
        setup([new Response(body, { status: 200 })]).transport.request(GET, identity),
      );
      expect(error).toBeInstanceOf(ResponseError);
    }
  });

  it("NFR-3: retries idempotent calls on 5xx with backoff, up to maxAttempts", async () => {
    const { fetch, sleep, transport, logger } = setup([
      json({}, 503),
      json({}, 502),
      json({}, 500),
    ]);
    const error = await failure(transport.request(GET, identity));
    expect(error).toBeInstanceOf(ServerError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c: unknown[]) => c[0])).toEqual([50, 100]);
    expect(logger.debug).toHaveBeenCalledWith(
      "charted-sea retry",
      expect.objectContaining({ attempt: 1, delayMs: 50 }),
    );
  });

  it("NFR-3: retries 408 and network errors, then succeeds", async () => {
    const { fetch, transport } = setup([
      json({}, 408),
      new TypeError("fetch failed"),
      json(["ok"]),
    ]);
    await expect(transport.request(GET, identity)).resolves.toEqual(["ok"]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("NFR-3: honours Retry-After on 429, but gives up when it exceeds maxDelayMs", async () => {
    const ok = setup([json({}, 429, { "retry-after": "1" }), json([])]);
    await ok.transport.request(GET, identity);
    expect(ok.sleep).toHaveBeenCalledWith(1_000, undefined);

    const slow = setup([json({}, 429, { "retry-after": "60" })]);
    const error = await failure(slow.transport.request(GET, identity));
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(60_000);
    expect(slow.fetch).toHaveBeenCalledTimes(1);

    const noHeader = setup([json({}, 429), json([])]);
    await noHeader.transport.request(GET, identity);
    expect(noHeader.sleep).toHaveBeenCalledWith(50, undefined);
  });

  it("NFR-2: never retries a non-idempotent call, and flags it as maybe submitted", async () => {
    const { fetch, transport } = setup([new TypeError("socket hang up"), json([])]);
    const error = await failure(transport.request(RUN, identity));
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).maybeSubmitted).toBe(true);
    expect(error.cause).toEqual({ name: "TypeError", message: "socket hang up" });
    expect(fetch).toHaveBeenCalledTimes(1);

    const server = setup([json({}, 503), json([])]);
    await expect(server.transport.request(RUN, identity)).rejects.toBeInstanceOf(ServerError);
    expect(server.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a network error that isn't an Error", async () => {
    const { transport } = setup([() => Promise.reject("weird")], {
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    const error = await failure(transport.request(GET, identity));
    expect(error.message).toBe("GET /scraping-tasks/shopee failed: network error");
    expect((error as NetworkError).maybeSubmitted).toBe(false);
  });

  it("times out with TimeoutError, using the per-request timeout", async () => {
    const { transport } = setup([hang], {
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    const error = await failure(transport.request({ ...RUN, timeoutMs: 5 }, identity));
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toBe("POST /scraping-tasks/shopee/run timed out after 5 ms");
    expect((error as TimeoutError).maybeSubmitted).toBe(true);
  });

  it("aborts before sending, while in flight, and during a retry wait", async () => {
    const before = setup([json([])]);
    await expect(
      before.transport.request({ ...GET, signal: AbortSignal.abort() }, identity),
    ).rejects.toBeInstanceOf(AbortError);
    expect(before.fetch).not.toHaveBeenCalled();

    const during = setup([hang]);
    const controller = new AbortController();
    const p = during.transport.request({ ...GET, signal: controller.signal }, identity);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(during.fetch).toHaveBeenCalledTimes(1);

    const retrying = createTransport({
      config,
      fetch: fakeFetch(json({}, 503)),
      sleep: realSleep,
      random: () => 0.5,
      now: () => 0,
    });
    const c2 = new AbortController();
    const p2 = retrying.request({ ...GET, signal: c2.signal }, identity);
    setTimeout(() => {
      c2.abort();
    }, 10);
    await expect(p2).rejects.toBeInstanceOf(AbortError);
  });

  it("NFR-1 property: the token never appears in any error, cause, details or log", async () => {
    const echo = (status: number) =>
      json({ error: `bad token ${TOKEN}`, auth: `Bearer ${TOKEN}` }, status);
    const replies: Reply[][] = [
      [echo(400)],
      [echo(401)],
      [echo(429)],
      [echo(500)],
      [echo(404)],
      [new Response(`raw ${TOKEN}`, { status: 502 })],
      [new TypeError(`connect failed for Bearer ${TOKEN}`)],
      [new TypeError(`proxy http://user:${TOKEN}@host failed`)],
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...replies), fc.boolean(), async (reply, idempotent) => {
        const { transport, logger } = setup(reply, {
          retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
        });
        const error = await failure(transport.request({ ...GET, idempotent }, identity));
        const surfaces: (string | undefined)[] = [
          error.message,
          String(error),
          JSON.stringify(error),
          JSON.stringify(error.cause),
          JSON.stringify(error.details),
          JSON.stringify(logger.debug.mock.calls),
        ];
        for (const text of surfaces) expect(String(text)).not.toContain(TOKEN);
      }),
    );
  });
});
