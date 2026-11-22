import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client.js";
import { ConfigError } from "../src/errors.js";
import { testClient } from "./support/client.js";
import {
  BASE_URL,
  recorded,
  server,
  serveSequence,
  TEST_TOKEN,
  useMockApi,
} from "./support/mock-api.js";

useMockApi();

describe("createClient", () => {
  it("reads CHARTED_SEA_TOKEN from the environment and fails fast without one", () => {
    vi.stubEnv("CHARTED_SEA_TOKEN", "");
    expect(() => createClient()).toThrow(ConfigError);
    vi.stubEnv("CHARTED_SEA_TOKEN", TEST_TOKEN);
    expect(createClient().tasks).toBeDefined();
    vi.unstubAllEnvs();
  });

  it("works where there is no process global", () => {
    const original = globalThis.process;
    vi.stubGlobal("process", undefined);
    try {
      expect(() => createClient()).toThrow(ConfigError);
    } finally {
      vi.stubGlobal("process", original);
      vi.unstubAllGlobals();
    }
  });

  it("uses the global fetch and real timers by default and sends the user agent", async () => {
    server.use(http.get(`${BASE_URL}/scraping-tasks/shopee/count`, () => HttpResponse.json([])));
    const client = createClient({ token: TEST_TOKEN, baseUrl: BASE_URL, userAgent: "my-app/1" });
    await client.tasks.count("shopee");
    expect(recorded[0]?.headers.get("user-agent")).toBe("charted-sea-client/0.0.0-test my-app/1");
  });

  it("wires waitForResults to the tasks reader", async () => {
    serveSequence("get", "/scraping-tasks/shopee", [
      [{ uuid: "a", url: "u", status: "RUNNING" }],
      [{ uuid: "a", url: "u", status: "SUCCESS", responseBody: "{}" }],
    ]);
    const { client, sleep } = testClient();
    const [task] = await client.tasks.waitForResults("shopee", ["a"]);
    expect(task?.status).toBe("SUCCESS");
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
