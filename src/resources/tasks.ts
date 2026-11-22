import {
  decodeAs,
  decodeCancel,
  decodeCounts,
  decodeTask,
  decodeTaskPage,
  decodeTasks,
} from "../decode.js";
import { ValidationError } from "../errors.js";
import type { QueryValue, Transport } from "../http/transport.js";
import { chunk, orderBy, unique } from "../polling/batch.js";
import type {
  CancelResult,
  Country,
  Scraper,
  Task,
  TaskCount,
  TaskRequest,
  TaskStatus,
} from "../types.js";

/** UUIDs per Read Scraping Tasks request (open question 6). */
export const UUID_BATCH_SIZE = 100;

const SYNC_TIMEOUT_MARGIN_MS = 30_000;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_AUTO_CANCEL_SEC = 600;
const RESERVED_BODY_KEYS = new Set(["requests", "cacheMaxAgeInSec", "url", "method", "payload"]);

interface FieldSelection {
  /** Return every field instead of the most important ones. */
  includeAllFields?: boolean;
  /** Return only these fields (overrides `includeAllFields`). */
  includeFields?: readonly string[];
}

/** Options for `run` and `runSingle`. */
export interface RunOptions extends FieldSelection {
  /**
   * Keep the connection open until tasks finish. Default **false** (ADR 0001), unlike the API's
   * default: a dropped connection in synchronous mode cancels in-flight tasks.
   */
  wait?: boolean;
  /** Execution timeout for synchronous runs. API default 600. */
  autoCancelAfterSec?: number;
  /** Return a cached successful result up to this age (not billed). */
  cacheMaxAgeInSec?: number;
  /** Scraper-specific parameters, e.g. `{ productSearch_crawlNextPages: true }`. Sent at the body root. */
  scraperParams?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

/** Filters for `read`. */
export interface ReadQuery extends FieldSelection {
  /** Default 20. With `uuids`, defaults to the number of UUIDs in each batch. */
  limit?: number;
  offset?: number;
  /** Batched in groups of 100 and merged back in input order. */
  uuids?: readonly string[];
  urls?: readonly string[];
  /** Inclusive. API default: 7 days ago. */
  minPendingAt?: string | Date;
  /** Exclusive. */
  maxPendingAt?: string | Date;
  signal?: AbortSignal;
}

export interface CountQuery {
  statuses?: readonly TaskStatus[];
  /** Inclusive. API default: 7 days ago. */
  minPendingAt?: string | Date;
  signal?: AbortSignal;
}

export interface CancelQuery {
  uuids?: readonly string[];
  countries?: readonly Country[];
  signal?: AbortSignal;
}

export interface TasksResource {
  /** Submit tasks. Asynchronous by default; never retried automatically. */
  run(scraper: Scraper, requests: readonly TaskRequest[], options?: RunOptions): Promise<Task[]>;
  /** Submit one task. Asynchronous by default; never retried automatically. */
  runSingle(scraper: Scraper, request: TaskRequest, options?: RunOptions): Promise<Task>;
  /** Read tasks by UUID, URL or time range. */
  read(scraper: Scraper, query?: ReadQuery): Promise<Task[]>;
  /**
   * Iterates every task matching `query` across pages (`offset` advances by `limit`, default 20),
   * stopping at the first short page. A task seen twice while pages shift is yielded once. Offset
   * paging can't see tasks that move between pages while iterating; pin `maxPendingAt` for a stable set.
   */
  iterate(
    scraper: Scraper,
    query?: Omit<ReadQuery, "uuids">,
  ): AsyncGenerator<Task, void, undefined>;
  /** Count tasks by status and country. */
  count(scraper: Scraper, query?: CountQuery): Promise<TaskCount[]>;
  /** Cancel tasks (and their sub-tasks) by UUID and/or country. Never retried automatically. */
  cancel(scraper: Scraper, query: CancelQuery): Promise<CancelResult>;
}

function scraperPath(scraper: Scraper, suffix = ""): string {
  if (scraper.trim() === "") throw new ValidationError("scraper must not be empty");
  return `/scraping-tasks/${encodeURIComponent(scraper)}${suffix}`;
}

function fieldQuery(o: FieldSelection): Record<string, QueryValue> {
  return { includeAllFields: o.includeAllFields, includeFields: o.includeFields };
}

function runParts(options: RunOptions, timeoutMs: number) {
  for (const key of Object.keys(options.scraperParams ?? {})) {
    if (RESERVED_BODY_KEYS.has(key)) {
      throw new ValidationError(`scraperParams must not set "${key}"`);
    }
  }
  const wait = options.wait ?? false;
  const autoCancel = options.autoCancelAfterSec;
  return {
    query: { waitForCompletion: wait, autoCancelAfterSec: autoCancel, ...fieldQuery(options) },
    extraBody: { cacheMaxAgeInSec: options.cacheMaxAgeInSec, ...options.scraperParams },
    timeoutMs: wait
      ? (autoCancel ?? DEFAULT_AUTO_CANCEL_SEC) * 1000 + SYNC_TIMEOUT_MARGIN_MS
      : timeoutMs,
  };
}

/** Creates the tasks resource over a transport. `timeoutMs` is the client default. */
export function createTasks(transport: Transport, timeoutMs: number): TasksResource {
  async function readBatch(scraper: Scraper, query: ReadQuery, uuids?: readonly string[]) {
    const path = scraperPath(scraper);
    return transport.request(
      {
        method: "GET",
        path,
        idempotent: true,
        signal: query.signal,
        query: {
          limit: query.limit ?? uuids?.length,
          offset: query.offset,
          uuids,
          urls: query.urls,
          minPendingAt: query.minPendingAt,
          maxPendingAt: query.maxPendingAt,
          ...fieldQuery(query),
        },
      },
      decodeAs(decodeTaskPage, `GET ${path}`),
    );
  }

  return {
    async run(scraper, requests, options = {}) {
      if (requests.length === 0) throw new ValidationError("run needs at least one request");
      const path = scraperPath(scraper, "/run");
      const parts = runParts(options, timeoutMs);
      return transport.request(
        {
          method: "POST",
          path,
          idempotent: false,
          query: parts.query,
          body: { requests, ...parts.extraBody },
          timeoutMs: parts.timeoutMs,
          signal: options.signal,
        },
        decodeAs(decodeTasks, `POST ${path}`),
      );
    },

    async runSingle(scraper, request, options = {}) {
      const path = scraperPath(scraper, "/run-single");
      const parts = runParts(options, timeoutMs);
      return transport.request(
        {
          method: "POST",
          path,
          idempotent: false,
          query: parts.query,
          body: { ...request, ...parts.extraBody },
          timeoutMs: parts.timeoutMs,
          signal: options.signal,
        },
        decodeAs(decodeTask, `POST ${path}`),
      );
    },

    async read(scraper, query = {}) {
      if (query.uuids === undefined) return readBatch(scraper, query);
      const uuids = unique(query.uuids);
      if (uuids.length === 0) return [];
      if (uuids.length <= UUID_BATCH_SIZE) {
        const tasks = await readBatch(scraper, query, uuids);
        return orderBy(uuids, tasks, (t) => t.uuid).ordered;
      }
      if (query.limit !== undefined || query.offset !== undefined) {
        throw new ValidationError(
          `limit and offset can't be combined with more than ${String(UUID_BATCH_SIZE)} uuids`,
        );
      }
      const pages: Task[][] = [];
      for (const batch of chunk(uuids, UUID_BATCH_SIZE)) {
        pages.push(await readBatch(scraper, query, batch));
      }
      return orderBy(uuids, pages.flat(), (t) => t.uuid).ordered;
    },

    async *iterate(scraper, query = {}) {
      const limit = query.limit ?? DEFAULT_PAGE_SIZE;
      if (!Number.isInteger(limit) || limit < 1) throw new ValidationError("limit must be ≥ 1");
      const seen = new Set<string>();
      for (let offset = query.offset ?? 0; ; offset += limit) {
        const page = await readBatch(scraper, { ...query, limit, offset });
        for (const task of page) {
          if (task.uuid !== undefined) {
            if (seen.has(task.uuid)) continue;
            seen.add(task.uuid);
          }
          yield task;
        }
        if (page.length < limit) return;
      }
    },

    async count(scraper, query = {}) {
      const path = scraperPath(scraper, "/count");
      return transport.request(
        {
          method: "GET",
          path,
          idempotent: true,
          signal: query.signal,
          query: { statuses: query.statuses, minPendingAt: query.minPendingAt },
        },
        decodeAs(decodeCounts, `GET ${path}`),
      );
    },

    async cancel(scraper, query) {
      const uuids = query.uuids ?? [];
      const countries = query.countries ?? [];
      if (uuids.length === 0 && countries.length === 0) {
        throw new ValidationError("cancel needs at least one uuid or country");
      }
      const path = scraperPath(scraper, "/cancel");
      const body: Record<string, unknown> = {};
      if (uuids.length > 0) body["uuids"] = uuids;
      if (countries.length > 0) body["countries"] = countries;
      return transport.request(
        { method: "POST", path, idempotent: false, body, signal: query.signal },
        decodeAs(decodeCancel, `POST ${path}`),
      );
    },
  };
}
