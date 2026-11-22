import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import type { Task } from "../../src/types.js";
import { testClient } from "../support/client.js";
import { BASE_URL, recorded, server, useMockApi } from "../support/mock-api.js";

useMockApi();

const make = (n: number): Task => ({
  uuid: `u${String(n)}`,
  url: `https://x/${String(n)}`,
  status: "SUCCESS",
  responseBody: null,
});

async function collect(gen: AsyncGenerator<Task>): Promise<Task[]> {
  const out: Task[] = [];
  for await (const t of gen) out.push(t);
  return out;
}

describe("tasks.iterate", () => {
  it("FR-6: yields every task across pages, never the same task twice even when pages shift", async () => {
    const all = Array.from({ length: 45 }, (_, i) => make(i));
    server.use(
      http.get(`${BASE_URL}/scraping-tasks/shopee`, ({ request }) => {
        const q = new URL(request.url).searchParams;
        const offset = Number(q.get("offset"));
        const limit = Number(q.get("limit"));
        // The second page overlaps the first by one task, as if a new task arrived.
        const from = offset === 20 ? 19 : offset;
        return HttpResponse.json(all.slice(from, from + limit));
      }),
    );
    const { client } = testClient();
    const tasks = await collect(
      client.tasks.iterate("shopee", { minPendingAt: "2026-07-01T00:00:00Z" }),
    );
    const served = [...all.slice(0, 20), ...all.slice(19, 39), ...all.slice(40, 45)];
    expect(tasks.map((t) => t.uuid)).toEqual([...new Set(served.map((t) => t.uuid))]);
    expect(new Set(tasks.map((t) => t.uuid)).size).toBe(tasks.length);
    expect(
      recorded.map((r) => [r.query["offset"], r.query["limit"], r.query["minPendingAt"]]),
    ).toEqual([
      ["0", "20", "2026-07-01T00:00:00Z"],
      ["20", "20", "2026-07-01T00:00:00Z"],
      ["40", "20", "2026-07-01T00:00:00Z"],
    ]);
  });

  it("starts at a custom offset, keeps tasks without uuid, and stops on an empty page", async () => {
    server.use(
      http.get(`${BASE_URL}/scraping-tasks/lazada`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset"));
        return HttpResponse.json(
          offset === 5
            ? [
                { url: "a", status: "PENDING" },
                { url: "b", status: "PENDING" },
              ]
            : [],
        );
      }),
    );
    const { client } = testClient();
    const tasks = await collect(client.tasks.iterate("lazada", { offset: 5, limit: 2 }));
    expect(tasks.map((t) => t.url)).toEqual(["a", "b"]);
    expect(recorded).toHaveLength(2);
  });

  it("rejects a non-positive limit", async () => {
    const { client } = testClient();
    await expect(collect(client.tasks.iterate("shopee", { limit: 0 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
