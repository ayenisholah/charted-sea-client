---
"charted-sea-client": minor
---

Add `tasks.iterate`, `health.sessionMetrics`/`taskMetrics` (checked locally: 7-day range, granularity, non-empty lists), `proxies.validate`/`read`/`update`, and `proxyUrl.check`/`checkProxyUrl` for `${rand(...)}`/`${country(...)}` templates. Fix: `read` and `waitForResults` now accept the `{ items, total, pageRequest }` page the live API returns.
