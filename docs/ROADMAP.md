# Roadmap

Each milestone has a check that proves it's done. Estimates assume focused days.

## M0: Scaffold and CI (0.5 day) ✅ done

Repo, tooling (TypeScript strict, ESLint, Prettier, Vitest, tsup, knip, jscpd, dependency-cruiser, commitlint, changesets), all workflows, branch protection.

**Done when:** a trivial `redact` module with tests is merged through a PR, every CI job is green, and a planted violation (unused export, duplicate block, 99% coverage) fails the gate.

## M1: Core tasks (1.5 days) ✅ done, released as 0.1.0

`createClient`, transport, errors, redaction, retry policy, `tasks.run/runSingle/read/count/cancel`, `waitForResults`, UUID batching.

**Done when:** FR-1 to FR-5 and NFR-1 to NFR-4 have passing tests at 100% coverage, and the quick start in the README runs against the mock server in an example test. *Make the repo public and send Marc the link at this point.*

## M2: Full surface and docs (1 day) 🔧 in progress (0.2.0)

`tasks.iterate`, `health.*`, `proxies.*`, `proxyUrl.check`, TypeDoc site, `examples/` (search → CSV; check health before a batch; cancel by country), Stryker weekly job, first live smoke run.

**Done when:** every endpoint in the API reference has a method and a contract test, the docs site is live, and the live smoke workflow has passed once.

## M3: Release 0.1.0 (0.5 day)

**Done when:** the [release checklist](RELEASE_PROCESS.md#before-the-first-publish-010) is complete and `npm view charted-sea-client` shows 0.1.0 with provenance.

## Later

- Follow REPLACED tasks to their derived tasks (blocked on open question 4).
- Bun and Deno in the CI matrix.
- 1.0 once the API shape is confirmed.
