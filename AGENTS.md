# charted-sea-client agent instructions

Unofficial TypeScript client for the Charted Sea scraping API. Zero runtime dependencies, Node 22+. Read the linked docs before changing what they cover.

## Commands

```sh
npm run check          # every gate; run before opening a PR
npm run test:coverage  # tests with the 100% per-file gate
npm run test:live      # live smoke test; needs CHARTED_SEA_TOKEN; never in PR CI
```

## Repo map

| Path | What it is |
|---|---|
| `src/http` | transport, retry, redaction |
| `src/resources` | one module per API area: tasks, health, proxies |
| `src/polling` | waitForResults, status table, UUID batching |
| `src/proxy-url` | placeholder parser |
| `test/fixtures/api-reference` | examples copied from the Charted Sea docs; shared with charted-sea-rs |
| `docs/` | spec, architecture, requirements, tests, CI/CD, release, ADRs |

## Rules: never weaken these

- Behaviour follows [docs/SPEC.md](docs/SPEC.md), which follows the API reference. Don't guess undocumented behaviour; add it to the open questions.
- Never auto-retry `run`, `runSingle`, `cancel` or `proxies.update` ([ADR 0004](docs/adr/0004-retry-policy.md)).
- Tokens and proxy credentials never reach errors, logs or snapshots. Use `src/http/redact.ts`.
- No runtime dependencies ([ADR 0002](docs/adr/0002-zero-runtime-dependencies.md)).
- Write the failing test first. Coverage stays at 100% per file with no new exclusions.
- No real tokens, proxy credentials or scraped customer data in fixtures. Fixtures come from the public docs.
- Docs state what's true now. Mark anything unbuilt as planned.
