# charted-sea-client

Typed TypeScript client for the [Charted Sea](https://chartedsea.com) scraping API. Submit scraping tasks, wait for results with polling and backoff, read health metrics, and validate proxies, in Node, Bun, Deno or any runtime with `fetch`.

> **Unofficial.** Not affiliated with or endorsed by Charted Sea.
> **Status: 0.1.0.** The tasks API (run, read, count, cancel, waitForResults) is released. Health metrics, proxies and `tasks.iterate` are planned for 0.2.0; see the [roadmap](docs/ROADMAP.md).

[![CI](https://github.com/ayenisholah/charted-sea-client/actions/workflows/ci.yml/badge.svg)](https://github.com/ayenisholah/charted-sea-client/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/charted-sea-client)](https://www.npmjs.com/package/charted-sea-client) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ayenisholah/charted-sea-client/badge)](https://scorecard.dev/viewer/?uri=github.com/ayenisholah/charted-sea-client)

## Why

Charted Sea [recommends](https://chartedsea.com/docs/api-reference) asynchronous runs with polling for production, because a dropped connection in synchronous mode cancels in-flight tasks. This client makes that the default and handles the parts every integration otherwise rewrites: the task lifecycle, polling with backoff, batching UUID lookups, retries that never double-submit, typed errors and secret redaction.

## Install

```sh
npm install charted-sea-client
```

Zero runtime dependencies. Node 20+, ESM and CommonJS, full TypeScript types.

## Quick start

```ts
import { createClient } from "charted-sea-client";

const cs = createClient(); // reads CHARTED_SEA_TOKEN

const submitted = await cs.tasks.run("shopee", [
  { url: "https://shopee.sg/api/v4/search/search_items?keyword=tshirt" },
]);

const results = await cs.tasks.waitForResults(
  "shopee",
  submitted.map((t) => t.uuid),
  { maxWaitMs: 10 * 60_000 },
);

for (const task of results) {
  if (task.status === "SUCCESS") console.log(task.url, task.responseBody?.length);
  else console.warn(task.url, task.status, task.errorMessage);
}
```

Check platform health before a large batch (planned for 0.2.0):

```ts
const health = await cs.health.taskMetrics({
  startAtIncl: "LAST_1H",
  granularity: "TOTAL",
  scrapers: ["SHOPEE"],
  countries: ["SG", "ID"],
});
```

## Documentation

| Doc | What's in it |
|---|---|
| [Spec](docs/SPEC.md) | Public API, endpoint mapping, task statuses, errors, config |
| [Architecture](docs/ARCHITECTURE.md) | Modules, dependency rules, polling data flow |
| [Requirements](docs/REQUIREMENTS.md) | Numbered functional and non-functional requirements |
| [Test strategy](docs/TEST_STRATEGY.md) | Unit, contract, property and live smoke tests; coverage gate |
| [CI/CD](docs/CI_CD.md) | Workflows, gates, supply chain, publishing |
| [Release process](docs/RELEASE_PROCESS.md) | Versioning, changesets, provenance |
| [Roadmap](docs/ROADMAP.md) | Milestones with "done when" checks |
| [ADRs](docs/adr/) | Recorded decisions |
| [API reference](https://ayenisholah.github.io/charted-sea-client/) | TypeDoc, built from `main` |

## Related

- charted-sea-mcp (planned): MCP server built on this client.
- charted-sea-rs (planned): the same client in Rust.

## Licence

[MIT](LICENSE)
