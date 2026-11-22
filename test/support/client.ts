import { vi } from "vitest";
import { createClient } from "../../src/client.js";
import type { ClientOptions } from "../../src/config.js";
import { BASE_URL, TEST_TOKEN } from "./mock-api.js";

/** A client pointed at the mock API, with instant sleeps and a fake clock. */
export function testClient(options: ClientOptions = {}) {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const client = createClient(
    { token: TEST_TOKEN, baseUrl: BASE_URL, ...options },
    { sleep, now: () => clock, random: () => 0.5 },
  );
  return { client, sleep };
}
