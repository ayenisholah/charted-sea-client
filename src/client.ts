import { type ClientOptions, resolveConfig } from "./config.js";
import { createTransport } from "./http/transport.js";
import { waitForResults, type WaitOptions } from "./polling/wait.js";
import { checkProxyUrl, type ProxyUrlCheck } from "./proxy-url/parse.js";
import { createHealth, type HealthResource } from "./resources/health.js";
import { createProxies, type ProxiesResource } from "./resources/proxies.js";
import { createTasks, type TasksResource } from "./resources/tasks.js";
import { sleep } from "./timers.js";
import type { Scraper, Task } from "./types.js";

declare const __VERSION__: string;

/** Tasks API plus polling. */
export interface Tasks extends TasksResource {
  /**
   * Polls until every task is terminal, then returns one task per UUID in input order.
   * Task outcomes (blocked, error, cancelled) are returned, not thrown.
   */
  waitForResults(
    scraper: Scraper,
    uuids: readonly string[],
    options?: WaitOptions,
  ): Promise<Task[]>;
}

export interface ChartedSeaClient {
  readonly tasks: Tasks;
  readonly health: HealthResource;
  readonly proxies: ProxiesResource;
  /** Local proxy URL checks; no network call. */
  readonly proxyUrl: { check(template: string): ProxyUrlCheck };
}

/** Test seams. Not part of the public API. */
export interface ClientInternals {
  env?: Readonly<Record<string, string | undefined>>;
  sleep?: typeof sleep;
  now?: () => number;
  random?: () => number;
}

function processEnv(): Readonly<Record<string, string | undefined>> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  );
}

/**
 * Creates a Charted Sea client.
 *
 * @example
 * const cs = createClient(); // reads CHARTED_SEA_TOKEN
 * const [task] = await cs.tasks.run("shopee", [{ url }]);
 */
export function createClient(
  options: ClientOptions = {},
  internals: ClientInternals = {},
): ChartedSeaClient {
  const config = resolveConfig(options, internals.env ?? processEnv(), __VERSION__);
  const deps = {
    sleep: internals.sleep ?? sleep,
    now: internals.now ?? Date.now,
    random: internals.random ?? Math.random,
    logger: options.logger,
  };
  const transport = createTransport({
    ...deps,
    config,
    fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
  });
  const resource = createTasks(transport, config.timeoutMs);
  const tasks: Tasks = {
    ...resource,
    waitForResults: (scraper, uuids, waitOptions) =>
      waitForResults({ ...deps, reader: resource }, scraper, uuids, waitOptions),
  };
  return {
    tasks,
    health: createHealth(transport, deps.now),
    proxies: createProxies(transport),
    proxyUrl: { check: checkProxyUrl },
  };
}
