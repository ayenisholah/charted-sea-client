# Test strategy

Decision record: [ADR 0002](adr/0002-zero-runtime-dependencies.md) covers why tests inject `fetch` instead of patching globals.

## Levels

| Level | Scope | Tooling | Runs |
|---|---|---|---|
| Unit | Pure modules: retry, redact, status, batch, config, proxy-url parser | Vitest | every PR |
| Property | Backoff bounds, batch/merge invariants, parser round-trips, redaction | fast-check | every PR |
| Contract | Each resource method against a mock API built from the documented examples | Vitest + MSW (`msw/node`) | every PR |
| Polling | `waitForResults` state machine: progress, timeout, abort, unknown status, missing UUIDs | Vitest fake timers + fake reader | every PR |
| Package | Built output imports correctly as ESM and CJS; types resolve | publint, `@arethetypeswrong/cli`, a smoke script per format | every PR |
| Mutation | Do the tests catch planted bugs? | Stryker | weekly, report only (M2) |
| Live smoke | One real `run` + `waitForResults` with `cacheMaxAgeInSec=86400`, plus a health query | Vitest, `*.live.test.ts` | manual dispatch only |

## Fixtures

`test/fixtures/api-reference/` holds the request and response examples from the Charted Sea docs as JSON, with the doc section in each file's `$source`. The mock server answers from these, so a contract test fails if the client builds a request the docs don't describe. The same fixture set is copied into [charted-sea-rs](../../charted-sea-rs/docs/TEST_STRATEGY.md), and a CI check compares hashes so the two clients can't drift.

## Property tests (examples)

- For any `attempt`, `baseDelayMs ≤ maxDelayMs`: `0 ≤ delay ≤ maxDelayMs`, and the cap holds with `Retry-After`.
- For any UUID list and batch size: the batches' union equals the input, with no duplicates, and the merge restores input order.
- For any token string: no error produced by the transport contains it, even when the server echoes it back.
- For generated valid placeholder templates: `check` accepts them; a single-character mutation inside `${…}` is either accepted or reported at the right offset.

## Coverage policy

`npm run test:coverage` requires 100% lines, branches, functions and statements per file for `src/`. `src/index.ts` (re-exports only) is the one exclusion. Coverage shows code ran; reviews still check assertions are meaningful, and Stryker reports where they aren't.

## Live smoke test rules

- Needs `CHARTED_SEA_TOKEN`; skipped otherwise, and never part of `npm test`.
- One cached request so repeated runs cost nothing after the first.
- Runs only from `.github/workflows/live-smoke.yml` via `workflow_dispatch` on `main`.
