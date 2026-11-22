export { createClient } from "./client.js";
export type { ChartedSeaClient, Tasks } from "./client.js";
export type { ClientOptions, Logger } from "./config.js";
export {
  AbortError,
  AuthError,
  ChartedSeaError,
  ConfigError,
  NetworkError,
  RateLimitError,
  ResponseError,
  ServerError,
  TaskNotFoundError,
  TimeoutError,
  ValidationError,
  WaitTimeoutError,
} from "./errors.js";
export type { ErrorContext } from "./errors.js";
export { REDACTED, redact } from "./http/redact.js";
export type { RetryPolicy } from "./http/retry.js";
export { isKnownStatus, isTerminalStatus, TASK_STATUSES } from "./polling/status.js";
export type { WaitOptions, WaitProgress } from "./polling/wait.js";
export { checkProxyUrl } from "./proxy-url/parse.js";
export type { Placeholder, PlaceholderValue, ProxyUrlCheck } from "./proxy-url/parse.js";
export type { HealthQuery, HealthResource, TaskMetricsQuery } from "./resources/health.js";
export type { ProxiesResource } from "./resources/proxies.js";
export { UUID_BATCH_SIZE } from "./resources/tasks.js";
export type {
  CancelQuery,
  CountQuery,
  ReadQuery,
  RunOptions,
  TasksResource,
} from "./resources/tasks.js";
export type * from "./types.js";
