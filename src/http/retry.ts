/** Retry policy for idempotent calls (ADR 0004). */
export interface RetryPolicy {
  /** Total attempts including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  /** No single wait is longer than this. */
  maxDelayMs: number;
}

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Statuses worth retrying on an idempotent call. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * Full-jitter exponential backoff: a random wait in `[0, min(maxDelayMs, baseDelayMs · 2^(attempt-1))]`.
 * `attempt` counts failures so far (1 after the first failure).
 */
export function backoffDelay(attempt: number, policy: RetryPolicy, random: () => number): number {
  const exp = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const cap = Math.min(policy.maxDelayMs, exp);
  return Math.floor(random() * cap);
}

/**
 * Wait before the next poll: exponential growth from `minMs` to `maxMs`, full jitter above
 * the minimum. `step` is the number of polls in a row without progress (0 after progress).
 */
export function pollDelay(
  step: number,
  minMs: number,
  maxMs: number,
  random: () => number,
): number {
  const cap = Math.min(maxMs, minMs * 2 ** step);
  return Math.floor(minMs + random() * (cap - minMs));
}

/** Parses `Retry-After` (seconds or an HTTP date) into milliseconds from `nowMs`. */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}
