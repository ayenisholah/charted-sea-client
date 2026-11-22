import { describe, expect, it } from "vitest";
import { isKnownStatus, isTerminalStatus, TASK_STATUSES } from "../../src/polling/status.js";

describe("status table", () => {
  it("matches the documented lifecycle", () => {
    const terminal = TASK_STATUSES.filter(isTerminalStatus);
    expect(terminal).toEqual([
      "SUCCESS",
      "BLOCKED_TOO_MANY_TIMES",
      "ERROR_TOO_MANY_TIMES",
      "CANCELLED",
      "REPLACED",
    ]);
  });

  it("NFR-7: unknown statuses are not terminal and not known", () => {
    expect(isTerminalStatus("PAUSED")).toBe(false);
    expect(isKnownStatus("PAUSED")).toBe(false);
    expect(isKnownStatus("BLOCKED")).toBe(true);
  });
});
