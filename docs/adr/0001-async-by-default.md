# 0001: Asynchronous runs by default

**Status:** Accepted

## Context

The API's run endpoints default to `waitForCompletion=true`, holding the HTTP connection open until tasks finish. The docs warn that a dropped connection cancels in-flight tasks, and recommend `waitForCompletion=false` with polling for production.

## Decision

`tasks.run` and `tasks.runSingle` send `waitForCompletion=false` unless the caller passes `wait: true`. `waitForResults` provides the polling. Synchronous mode stays available for scripts and quick checks, with the HTTP timeout set to `autoCancelAfterSec + 30s`.

## Consequences

- The client's default differs from the API's default. The README and method docs say so.
- Callers make two calls instead of one; `waitForResults` keeps that to one extra line.
- Restarted processes can resume waiting from stored UUIDs, which synchronous mode can't do.
- The async response shape is not documented (open question 1), so the `run` return type is provisional until confirmed.
