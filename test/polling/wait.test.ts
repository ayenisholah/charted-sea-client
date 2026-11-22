import { describe, expect, it, vi } from "vitest";
import {
  AbortError,
  TaskNotFoundError,
  ValidationError,
  WaitTimeoutError,
} from "../../src/errors.js";
import {
  type TaskReader,
  waitForResults,
  type WaitDeps,
  type WaitProgress,
} from "../../src/polling/wait.js";
import type { ReadQuery } from "../../src/resources/tasks.js";
import { sleep as realSleep } from "../../src/timers.js";
import type { Task } from "../../src/types.js";

const task = (uuid: string, status: string): Task => ({
  uuid,
  url: `https://x/${uuid}`,
  status,
  responseBody: status === "SUCCESS" ? "{}" : null,
});

/** A reader that serves one scripted snapshot per poll (the last repeats), filtered to the queried UUIDs. */
function scripted(...polls: Record<string, string>[]) {
  let i = 0;
  const queries: ReadQuery[] = [];
  const reader: TaskReader = {
    read: vi.fn(async (_scraper, query: ReadQuery) => {
      queries.push(query);
      const snapshot = polls[Math.min(i++, polls.length - 1)] ?? {};
      return (query.uuids ?? []).flatMap((u) => (snapshot[u] ? [task(u, snapshot[u])] : []));
    }),
  };
  return { reader, queries };
}

function deps(reader: TaskReader, overrides: Partial<WaitDeps> = {}) {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const logger = { debug: vi.fn() };
  const d: WaitDeps = { reader, sleep, now: () => clock, random: () => 0.5, logger, ...overrides };
  return { deps: d, sleep, logger };
}

describe("waitForResults", () => {
  it("FR-3: returns one task per input UUID in input order once all are terminal", async () => {
    const { reader, queries } = scripted(
      { a: "PENDING", b: "RUNNING", c: "BLOCKED" },
      { a: "RUNNING", b: "SUCCESS", c: "ERROR" },
      { a: "SUCCESS", c: "BLOCKED_TOO_MANY_TIMES" },
    );
    const progress: WaitProgress[] = [];
    const { deps: d } = deps(reader);
    const out = await waitForResults(d, "shopee", ["c", "a", "b", "a"], {
      onProgress: (p) => progress.push(p),
    });
    expect(out.map((t) => [t.uuid, t.status])).toEqual([
      ["c", "BLOCKED_TOO_MANY_TIMES"],
      ["a", "SUCCESS"],
      ["b", "SUCCESS"],
      ["a", "SUCCESS"],
    ]);
    // Only unfinished UUIDs are polled again.
    expect(queries.map((q) => q.uuids)).toEqual([
      ["c", "a", "b"],
      ["c", "a", "b"],
      ["c", "a"],
    ]);
    expect(progress.map((p) => p.done)).toEqual([0, 1, 3]);
    expect(progress[0]).toEqual({
      done: 0,
      total: 3,
      byStatus: { PENDING: 1, RUNNING: 1, BLOCKED: 1 },
    });
  });

  it("backs off between polls without progress and resets after progress", async () => {
    const { reader } = scripted(
      { a: "PENDING", b: "PENDING" },
      { a: "PENDING", b: "PENDING" },
      { a: "SUCCESS", b: "PENDING" },
      { a: "SUCCESS", b: "SUCCESS" },
    );
    const { deps: d, sleep } = deps(reader);
    await waitForResults(d, "shopee", ["a", "b"], {
      pollIntervalMs: 1_000,
      maxPollIntervalMs: 8_000,
    });
    // step 1: cap 2000 → 1500; step 2: cap 4000 → 2500; progress → step 0 → 1000.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1_500, 2_500, 1_000]);
  });

  it("FR-4: throws WaitTimeoutError at maxWaitMs with the latest known state of each task", async () => {
    const { reader } = scripted({ a: "SUCCESS", b: "RUNNING" });
    const { deps: d, sleep } = deps(reader);
    const error = await waitForResults(d, "shopee", ["b", "a"], {
      pollIntervalMs: 1_000,
      maxPollIntervalMs: 1_000,
      maxWaitMs: 2_500,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WaitTimeoutError);
    expect((error as WaitTimeoutError).partial.map((t) => t.status)).toEqual([
      "RUNNING",
      "SUCCESS",
    ]);
    // Sleeps are capped by the remaining budget, so there's one last poll at the deadline.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1_000, 1_000, 500]);
  });

  it("FR-4: stops immediately on an aborted signal", async () => {
    const { reader } = scripted({ a: "PENDING" });
    await expect(
      waitForResults(deps(reader).deps, "shopee", ["a"], { signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(reader.read).not.toHaveBeenCalled();

    const controller = new AbortController();
    const live = deps(reader, { sleep: realSleep, now: Date.now }).deps;
    const p = waitForResults(live, "shopee", ["a"], {
      pollIntervalMs: 60_000,
      maxPollIntervalMs: 60_000,
      signal: controller.signal,
    });
    setTimeout(() => {
      controller.abort();
    }, 5);
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it("passes the signal to every read", async () => {
    const { reader, queries } = scripted({ a: "SUCCESS" });
    const controller = new AbortController();
    await waitForResults(deps(reader).deps, "shopee", ["a"], { signal: controller.signal });
    expect(queries[0]?.signal).toBe(controller.signal);
  });

  it("throws TaskNotFoundError after 3 consecutive misses, and a reappearance resets the count", async () => {
    const { reader } = scripted({ a: "PENDING" }, {}, { a: "PENDING" }, {}, {}, {});
    const error = await waitForResults(deps(reader).deps, "shopee", ["a", "z"]).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TaskNotFoundError);
    expect((error as TaskNotFoundError).uuids).toEqual(["z"]);
    expect((error as TaskNotFoundError).partial.map((t) => t.uuid)).toEqual(["a"]);
    expect(reader.read).toHaveBeenCalledTimes(3);

    const flaky = scripted({}, {}, { a: "PENDING" }, {}, {}, { a: "SUCCESS" });
    await expect(waitForResults(deps(flaky.reader).deps, "shopee", ["a"])).resolves.toHaveLength(1);
  });

  it("NFR-7: keeps polling unknown statuses and logs each one once", async () => {
    const { reader } = scripted({ a: "PAUSED" }, { a: "PAUSED" }, { a: "SUCCESS" });
    const { deps: d, logger } = deps(reader);
    await waitForResults(d, "shopee", ["a"]);
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("unknown task status"), {
      status: "PAUSED",
    });
  });

  it("ignores tasks it didn't ask for, and works without a logger", async () => {
    const reader: TaskReader = {
      read: vi.fn(async () => [
        { url: "x", status: "SUCCESS", responseBody: null },
        task("other", "SUCCESS"),
        task("a", "NEW"),
      ]),
    };
    let calls = 0;
    const read = reader.read;
    reader.read = async (s, q) => (++calls > 1 ? [task("a", "SUCCESS")] : read(s, q));
    const { logger: _ignored, ...noLogger } = deps(reader).deps;
    await expect(waitForResults(noLogger, "shopee", ["a"])).resolves.toEqual([
      task("a", "SUCCESS"),
    ]);
  });

  it("returns [] for no UUIDs without reading", async () => {
    const { reader } = scripted({});
    await expect(waitForResults(deps(reader).deps, "shopee", [])).resolves.toEqual([]);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it.each([
    [{ pollIntervalMs: 0 }, /pollIntervalMs must be > 0/],
    [{ maxPollIntervalMs: Number.NaN }, /maxPollIntervalMs/],
    [{ maxWaitMs: -1 }, /maxWaitMs/],
    [{ pollIntervalMs: 10, maxPollIntervalMs: 5 }, /must not exceed/],
  ])("validates options %j", async (options, message) => {
    const { reader } = scripted({});
    const p = waitForResults(deps(reader).deps, "shopee", ["a"], options);
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(waitForResults(deps(reader).deps, "shopee", ["a"], options)).rejects.toThrow(
      message,
    );
  });
});
