# Specification

Source of truth for behaviour: the [Charted Sea API reference](https://chartedsea.com/docs/api-reference), snapshot taken 2026-11-22 (`../../.api-reference-snapshot-2026-11-22.txt`). Where this spec and the API disagree, the API wins and this spec is updated in the same PR.

## Scope

**In scope (0.1.0):** every documented endpoint: run, run-single, read, count, cancel, both health metrics endpoints, proxy validate, read and update. Plus helpers the docs imply: polling until terminal, paging, UUID batching, a proxy-URL placeholder checker.

**Non-goals:** a CLI; a scraping framework; parsing Shopee/Lazada response bodies (they're returned as raw strings); browser bundles (it works in browsers with `fetch`, but CORS and token exposure make that the caller's call); caching (the API has `cacheMaxAgeInSec`).

## Configuration

```ts
createClient(options?: {
  token?: string;              // default: process.env.CHARTED_SEA_TOKEN; missing → ConfigError at creation
  baseUrl?: string;            // default: https://continuous-scraper.common.chartedapi.com
  fetch?: typeof fetch;        // injectable for tests and custom agents
  timeoutMs?: number;          // per HTTP request, default 30_000 (sync runs: autoCancelAfterSec + 30s)
  retry?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }; // idempotent calls only, default 3 / 500 / 10_000
  userAgent?: string;          // appended to "charted-sea-client/<version>"
  logger?: { debug(msg: string, meta?: object): void };                         // optional; meta is already redacted
}): ChartedSeaClient
```

## Public API and endpoint mapping

All paths are relative to `baseUrl` and send `Authorization: Bearer <token>`.

| Method | HTTP | Notes |
|---|---|---|
| `tasks.run(scraper, requests, opts?)` | `POST /scraping-tasks/{scraper}/run` | `waitForCompletion=false` by default ([ADR 0001](adr/0001-async-by-default.md)). `opts`: `wait`, `autoCancelAfterSec`, `includeAllFields`, `includeFields`, `cacheMaxAgeInSec`, `scraperParams` (e.g. `productSearch_crawlNextPages`). Never auto-retried ([ADR 0004](adr/0004-retry-policy.md)). |
| `tasks.runSingle(scraper, request, opts?)` | `POST /scraping-tasks/{scraper}/run-single` | Same options; body fields at top level. |
| `tasks.read(scraper, query)` | `GET /scraping-tasks/{scraper}` | `limit`, `offset`, `uuids`, `urls`, `minPendingAt`, `maxPendingAt`, field selection. `uuids` split into batches of 100 (open question 6) and merged in input order. |
| `tasks.iterate(scraper, query)` | `GET /scraping-tasks/{scraper}` (paged) | Async iterator; advances `offset` by `limit` until a short page. |
| `tasks.count(scraper, query?)` | `GET /scraping-tasks/{scraper}/count` | `statuses`, `minPendingAt` → `{ country, status, count }[]`. |
| `tasks.cancel(scraper, { uuids?, countries? })` | `POST /scraping-tasks/{scraper}/cancel` | Returns cancelled UUIDs (incl. sub-tasks) and countries. |
| `tasks.waitForResults(scraper, uuids, opts?)` | repeated `tasks.read` | See [polling](#polling). |
| `health.sessionMetrics(query)` | `GET /health/session-metrics` | `startAtIncl` (ISO or `LAST_1H`/`LAST_24H`/`LAST_72H`), `endAtExcl`, `granularity` (`TOTAL`/`HOUR`/`DAY`), `scrapers`, `countries`. Rejects ranges over 7 days locally. |
| `health.taskMetrics(query)` | `GET /health/scraping-task-metrics` | As above plus `knownApis`. |
| `proxies.validate(urls)` | `POST /proxy-validate` | Consumes a little proxy traffic; documented on the method. |
| `proxies.read()` | `GET /proxy-configs` | |
| `proxies.update(configs)` | `PUT /proxy-configs` | Replaces the whole configuration; all-or-nothing server side. |
| `proxyUrl.check(template)` | local | Parses `${rand(...)}` and `${country(...)}` placeholders and reports syntax errors before a network call. |

### Types

- `Scraper`: `"shopee" | "shopee-android" | "lazada" | (string & {})`. Known names autocomplete; unknown names pass through (open question 3).
- Health enums use the API's upper-case names: `SHOPEE`, `SHOPEE_ANDROID`, `LAZADA`; countries `SG ID TH MY PH VN BR MX CL CO AR TW`.
- `TaskRequest`: `{ url: string; method?: "GET" | "POST"; payload?: unknown }`.
- `Task`: `{ uuid?: string; url: string; method?; payload?; status: TaskStatus; responseBody: string | null; errorMessage?: string; [extra: string]: unknown }`. Unknown fields are kept, not stripped.

## Task statuses

| Status | Terminal? | Billed | Client behaviour |
|---|---|---|---|
| `PENDING`, `RUNNING` | no | — | keep polling |
| `BLOCKED`, `ERROR` | no | — | keep polling; the server retries up to 3 times |
| `SUCCESS` | yes | yes | return |
| `BLOCKED_TOO_MANY_TIMES`, `ERROR_TOO_MANY_TIMES` | yes | no | return (data, not an exception) |
| `CANCELLED` | yes | no | return |
| `REPLACED` | yes, for this task | — | return (check `status === "REPLACED"`); derived tasks not followed until open question 4 is answered |
| anything else | treated as non-terminal | — | keep polling, log once at debug (forward compatibility) |

## Polling

`waitForResults(scraper, uuids, { pollIntervalMs = 2_000, maxPollIntervalMs = 15_000, maxWaitMs = 600_000, signal, onProgress })`:

1. Read all non-terminal UUIDs (batched).
2. Move terminal tasks to the result set; call `onProgress({ done, total, byStatus })`.
3. Sleep with exponential backoff and full jitter between `pollIntervalMs` and `maxPollIntervalMs`; reset to the minimum when progress was made.
4. Stop when all are terminal, or throw `WaitTimeoutError` (carrying partial results) at `maxWaitMs`, or `AbortError` on `signal`.
5. Results come back in input order. Missing UUIDs after 3 consecutive reads raise `TaskNotFoundError`.

## Errors

Transport and API faults throw; task outcomes never do ([ADR 0003](adr/0003-error-model.md)).

| Class | When |
|---|---|
| `ConfigError` | missing token, invalid option |
| `AuthError` | 401 / 403 |
| `ValidationError` | 400 / 422, or a local check fails (e.g. 8-day health range) |
| `RateLimitError` | 429; exposes `retryAfterMs` |
| `ServerError` | 5xx |
| `ResponseError` | any other unexpected status, or a body that isn't JSON or isn't the documented shape |
| `NetworkError`, `TimeoutError`, `AbortError` | transport; `NetworkError` and `TimeoutError` carry `maybeSubmitted` (true for `run`, `runSingle`, `cancel`, `proxies.update`) |
| `WaitTimeoutError`, `TaskNotFoundError` | polling |

All extend `ChartedSeaError` with `status?`, `requestId?`, `endpoint`, `details?` (the parsed, redacted error body) and a redacted `cause`. Messages never contain the token or proxy credentials.

### Local checks and edge cases (decided during M1)

- `run` rejects an empty `requests` array; `cancel` rejects a call with neither `uuids` nor `countries` (so a typo can't cancel everything); `scraperParams` may not set `requests`, `cacheMaxAgeInSec`, `url`, `method` or `payload`. All throw `ValidationError` before any request.
- `read` with `uuids` sets `limit` to the batch size unless the caller passes one (the API's default of 20 would silently truncate). With more than 100 UUIDs, `limit`/`offset` are rejected. Duplicate UUIDs are requested once.
- Reads by UUID only find tasks inside the API's default `minPendingAt` window (7 days); pass `minPendingAt` for older tasks.
- A `Retry-After` longer than `retry.maxDelayMs` is not waited out: the `RateLimitError` is thrown with `retryAfterMs` so the caller decides.
- Retried statuses: 408, 425, 429, 500, 502, 503, 504 (idempotent calls only).

## Open questions

Tracked in the [project index](../../README.md#open-questions-for-charted-sea). The ones that change code here: 1 (async response shape: the `run` return type is provisional), 3 (scraper names), 4 (REPLACED), 5 (error bodies, 429), 6 (batch size).
