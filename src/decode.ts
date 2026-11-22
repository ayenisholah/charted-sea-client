import { ResponseError } from "./errors.js";
import type {
  CancelResult,
  HealthReport,
  ProxyConfig,
  ProxyValidation,
  SessionMetric,
  Task,
  TaskCount,
  TaskMetric,
} from "./types.js";

type Json = Record<string, unknown>;

/** Turns an unknown response body into a typed value, or throws. */
export type Decoder<T> = (raw: unknown) => T;

class ShapeError extends Error {}

function fail(what: string): never {
  throw new ShapeError(what);
}

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function object(v: unknown, what: string): Json {
  return isObject(v) ? v : fail(`${what} is not an object`);
}

function array(v: unknown, what: string): unknown[] {
  return Array.isArray(v) ? v : fail(`${what} is not an array`);
}

function string(v: unknown, what: string): string {
  return typeof v === "string" ? v : fail(`${what} is not a string`);
}

function number(v: unknown, what: string): number {
  return typeof v === "number" ? v : fail(`${what} is not a number`);
}

function strings(v: unknown, what: string): string[] {
  return array(v, what).map((s, i) => string(s, `${what}[${String(i)}]`));
}

/** Wraps a decoder so shape errors become a {@link ResponseError} for `endpoint`. */
export function decodeAs<T>(decoder: Decoder<T>, endpoint: string): Decoder<T> {
  return (raw) => {
    try {
      return decoder(raw);
    } catch (error) {
      if (!(error instanceof ShapeError)) throw error;
      throw new ResponseError(`Unexpected response shape from ${endpoint}: ${error.message}`, {
        endpoint,
      });
    }
  };
}

export const decodeTask: Decoder<Task> = (raw) => {
  const o = object(raw, "task");
  const body = o["responseBody"];
  return {
    ...o,
    url: string(o["url"], "task.url"),
    status: string(o["status"], "task.status"),
    responseBody: body === undefined || body === null ? null : string(body, "task.responseBody"),
  };
};

export const decodeTasks: Decoder<Task[]> = (raw) => array(raw, "tasks").map(decodeTask);

/**
 * Read Scraping Tasks. The docs show a bare array; the live API (2026-11-22) returns a page
 * object `{ items, total, pageRequest }`. Both are accepted.
 */
export const decodeTaskPage: Decoder<Task[]> = (raw) =>
  Array.isArray(raw) ? decodeTasks(raw) : decodeTasks(object(raw, "task page")["items"]);

export const decodeCounts: Decoder<TaskCount[]> = (raw) =>
  array(raw, "counts").map((row) => {
    const o = object(row, "count");
    return {
      ...o,
      country: string(o["country"], "count.country"),
      status: string(o["status"], "count.status"),
      count: number(o["count"], "count.count"),
    };
  });

export const decodeCancel: Decoder<CancelResult> = (raw) => {
  const o = object(raw, "cancel result");
  return {
    ...o,
    uuids: strings(o["uuids"] ?? [], "uuids"),
    countries: strings(o["countries"] ?? [], "countries"),
  };
};

function boolean(v: unknown, what: string): boolean {
  return typeof v === "boolean" ? v : fail(`${what} is not a boolean`);
}

function objects(v: unknown, what: string): Json[] {
  return array(v, what).map((o, i) => object(o, `${what}[${String(i)}]`));
}

/** Health rows keep every field; only the keys used for grouping are checked. */
function healthReport<M>(raw: unknown): HealthReport<M> {
  const o = object(raw, "health report");
  return {
    ...o,
    startAtIncl: string(o["startAtIncl"], "startAtIncl"),
    endAtExcl: string(o["endAtExcl"], "endAtExcl"),
    granularity: string(o["granularity"], "granularity"),
    scrapers: strings(o["scrapers"] ?? [], "scrapers"),
    countries: strings(o["countries"] ?? [], "countries"),
    periods: objects(o["periods"], "periods").map((p) => ({
      ...p,
      startAtIncl: string(p["startAtIncl"], "period.startAtIncl"),
      endAtExcl: string(p["endAtExcl"], "period.endAtExcl"),
      metrics: objects(p["metrics"], "period.metrics").map((m) => {
        string(m["scraper"], "metric.scraper");
        string(m["country"], "metric.country");
        return m as M;
      }),
    })),
  };
}

export const decodeSessionMetrics: Decoder<HealthReport<SessionMetric>> = healthReport;
export const decodeTaskMetrics: Decoder<HealthReport<TaskMetric>> = healthReport;

export const decodeProxyValidations: Decoder<ProxyValidation[]> = (raw) =>
  objects(raw, "validations").map((v) => ({
    ...v,
    url: string(v["url"], "validation.url"),
    tests: objects(v["tests"] ?? [], "validation.tests").map((t) => ({
      ...t,
      type: string(t["type"], "test.type"),
      success: boolean(t["success"], "test.success"),
    })),
    compatibilities: objects(v["compatibilities"] ?? [], "validation.compatibilities").map((c) => ({
      ...c,
      scraper: string(c["scraper"], "compatibility.scraper"),
      description: string(c["description"] ?? "", "compatibility.description"),
      compatible: boolean(c["compatible"], "compatibility.compatible"),
    })),
  }));

export const decodeProxyConfigs: Decoder<ProxyConfig[]> = (raw) =>
  objects(raw, "proxy configs").map((c) => ({
    ...c,
    scraper: string(c["scraper"], "config.scraper"),
    proxySettings: objects(c["proxySettings"], "config.proxySettings").map((s) => ({
      ...s,
      type: string(s["type"], "setting.type"),
      urls: strings(s["urls"], "setting.urls"),
    })),
  }));
