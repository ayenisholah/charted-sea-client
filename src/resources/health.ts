import { decodeAs, decodeSessionMetrics, decodeTaskMetrics } from "../decode.js";
import { ValidationError } from "../errors.js";
import type { QueryValue, Transport } from "../http/transport.js";
import type {
  Country,
  Granularity,
  HealthReport,
  HealthScraper,
  SessionMetric,
  TaskMetric,
  TimeShortcut,
} from "../types.js";

/** Query for the health endpoints. */
export interface HealthQuery {
  /** ISO 8601 datetime, a `Date`, or `LAST_1H` / `LAST_24H` / `LAST_72H`. */
  startAtIncl: TimeShortcut | (string & {}) | Date;
  /** ISO 8601 datetime, a `Date`, or `NOW` (default). The range can't exceed 7 days. */
  endAtExcl?: "NOW" | (string & {}) | Date;
  granularity: Granularity;
  /** Upper-case names: SHOPEE, SHOPEE_ANDROID, LAZADA. */
  scrapers: readonly HealthScraper[];
  countries: readonly Country[];
  signal?: AbortSignal;
}

export interface TaskMetricsQuery extends HealthQuery {
  /** e.g. PRODUCT_SEARCH, PRODUCT_DETAIL. All endpoints when omitted. */
  knownApis?: readonly string[];
}

export interface HealthResource {
  /** Whether browser/app sessions open without being blocked, across all customers. */
  sessionMetrics(query: HealthQuery): Promise<HealthReport<SessionMetric>>;
  /** Success rate and latency of scraping tasks per endpoint, across all customers. */
  taskMetrics(query: TaskMetricsQuery): Promise<HealthReport<TaskMetric>>;
}

const SHORTCUTS: ReadonlySet<string> = new Set<TimeShortcut>(["LAST_1H", "LAST_24H", "LAST_72H"]);
const GRANULARITIES: ReadonlySet<string> = new Set<Granularity>(["TOTAL", "HOUR", "DAY"]);
const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

function instant(value: string | Date, name: string): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(ms)) throw new ValidationError(`${name} is not a valid ISO 8601 datetime`);
  return ms;
}

/** Checks a health query locally (FR-7) and builds its query string. */
export function healthQuery(query: HealthQuery, now: number): Record<string, QueryValue> {
  if (!GRANULARITIES.has(query.granularity)) {
    throw new ValidationError(`granularity must be TOTAL, HOUR or DAY, got ${query.granularity}`);
  }
  if (query.scrapers.length === 0) throw new ValidationError("scrapers must not be empty");
  if (query.countries.length === 0) throw new ValidationError("countries must not be empty");

  const { startAtIncl, endAtExcl = "NOW" } = query;
  const shortcut = typeof startAtIncl === "string" && SHORTCUTS.has(startAtIncl);
  if (!shortcut) {
    const start = instant(startAtIncl, "startAtIncl");
    const end = endAtExcl === "NOW" ? now : instant(endAtExcl, "endAtExcl");
    if (end <= start) throw new ValidationError("startAtIncl must be before endAtExcl");
    if (end - start > MAX_RANGE_MS)
      throw new ValidationError("the health range can't exceed 7 days");
  } else if (endAtExcl !== "NOW") {
    instant(endAtExcl, "endAtExcl");
  }
  return {
    startAtIncl,
    endAtExcl: query.endAtExcl,
    granularity: query.granularity,
    scrapers: query.scrapers,
    countries: query.countries,
  };
}

export function createHealth(transport: Transport, now: () => number): HealthResource {
  return {
    async sessionMetrics(query) {
      const path = "/health/session-metrics";
      return transport.request(
        {
          method: "GET",
          path,
          idempotent: true,
          signal: query.signal,
          query: healthQuery(query, now()),
        },
        decodeAs(decodeSessionMetrics, `GET ${path}`),
      );
    },
    async taskMetrics(query) {
      const path = "/health/scraping-task-metrics";
      return transport.request(
        {
          method: "GET",
          path,
          idempotent: true,
          signal: query.signal,
          query: { ...healthQuery(query, now()), knownApis: query.knownApis },
        },
        decodeAs(decodeTaskMetrics, `GET ${path}`),
      );
    },
  };
}
