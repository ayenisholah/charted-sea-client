import { describe, expect, it } from "vitest";
import {
  AuthError,
  ChartedSeaError,
  NetworkError,
  RateLimitError,
  TaskNotFoundError,
  TimeoutError,
  WaitTimeoutError,
} from "../src/errors.js";

describe("errors", () => {
  it("defaults the endpoint to client and keeps context", () => {
    const local = new ChartedSeaError("x");
    expect(local.endpoint).toBe("client");
    expect(local.cause).toBeUndefined();
    const e = new AuthError("no", {
      endpoint: "GET /x",
      status: 401,
      requestId: "r1",
      details: { a: 1 },
      cause: { message: "c" },
    });
    expect(e).toBeInstanceOf(ChartedSeaError);
    expect(e.name).toBe("AuthError");
    expect(e.cause).toEqual({ message: "c" });
    expect(e.toJSON()).toEqual({
      name: "AuthError",
      message: "no",
      endpoint: "GET /x",
      status: 401,
      requestId: "r1",
      details: { a: 1 },
    });
  });

  it("carries retryAfterMs, maybeSubmitted, partial results and uuids", () => {
    expect(new RateLimitError("slow", { retryAfterMs: 5 }).retryAfterMs).toBe(5);
    const net = new NetworkError("reset", { maybeSubmitted: true });
    expect(net.toJSON()).toMatchObject({ name: "NetworkError", maybeSubmitted: true });
    expect(new TimeoutError("t", { maybeSubmitted: false }).maybeSubmitted).toBe(false);
    const task = { uuid: "u", url: "x", status: "RUNNING", responseBody: null };
    expect(new WaitTimeoutError("w", [task]).partial).toEqual([task]);
    const nf = new TaskNotFoundError("nf", ["u"], []);
    expect([nf.uuids, nf.partial]).toEqual([["u"], []]);
  });
});
