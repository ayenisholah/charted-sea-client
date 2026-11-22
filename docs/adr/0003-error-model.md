# 0003: Throw for faults, return task outcomes as data

**Status:** Accepted

## Context

There are two kinds of failure. Transport and API faults (bad token, 5xx, timeout) mean the call itself failed. Task outcomes (`BLOCKED_TOO_MANY_TIMES`, `ERROR_TOO_MANY_TIMES`, `CANCELLED`) are normal results of a call that worked; in a batch of 100, a few blocked tasks are expected.

## Decision

Faults throw a `ChartedSeaError` subclass with `status`, `endpoint` and a redacted `cause`. Task outcomes are returned in `Task.status` and never throw. The API's `httpStatusOnError` option is not set by the client, so a partly failed batch still returns 200 with every result.

## Consequences

- Callers use `try/catch` for faults and a `switch` on status for outcomes, which matches how they handle them.
- `instanceof` checks work across ESM and CJS because errors are defined once and re-exported.
- Callers who want a throw on any failed task can write it in one line; the reverse would be harder.
