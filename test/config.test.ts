import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, resolveConfig } from "../src/config.js";
import { ConfigError } from "../src/errors.js";

describe("resolveConfig", () => {
  it("reads the token from the environment and applies defaults", () => {
    expect(resolveConfig({}, { CHARTED_SEA_TOKEN: " tok " }, "1.2.3")).toEqual({
      token: "tok",
      baseUrl: DEFAULT_BASE_URL,
      timeoutMs: 30_000,
      retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10_000 },
      userAgent: "charted-sea-client/1.2.3",
    });
  });

  it("prefers explicit options and strips trailing slashes", () => {
    const c = resolveConfig(
      {
        token: "a",
        baseUrl: "http://localhost:8080/api/",
        timeoutMs: 5,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
        userAgent: " my-app/2 ",
      },
      { CHARTED_SEA_TOKEN: "ignored" },
      "1",
    );
    expect(c).toMatchObject({
      token: "a",
      baseUrl: "http://localhost:8080/api",
      timeoutMs: 5,
      userAgent: "charted-sea-client/1 my-app/2",
    });
  });

  it.each([
    [{}, /No API token/],
    [{ token: "  " }, /No API token/],
    [{ token: "t", baseUrl: "not a url" }, /not a valid URL/],
    [{ token: "t", baseUrl: "ftp://x" }, /must be http/],
    [{ token: "t", timeoutMs: 0 }, /timeoutMs must be an integer/],
    [{ token: "t", timeoutMs: 1.5 }, /timeoutMs/],
    [{ token: "t", retry: { maxAttempts: 0 } }, /retry.maxAttempts/],
    [{ token: "t", retry: { baseDelayMs: 20_000 } }, /must not exceed/],
  ])("rejects %j with ConfigError", (options, message) => {
    expect(() => resolveConfig(options, {}, "1")).toThrow(ConfigError);
    expect(() => resolveConfig(options, {}, "1")).toThrow(message);
  });
});
