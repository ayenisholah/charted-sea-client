# charted-sea-client

## 0.2.0

### Minor Changes

- 8344de9: Add `tasks.iterate`, `health.sessionMetrics`/`taskMetrics` (checked locally: 7-day range, granularity, non-empty lists), `proxies.validate`/`read`/`update`, and `proxyUrl.check`/`checkProxyUrl` for `${rand(...)}`/`${country(...)}` templates. Fix: `read` and `waitForResults` now accept the `{ items, total, pageRequest }` page the live API returns.

## 0.1.0

### Minor Changes

- 2d4a788: Add `createClient` with `tasks.run`, `runSingle`, `read`, `count`, `cancel` and `waitForResults`: asynchronous runs by default, polling with backoff, UUID batching, retries for idempotent calls only, typed errors and secret redaction.
