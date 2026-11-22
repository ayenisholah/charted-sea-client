# Requirements

Each requirement has a test. The ID goes in the test name, so `grep FR-3` finds it.

## Functional

- **FR-1** Every endpoint in the [spec](SPEC.md) has a typed method whose request matches the API reference: path, query parameters and body.
- **FR-2** `tasks.run` uses `waitForCompletion=false` unless the caller passes `wait: true`.
- **FR-3** `waitForResults` returns one task per input UUID, in input order, once every task is terminal.
- **FR-4** `waitForResults` stops at `maxWaitMs` with `WaitTimeoutError` carrying partial results, and stops immediately on `AbortSignal`.
- **FR-5** UUID lists longer than the batch size are split, and every UUID is requested exactly once per poll.
- **FR-6** `tasks.iterate` yields every task across pages, and never the same task twice (with a fixed `maxPendingAt` the set is stable).
- **FR-7** Health queries reject ranges over 7 days and unknown granularities before any request.
- **FR-8** `proxyUrl.check` accepts every example URL in the API reference and reports position and reason for malformed placeholders.
- **FR-9** Scraper-specific parameters (`productSearch_*`) pass through to the run body unchanged.

## Non-functional

- **NFR-1 Secrets.** The token and proxy credentials never appear in error messages, `cause`, logs or `toJSON()` output. Tested by fuzzing error paths with a sentinel token.
- **NFR-2 No double submission.** `run`, `runSingle`, `cancel` and `proxies.update` are never retried automatically.
- **NFR-3 Bounded retries.** Idempotent calls retry at most `maxAttempts` times, never wait longer than `maxDelayMs` per attempt, and respect `Retry-After`.
- **NFR-4 Zero runtime dependencies.** `dependencies` in `package.json` is empty (checked in CI).
- **NFR-5 Size.** Minified + gzipped ESM bundle ≤ 8 KB (size-limit).
- **NFR-6 Compatibility.** Tests pass on Node 20, 22 and 24. Package types resolve correctly for ESM, CJS and bundlers (`@arethetypeswrong/cli`).
- **NFR-7 Forward compatibility.** Unknown statuses and fields never cause a throw.
- **NFR-8 Quality.** 100% line, branch, function and statement coverage per file.
