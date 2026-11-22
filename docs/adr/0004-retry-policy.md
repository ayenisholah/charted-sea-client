# 0004: Retry only idempotent calls

**Status:** Accepted

## Context

Successful tasks are billed. If a `run` request reaches the server but the response is lost, retrying it submits the tasks again and may bill twice. Reads, counts and health queries are safe to repeat.

## Decision

Automatic retries (exponential backoff, full jitter, `Retry-After` honoured, at most `maxAttempts`) apply only to GET requests and `proxies.validate`. `run`, `runSingle`, `cancel` and `proxies.update` are never retried; a network error surfaces as `NetworkError` with `maybeSubmitted: true` for `run`.

## Consequences

- Callers decide how to recover from an ambiguous `run` failure. The docs suggest re-running with `cacheMaxAgeInSec`, which returns cached results without billing.
- If Charted Sea adds an idempotency key, this ADR is superseded and `run` becomes retryable.
