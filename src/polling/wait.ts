import type { Logger } from "../config.js";
import { AbortError, TaskNotFoundError, ValidationError, WaitTimeoutError } from "../errors.js";
import { pollDelay } from "../http/retry.js";
import type { ReadQuery } from "../resources/tasks.js";
import type { Sleep } from "../timers.js";
import type { Scraper, Task } from "../types.js";
import { unique } from "./batch.js";
import { isKnownStatus, isTerminalStatus } from "./status.js";

/** Reported after every poll. */
export interface WaitProgress {
  done: number;
  total: number;
  /** Latest known status of each task, counted. */
  byStatus: Record<string, number>;
}

export interface WaitOptions {
  /** Shortest wait between polls. Default 2 s. */
  pollIntervalMs?: number;
  /** Longest wait between polls. Default 15 s. */
  maxPollIntervalMs?: number;
  /** Give up after this long with {@link WaitTimeoutError}. Default 10 min. */
  maxWaitMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: WaitProgress) => void;
}

/** The part of the tasks resource that polling needs. */
export interface TaskReader {
  read(scraper: Scraper, query: ReadQuery): Promise<Task[]>;
}

export interface WaitDeps {
  reader: TaskReader;
  sleep: Sleep;
  now: () => number;
  random: () => number;
  logger?: Logger | undefined;
}

/** Consecutive reads a UUID may be missing from before {@link TaskNotFoundError}. */
const MAX_MISSES = 3;

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new ValidationError(`${name} must be > 0`);
  return value;
}

/**
 * Polls until every task is terminal and returns one task per input UUID, in input order.
 * Throws {@link WaitTimeoutError} at `maxWaitMs`, {@link AbortError} on `signal`, and
 * {@link TaskNotFoundError} when a UUID is missing from {@link MAX_MISSES} reads in a row.
 */
export async function waitForResults(
  deps: WaitDeps,
  scraper: Scraper,
  uuids: readonly string[],
  options: WaitOptions = {},
): Promise<Task[]> {
  const minMs = positive(options.pollIntervalMs ?? 2_000, "pollIntervalMs");
  const maxMs = positive(options.maxPollIntervalMs ?? 15_000, "maxPollIntervalMs");
  const maxWaitMs = positive(options.maxWaitMs ?? 600_000, "maxWaitMs");
  if (minMs > maxMs) throw new ValidationError("pollIntervalMs must not exceed maxPollIntervalMs");
  const { signal } = options;

  const all = unique(uuids);
  const latest = new Map<string, Task>();
  const done = new Set<string>();
  const misses = new Map<string, number>();
  const warned = new Set<string>();
  const started = deps.now();
  let step = 0;

  const inOrder = (): Task[] => uuids.flatMap((u) => latest.get(u) ?? []);

  while (done.size < all.length) {
    if (signal?.aborted) throw new AbortError("waitForResults aborted");
    const pending = all.filter((u) => !done.has(u));
    const query: ReadQuery = signal ? { uuids: pending, signal } : { uuids: pending };
    const tasks = await deps.reader.read(scraper, query);

    const before = done.size;
    const seen = new Set<string>();
    for (const task of tasks) {
      if (task.uuid === undefined || !pending.includes(task.uuid)) continue;
      seen.add(task.uuid);
      latest.set(task.uuid, task);
      if (isTerminalStatus(task.status)) done.add(task.uuid);
      else if (!isKnownStatus(task.status) && !warned.has(task.status)) {
        warned.add(task.status);
        deps.logger?.debug("charted-sea unknown task status; treating as not finished", {
          status: task.status,
        });
      }
    }

    const notFound: string[] = [];
    for (const uuid of pending) {
      if (seen.has(uuid)) misses.delete(uuid);
      else {
        const n = (misses.get(uuid) ?? 0) + 1;
        misses.set(uuid, n);
        if (n >= MAX_MISSES) notFound.push(uuid);
      }
    }
    if (notFound.length > 0) {
      throw new TaskNotFoundError(
        `${String(notFound.length)} task(s) not found after ${String(MAX_MISSES)} reads: ${notFound.join(", ")}`,
        notFound,
        inOrder(),
      );
    }

    const byStatus: Record<string, number> = {};
    for (const task of latest.values()) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    options.onProgress?.({ done: done.size, total: all.length, byStatus });

    if (done.size === all.length) break;
    const elapsed = deps.now() - started;
    if (elapsed >= maxWaitMs) {
      throw new WaitTimeoutError(
        `waitForResults gave up after ${String(maxWaitMs)} ms with ${String(all.length - done.size)} of ${String(all.length)} task(s) unfinished`,
        inOrder(),
      );
    }
    step = done.size > before ? 0 : step + 1;
    await deps.sleep(
      Math.min(pollDelay(step, minMs, maxMs, deps.random), maxWaitMs - elapsed),
      signal,
    );
  }
  return inOrder();
}
