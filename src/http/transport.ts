import type { Logger, ResolvedConfig } from "../config.js";
import type { Decoder } from "../decode.js";
import {
  AbortError,
  AuthError,
  type ChartedSeaError,
  NetworkError,
  RateLimitError,
  ResponseError,
  ServerError,
  TimeoutError,
  ValidationError,
} from "../errors.js";
import type { Sleep } from "../timers.js";
import { redact } from "./redact.js";
import { backoffDelay, isRetryableStatus, parseRetryAfter } from "./retry.js";

export type QueryValue = string | number | boolean | readonly string[] | Date | undefined;

export interface RequestSpec {
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Readonly<Record<string, QueryValue>>;
  body?: unknown;
  /** Only idempotent requests are retried (ADR 0004). */
  idempotent: boolean;
  timeoutMs?: number;
  signal?: AbortSignal | undefined;
}

/** What resources depend on. Tests can supply a fake. */
export interface Transport {
  request<T>(spec: RequestSpec, decode: Decoder<T>): Promise<T>;
}

export interface TransportDeps {
  config: ResolvedConfig;
  fetch: typeof fetch;
  sleep: Sleep;
  random: () => number;
  now: () => number;
  logger?: Logger | undefined;
}

const MAX_MESSAGE_CHARS = 300;

function queryString(query: RequestSpec["query"]): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (value instanceof Date) params.set(key, value.toISOString());
    else if (Array.isArray(value)) params.set(key, value.join(","));
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s === "" ? "" : `?${s}`;
}

async function readBody(response: Response): Promise<{ text: string; json: unknown }> {
  const text = await response.text();
  if (text === "") return { text, json: undefined };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: undefined };
  }
}

/** Creates the HTTP transport: auth, timeouts, JSON, error mapping, retries and redaction. */
export function createTransport(deps: TransportDeps): Transport {
  const { config } = deps;
  const secrets = [config.token];
  const clean = (s: string): string => redact(s, secrets);
  const cleanDeep = (value: unknown): unknown =>
    value === undefined ? undefined : (JSON.parse(clean(JSON.stringify(value))) as unknown);

  function statusError(
    endpoint: string,
    response: Response,
    body: { text: string; json: unknown },
  ): ChartedSeaError {
    const status = response.status;
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const snippet = clean(body.text.slice(0, MAX_MESSAGE_CHARS));
    const message = `${endpoint} failed with HTTP ${String(status)}${snippet ? `: ${snippet}` : ""}`;
    const context = { endpoint, status, requestId, details: cleanDeep(body.json) };
    if (status === 401 || status === 403) {
      return new AuthError(
        `${endpoint} was rejected (HTTP ${String(status)}). Check the API token.`,
        context,
      );
    }
    if (status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), deps.now());
      return new RateLimitError(message, { ...context, retryAfterMs });
    }
    if (status === 400 || status === 422) return new ValidationError(message, context);
    if (status >= 500) return new ServerError(message, context);
    return new ResponseError(message, context);
  }

  async function attempt<T>(spec: RequestSpec, endpoint: string, decode: Decoder<T>): Promise<T> {
    const url = `${config.baseUrl}${spec.path}${queryString(spec.query)}`;
    const timeoutMs = spec.timeoutMs ?? config.timeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = (): void => {
      controller.abort();
    };
    spec.signal?.addEventListener("abort", onAbort, { once: true });

    const headers: Record<string, string> = {
      authorization: `Bearer ${config.token}`,
      accept: "application/json",
      "user-agent": config.userAgent,
    };
    if (spec.body !== undefined) headers["content-type"] = "application/json";

    const started = deps.now();
    try {
      if (spec.signal?.aborted) throw new AbortError(`${endpoint} aborted`, { endpoint });
      const init: RequestInit = { method: spec.method, headers, signal: controller.signal };
      if (spec.body !== undefined) init.body = JSON.stringify(spec.body);
      let response: Response;
      try {
        response = await deps.fetch(url, init);
      } catch (error) {
        throw transportError(error, spec, endpoint, timedOut, timeoutMs);
      }
      const body = await readBody(response);
      deps.logger?.debug("charted-sea request", {
        endpoint,
        status: response.status,
        durationMs: deps.now() - started,
      });
      if (!response.ok) throw statusError(endpoint, response, body);
      if (body.json === undefined) {
        throw new ResponseError(`${endpoint} returned a body that isn't JSON`, {
          endpoint,
          status: response.status,
        });
      }
      return decode(body.json);
    } finally {
      clearTimeout(timer);
      spec.signal?.removeEventListener("abort", onAbort);
    }
  }

  function transportError(
    error: unknown,
    spec: RequestSpec,
    endpoint: string,
    timedOut: boolean,
    timeoutMs: number,
  ): ChartedSeaError {
    const maybeSubmitted = spec.method !== "GET" && !spec.idempotent;
    if (spec.signal?.aborted) return new AbortError(`${endpoint} aborted`, { endpoint });
    const cause =
      error instanceof Error ? { name: error.name, message: clean(error.message) } : undefined;
    if (timedOut) {
      return new TimeoutError(`${endpoint} timed out after ${String(timeoutMs)} ms`, {
        endpoint,
        maybeSubmitted,
        cause,
      });
    }
    return new NetworkError(`${endpoint} failed: ${cause?.message ?? "network error"}`, {
      endpoint,
      maybeSubmitted,
      cause,
    });
  }

  function retryable(error: unknown): error is ChartedSeaError {
    if (error instanceof NetworkError || error instanceof TimeoutError) return true;
    return (
      (error instanceof RateLimitError ||
        error instanceof ServerError ||
        error instanceof ResponseError) &&
      error.status !== undefined &&
      isRetryableStatus(error.status)
    );
  }

  return {
    async request(spec, decode) {
      const endpoint = `${spec.method} ${spec.path}`;
      const maxAttempts = spec.idempotent ? config.retry.maxAttempts : 1;
      for (let n = 1; ; n++) {
        try {
          return await attempt(spec, endpoint, decode);
        } catch (error) {
          if (n >= maxAttempts || !retryable(error)) throw error;
          const retryAfter = error instanceof RateLimitError ? error.retryAfterMs : undefined;
          // Honour Retry-After, but never wait longer than maxDelayMs: give up instead.
          if (retryAfter !== undefined && retryAfter > config.retry.maxDelayMs) throw error;
          const delay = retryAfter ?? backoffDelay(n, config.retry, deps.random);
          deps.logger?.debug("charted-sea retry", {
            endpoint,
            attempt: n,
            delayMs: delay,
            error: error.name,
          });
          await deps.sleep(delay, spec.signal);
        }
      }
    },
  };
}
