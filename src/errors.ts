import type { Task } from "./types.js";

/** Context attached to every {@link ChartedSeaError}. Messages and `cause` are already redacted. */
export interface ErrorContext {
  /** Endpoint that failed, e.g. `POST /scraping-tasks/shopee/run`. `client` for local errors. */
  endpoint?: string | undefined;
  /** HTTP status, when the server answered. */
  status?: number | undefined;
  /** Request id from the response headers, when present. */
  requestId?: string | undefined;
  /** Parsed error body (redacted), e.g. the `invalidUrls` list from a proxy update. */
  details?: unknown;
  /** Underlying error, reduced to its redacted `name` and `message`. */
  cause?: unknown;
}

/**
 * Base class for every fault the client throws. Task outcomes such as
 * `BLOCKED_TOO_MANY_TIMES` are never thrown; they come back in `Task.status`.
 */
export class ChartedSeaError extends Error {
  override name = "ChartedSeaError";
  readonly endpoint: string;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(message: string, context: ErrorContext = {}) {
    super(message, context.cause === undefined ? undefined : { cause: context.cause });
    this.endpoint = context.endpoint ?? "client";
    this.status = context.status;
    this.requestId = context.requestId;
    this.details = context.details;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      endpoint: this.endpoint,
      status: this.status,
      requestId: this.requestId,
      details: this.details,
    };
  }
}

/** Missing token or an invalid option. Thrown when the client is created. */
export class ConfigError extends ChartedSeaError {
  override name = "ConfigError";
}

/** The token was rejected (HTTP 401 or 403). */
export class AuthError extends ChartedSeaError {
  override name = "AuthError";
}

/** The request was rejected (HTTP 400/422), or a local check failed before sending. */
export class ValidationError extends ChartedSeaError {
  override name = "ValidationError";
}

/** HTTP 429. `retryAfterMs` comes from the `Retry-After` header when present. */
export class RateLimitError extends ChartedSeaError {
  override name = "RateLimitError";
  readonly retryAfterMs: number | undefined;

  constructor(message: string, context: ErrorContext & { retryAfterMs?: number | undefined }) {
    super(message, context);
    this.retryAfterMs = context.retryAfterMs;
  }
}

/** HTTP 5xx. */
export class ServerError extends ChartedSeaError {
  override name = "ServerError";
}

/** Any other unexpected HTTP status, or a body that isn't the documented shape. */
export class ResponseError extends ChartedSeaError {
  override name = "ResponseError";
}

/**
 * Base for transport failures where the outcome is unknown. For `run`, `runSingle`,
 * `cancel` and `proxies.update`, `maybeSubmitted` is true: the server may have acted on
 * the request. Re-run with `cacheMaxAgeInSec` to get cached results without paying twice.
 */
abstract class AmbiguousError extends ChartedSeaError {
  readonly maybeSubmitted: boolean;

  constructor(message: string, context: ErrorContext & { maybeSubmitted: boolean }) {
    super(message, context);
    this.maybeSubmitted = context.maybeSubmitted;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), maybeSubmitted: this.maybeSubmitted };
  }
}

/** The connection failed or was reset. */
export class NetworkError extends AmbiguousError {
  override name = "NetworkError";
}

/** The request exceeded `timeoutMs`. */
export class TimeoutError extends AmbiguousError {
  override name = "TimeoutError";
}

/** The caller's `AbortSignal` fired. */
export class AbortError extends ChartedSeaError {
  override name = "AbortError";
}

/** `waitForResults` reached `maxWaitMs`. `partial` holds the latest known state of each task, in input order. */
export class WaitTimeoutError extends ChartedSeaError {
  override name = "WaitTimeoutError";
  readonly partial: Task[];

  constructor(message: string, partial: Task[]) {
    super(message);
    this.partial = partial;
  }
}

/** Some UUIDs were missing from 3 consecutive reads. */
export class TaskNotFoundError extends ChartedSeaError {
  override name = "TaskNotFoundError";
  readonly uuids: string[];
  readonly partial: Task[];

  constructor(message: string, uuids: string[], partial: Task[]) {
    super(message);
    this.uuids = uuids;
    this.partial = partial;
  }
}
