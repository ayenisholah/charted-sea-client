import type { KnownTaskStatus, TaskStatus } from "../types.js";

/** Every documented status, in lifecycle order. */
export const TASK_STATUSES: readonly KnownTaskStatus[] = [
  "PENDING",
  "RUNNING",
  "BLOCKED",
  "ERROR",
  "SUCCESS",
  "BLOCKED_TOO_MANY_TIMES",
  "ERROR_TOO_MANY_TIMES",
  "CANCELLED",
  "REPLACED",
];

const TERMINAL: ReadonlySet<string> = new Set<KnownTaskStatus>([
  "SUCCESS",
  "BLOCKED_TOO_MANY_TIMES",
  "ERROR_TOO_MANY_TIMES",
  "CANCELLED",
  "REPLACED",
]);

const KNOWN: ReadonlySet<string> = new Set(TASK_STATUSES);

/**
 * True when a task won't change again. `BLOCKED` and `ERROR` are not terminal: the server
 * retries them. Unknown statuses are treated as non-terminal (forward compatibility).
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL.has(status);
}

/** True for the nine documented statuses. */
export function isKnownStatus(status: TaskStatus): status is KnownTaskStatus {
  return KNOWN.has(status);
}
