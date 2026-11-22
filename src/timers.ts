import { AbortError } from "./errors.js";

/** Abortable sleep. Rejects with {@link AbortError} when `signal` fires. */
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const sleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError("Aborted"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortError("Aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
