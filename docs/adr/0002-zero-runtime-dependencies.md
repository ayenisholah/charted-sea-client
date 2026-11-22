# 0002: Zero runtime dependencies

**Status:** Accepted

## Context

An SDK's dependencies become every user's dependencies: install size, audit noise, version conflicts and supply-chain risk. Node 22+, Bun and Deno all ship `fetch`, `AbortController` and `URL`.

## Decision

No runtime dependencies. HTTP uses the global `fetch` (injectable). Response decoding uses small hand-written type guards instead of a schema library. CI fails if `dependencies` is non-empty.

## Consequences

- Decoders are written and tested by hand; they're lenient (keep unknown fields) so they rarely need changes.
- Tests inject `fetch` through MSW rather than patching globals.
- Node 18 and 20 are unsupported (both end of life; Node 18's `fetch` was experimental). Node 20 was dropped in 0.3.0.
