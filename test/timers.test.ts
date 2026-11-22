import { afterEach, describe, expect, it, vi } from "vitest";
import { AbortError } from "../src/errors.js";
import { sleep } from "../src/timers.js";

describe("sleep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const p = sleep(100, controller.signal);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBeUndefined();
  });

  it("works without a signal", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });

  it("rejects with AbortError when aborted before or during", async () => {
    await expect(sleep(10, AbortSignal.abort())).rejects.toBeInstanceOf(AbortError);
    const controller = new AbortController();
    const p = sleep(10_000, controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});
