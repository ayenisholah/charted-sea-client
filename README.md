# charted-sea-client

Typed TypeScript client for the [Charted Sea](https://chartedsea.com) scraping API. Submit scraping tasks, wait for results with polling and backoff, read health metrics, and validate proxies, in Node, Bun, Deno or any runtime with `fetch`.

> **Unofficial.** Not affiliated with or endorsed by Charted Sea.
> **Status: planned.** This README describes the 0.1.0 target. See the [roadmap](docs/ROADMAP.md).

<!-- Badges go live at M0: CI · coverage · npm version · npm provenance · OpenSSF Scorecard · bundle size -->

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

Check platform health before a large batch:

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
| API reference | TypeDoc on GitHub Pages (planned, M2) |

## Related

- [charted-sea-mcp](../charted-sea-mcp/README.md): MCP server built on this client.
- [charted-sea-rs](../charted-sea-rs/README.md): the same client in Rust.

## Licence

[MIT](LICENSE)
