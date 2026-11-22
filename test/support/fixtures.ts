import { readFileSync } from "node:fs";

export interface Fixture {
  $source: string;
  $provisional?: string;
  request: {
    method: "GET" | "POST" | "PUT";
    path: string;
    query: Record<string, string>;
    body?: unknown;
  };
  response: { status: number; body: unknown };
}

export type FixtureName =
  | "run-sync"
  | "run-async"
  | "run-scraper-params"
  | "run-single-sync"
  | "read-tasks"
  | "read-tasks-live"
  | "count-tasks"
  | "cancel-tasks"
  | "health-session-metrics"
  | "health-task-metrics"
  | "proxy-validate"
  | "proxy-configs-update"
  | "proxy-configs-update-invalid"
  | "proxy-configs-read";

export function fixture(name: FixtureName): Fixture {
  const url = new URL(`../fixtures/api-reference/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Fixture;
}
