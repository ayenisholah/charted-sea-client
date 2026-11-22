import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  isRetryableStatus,
  parseRetryAfter,
  pollDelay,
} from "../../src/http/retry.js";

const policy = fc
  .tuple(
    fc.integer({ min: 1, max: 10 }),
    fc.integer({ min: 0, max: 5_000 }),
    fc.integer({ min: 0, max: 60_000 }),
  )
  .filter(([, base, max]) => base <= max)
  .map(([maxAttempts, baseDelayMs, maxDelayMs]) => ({ maxAttempts, baseDelayMs, maxDelayMs }));
const unit = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

describe("retry", () => {
  it("NFR-3 property: 0 ≤ backoff ≤ maxDelayMs for any attempt", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), policy, unit, (attempt, p, r) => {
        const d = backoffDelay(attempt, p, () => r);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(p.maxDelayMs);
      }),
    );
  });

  it("grows exponentially before the cap", () => {
    const p = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 10_000 };
    const almostOne = () => 0.999999;
    expect([1, 2, 3].map((n) => backoffDelay(n, p, almostOne))).toEqual([99, 199, 399]);
  });

  it("property: poll delay stays within [min, max]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 1, max: 5_000 }),
        fc.integer({ min: 0, max: 60_000 }),
        unit,
        (step, min, extra, r) => {
          const d = pollDelay(step, min, min + extra, () => r);
          expect(d).toBeGreaterThanOrEqual(min);
          expect(d).toBeLessThanOrEqual(min + extra);
        },
      ),
    );
    expect(pollDelay(0, 2_000, 15_000, () => 0.5)).toBe(2_000);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter(" 3 ", now)).toBe(3_000);
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5_000);
    expect(parseRetryAfter("Wed, 31 Dec 2025 00:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon", now)).toBeUndefined();
  });

  it("retries only transient statuses", () => {
    expect([408, 425, 429, 500, 502, 503, 504].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 403, 404, 422, 501].some(isRetryableStatus)).toBe(false);
  });
});
