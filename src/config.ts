import { ConfigError } from "./errors.js";
import type { RetryPolicy } from "./http/retry.js";

/** Receives debug events. `meta` is already redacted. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
}

/** Options for {@link createClient}. */
export interface ClientOptions {
  /** API token. Default: `process.env.CHARTED_SEA_TOKEN`. */
  token?: string;
  /** Default: `https://continuous-scraper.common.chartedapi.com`. */
  baseUrl?: string;
  /** Custom `fetch`, e.g. for tests or a proxy agent. Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout. Default 30 s. Synchronous runs use `autoCancelAfterSec` + 30 s. */
  timeoutMs?: number;
  /** Retry policy for idempotent calls only. Default 3 attempts, 500 ms base, 10 s cap. */
  retry?: Partial<RetryPolicy>;
  /** Appended to the `charted-sea-client/<version>` user agent. */
  userAgent?: string;
  logger?: Logger;
}

export interface ResolvedConfig {
  token: string;
  baseUrl: string;
  timeoutMs: number;
  retry: RetryPolicy;
  userAgent: string;
}

export const DEFAULT_BASE_URL = "https://continuous-scraper.common.chartedapi.com";

function positiveInt(value: number | undefined, fallback: number, name: string, min = 1): number {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v < min) {
    throw new ConfigError(`${name} must be an integer ≥ ${String(min)}, got ${String(v)}`);
  }
  return v;
}

/** Resolves options against defaults and the environment. Pure: `env` is passed in. */
export function resolveConfig(
  options: ClientOptions,
  env: Readonly<Record<string, string | undefined>>,
  version: string,
): ResolvedConfig {
  const token = (options.token ?? env["CHARTED_SEA_TOKEN"] ?? "").trim();
  if (token === "") {
    throw new ConfigError(
      "No API token. Pass { token } or set CHARTED_SEA_TOKEN (Console → Get API Token).",
    );
  }

  const rawBase = options.baseUrl ?? DEFAULT_BASE_URL;
  let base: URL;
  try {
    base = new URL(rawBase);
  } catch {
    throw new ConfigError(`baseUrl is not a valid URL: ${rawBase}`);
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new ConfigError(`baseUrl must be http(s), got ${base.protocol}`);
  }

  const baseDelayMs = positiveInt(options.retry?.baseDelayMs, 500, "retry.baseDelayMs", 0);
  const maxDelayMs = positiveInt(options.retry?.maxDelayMs, 10_000, "retry.maxDelayMs", 0);
  if (baseDelayMs > maxDelayMs) {
    throw new ConfigError("retry.baseDelayMs must not exceed retry.maxDelayMs");
  }

  const suffix = options.userAgent?.trim();
  return {
    token,
    baseUrl: base.href.replace(/\/+$/, ""),
    timeoutMs: positiveInt(options.timeoutMs, 30_000, "timeoutMs"),
    retry: {
      maxAttempts: positiveInt(options.retry?.maxAttempts, 3, "retry.maxAttempts"),
      baseDelayMs,
      maxDelayMs,
    },
    userAgent: `charted-sea-client/${version}${suffix ? ` ${suffix}` : ""}`,
  };
}
