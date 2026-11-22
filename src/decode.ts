import { ResponseError } from "./errors.js";
import type { CancelResult, Task, TaskCount } from "./types.js";

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
