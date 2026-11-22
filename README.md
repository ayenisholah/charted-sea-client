# charted-sea-client

Typed TypeScript client for the [Charted Sea](https://chartedsea.com) scraping API. Submit scraping tasks for Shopee and Lazada, wait for the results, check platform health, and validate proxies. Works in Node, Bun, Deno, or any runtime with `fetch`.

[![CI](https://github.com/ayenisholah/charted-sea-client/actions/workflows/ci.yml/badge.svg)](https://github.com/ayenisholah/charted-sea-client/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/charted-sea-client)](https://www.npmjs.com/package/charted-sea-client) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ayenisholah/charted-sea-client/badge)](https://scorecard.dev/viewer/?uri=github.com/ayenisholah/charted-sea-client)

> **Unofficial.** Not affiliated with or endorsed by Charted Sea.
> **Status: 0.x.** Every documented endpoint has a typed method, tested against the API reference and the live API. Before 1.0, minor versions may change the API; see the [changelog](CHANGELOG.md).

## What it solves

Charted Sea scrapes marketplace pages for you: you send URLs, it returns the raw responses. A production integration has to get several things right, and each one costs time or money when it goes wrong:

- **Long runs.** The API can hold a connection open until tasks finish, but a dropped connection cancels the tasks. Charted Sea recommends submitting asynchronously and polling instead. This client does that by default.
- **Polling.** Checking every task in a tight loop wastes requests. `waitForResults` backs off with jitter, speeds up again when tasks finish, and stops at a deadline or on an `AbortSignal`.
- **Batches.** A read can carry about 100 task IDs at most. The client splits bigger lists and returns results in the order you asked for.
- **Paying twice.** Successful tasks are billed. If the network fails while a `run` is being sent, retrying could submit the same tasks again. The client never retries `run`, `runSingle`, `cancel` or `proxies.update`; it tells you the request *may have been submitted*, so you can re-run with `cacheMaxAgeInSec` and get the cached result for free.
- **Failures that aren't errors.** In a batch of 100, a few blocked pages are normal. Task outcomes (`BLOCKED_TOO_MANY_TIMES`, `ERROR_TOO_MANY_TIMES`, `CANCELLED`) come back as data in `task.status`. Only faults (bad token, server down, timeout) throw.
- **Leaked secrets.** The API token and credentials inside proxy URLs never appear in error messages, `cause`, `toJSON()` or logs.
- **API drift.** Unknown statuses and fields don't throw; they're kept. The live API's read response already differs from the docs, and the client accepts both shapes.

## Install

```sh
npm install charted-sea-client
```

- Node 22 or newer (or Bun or Deno). ESM and CommonJS. Full TypeScript types.
- **Zero runtime dependencies.** Published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), so every version links to the commit and workflow that built it.

You need an API token: log in to the [Charted Sea console](https://console.chartedsea.com), then choose **Get API Token → Generate Token**. Tokens are valid for 365 days.

```sh
export CHARTED_SEA_TOKEN=...
```

## Usage

### Submit tasks and wait for the results

```ts
import { createClient } from "charted-sea-client";

const cs = createClient(); // reads CHARTED_SEA_TOKEN

const submitted = await cs.tasks.run(
  "shopee",
  [{ url: "https://shopee.sg/api/v4/search/search_items?keyword=tshirt" }],
  { cacheMaxAgeInSec: 3600 }, // a cached result up to an hour old is free
);

const results = await cs.tasks.waitForResults(
  "shopee",
  submitted.flatMap((t) => (t.uuid ? [t.uuid] : [])),
  { maxWaitMs: 10 * 60_000, onProgress: (p) => console.log(`${p.done}/${p.total}`) },
);

for (const task of results) {
  if (task.status === "SUCCESS") console.log(task.url, task.responseBody?.length);
  else console.warn(task.url, task.status, task.errorMessage);
}
```

`waitForResults` returns one task per UUID, in the order you passed them, once every task has finished. `responseBody` is the platform's raw JSON or HTML as a string; parse it however you like.

### Check platform health before a big batch

Shopee and Lazada sometimes block scrapers. Health metrics show recent success rates across all Charted Sea customers, so you can wait out a block instead of paying for failed tasks:

```ts
const health = await cs.health.taskMetrics({
  startAtIncl: "LAST_1H",
  granularity: "TOTAL",
  scrapers: ["SHOPEE"],
  countries: ["SG", "ID"],
  knownApis: ["PRODUCT_SEARCH"],
});
for (const m of health.periods.flatMap((p) => p.metrics)) {
  console.log(m.country, m.knownApi, m.successRate, m.confidence);
}
```

### Read, page, count and cancel

```ts
const tasks = await cs.tasks.read("shopee", { uuids }); // batched past 100 UUIDs
for await (const task of cs.tasks.iterate("shopee", { minPendingAt: "2026-07-01T00:00:00Z" })) {
  /* every task, page by page */
}
const counts = await cs.tasks.count("shopee", { statuses: ["PENDING", "RUNNING"] });
await cs.tasks.cancel("shopee", { uuids }); // or { countries: ["ID"] }; an empty request is refused
```

### POST requests and scraper parameters

```ts
await cs.tasks.run(
  "shopee",
  [{ url: "https://shopee.sg/api/v4/microsite/batch_get_item_card", method: "POST", payload: { shop_item_ids: [] } }],
);
await cs.tasks.run("shopee", [{ url: searchUrl }], {
  scraperParams: { productSearch_crawlNextPages: true, productSearch_crawlNextPages_maxPages: 3 },
});
```

### Proxies

```ts
// Check a template locally, with no network call.
const check = cs.proxyUrl.check("socks5://user:pass@gw.example.com:${rand(range=[10000,19999])}");
if (!check.ok) console.error(`offset ${check.offset}: ${check.reason}`);

const [result] = await cs.proxies.validate([url]); // uses a little proxy traffic
const configs = await cs.proxies.read();
await cs.proxies.update(configs); // replaces the whole configuration; never retried
```

### Configuration

```ts
const cs = createClient({
  token: process.env.CHARTED_SEA_TOKEN, // default: CHARTED_SEA_TOKEN
  timeoutMs: 30_000,                    // per request; synchronous runs get autoCancelAfterSec + 30 s
  retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10_000 }, // idempotent calls only
  userAgent: "my-app/1.0",
  fetch: customFetch,                   // e.g. for a proxy agent or tests
  logger: { debug: (msg, meta) => console.debug(msg, meta) }, // meta is already redacted
});
```

| Default | Value |
|---|---|
| Run mode | asynchronous (`waitForCompletion=false`); pass `wait: true` for synchronous |
| Request timeout | 30 s |
| Retries (reads, counts, health, proxy validation) | 3 attempts, full-jitter backoff from 500 ms, capped at 10 s, `Retry-After` honoured |
| Polling | 2 s, growing to 15 s while nothing finishes, for at most 10 min |

### Errors

Faults throw a `ChartedSeaError` subclass. Task outcomes never throw.

```ts
import { AuthError, NetworkError, RateLimitError, WaitTimeoutError } from "charted-sea-client";

try {
  await cs.tasks.run("shopee", requests);
} catch (e) {
  if (e instanceof AuthError) console.error("check CHARTED_SEA_TOKEN");
  else if (e instanceof RateLimitError) console.error(`retry in ${e.retryAfterMs} ms`);
  else if (e instanceof NetworkError && e.maybeSubmitted) {
    // The tasks may exist. Re-run with cacheMaxAgeInSec to get them without paying twice.
  } else throw e;
}
```

| Error | When |
|---|---|
| `ConfigError` | missing token or an invalid option (thrown by `createClient`) |
| `AuthError` | 401 / 403 |
| `ValidationError` | 400 / 422, or a local check failed (e.g. a health range over 7 days) |
| `RateLimitError` | 429, with `retryAfterMs` |
| `ServerError` | 5xx |
| `ResponseError` | another status, or a body that isn't the documented JSON |
| `NetworkError`, `TimeoutError` | transport failures, with `maybeSubmitted` |
| `AbortError` | your `AbortSignal` fired |
| `WaitTimeoutError`, `TaskNotFoundError` | from `waitForResults`, with `partial` results |

## Examples

[`examples/`](examples/) has runnable scripts: search pages to CSV, a health-gated batch, and cancel-by-country with a dry run.

```sh
git clone https://github.com/ayenisholah/charted-sea-client && cd charted-sea-client && npm install
CHARTED_SEA_TOKEN=... npm run example -- examples/health-gated-batch.ts
```

## How it's tested

- **171 tests at 100% coverage per file**, gated in CI on Node 22 and 24.
- Every request is checked against the examples in Charted Sea's API reference, using a mock server that fails on anything the docs don't describe.
- Property tests cover backoff, batching, redaction and the proxy URL parser. Mutation testing runs weekly.
- A live smoke test against the real API runs by hand.

## Documentation

| Doc | What's in it |
|---|---|
| [API reference](https://ayenisholah.github.io/charted-sea-client/) | TypeDoc for every export, built from `main` |
| [Spec](docs/SPEC.md) | Endpoint mapping, task statuses, polling, errors, live-API findings |
| [Architecture](docs/ARCHITECTURE.md) | Modules, dependency rules, request flow |
| [Requirements](docs/REQUIREMENTS.md) | Numbered requirements; each one has a test with its ID in the name |
| [Test strategy](docs/TEST_STRATEGY.md) | Unit, property, contract, polling, package and live tests |
| [CI/CD](docs/CI_CD.md) and [release process](docs/RELEASE_PROCESS.md) | Workflows, gates, and how a release reaches npm |
| [Roadmap](docs/ROADMAP.md) and [ADRs](docs/adr/) | What's next; recorded decisions |
| [Contributing](CONTRIBUTING.md) and [security](SECURITY.md) | How to work on it, how to report a vulnerability |

## Related

- [charted-sea-mcp](https://github.com/ayenisholah/charted-sea-mcp): an MCP server built on this client, so AI agents can check platform health and run scraping tasks.
- [charted-sea-rs](https://github.com/ayenisholah/charted-sea-rs): the same client in Rust, tested against the same fixtures.

## Licence

[MIT](LICENSE)
