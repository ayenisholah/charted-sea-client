/** Scraper path name. Known names autocomplete; any other string passes through (open question 3). */
export type Scraper = "shopee" | "shopee-android" | "lazada" | (string & {});

/** Documented task statuses. Unknown statuses from the server are kept as plain strings. */
export type KnownTaskStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "BLOCKED"
  | "ERROR"
  | "BLOCKED_TOO_MANY_TIMES"
  | "ERROR_TOO_MANY_TIMES"
  | "CANCELLED"
  | "REPLACED";

export type TaskStatus = KnownTaskStatus | (string & {});

/** Upper-case scraper names used by the health and proxy endpoints. */
export type HealthScraper = "SHOPEE" | "SHOPEE_ANDROID" | "LAZADA" | (string & {});

/** Countries documented for the health endpoints. */
export type Country =
  "SG" | "ID" | "TH" | "MY" | "PH" | "VN" | "BR" | "MX" | "CL" | "CO" | "AR" | "TW" | (string & {});

/** One request to scrape. */
export interface TaskRequest {
  url: string;
  method?: "GET" | "POST";
  /** Request body when `method` is `POST`. */
  payload?: unknown;
}

/** A scraping task as returned by the API. Unknown fields are kept. */
export interface Task {
  /** Present on asynchronous runs and reads. */
  uuid?: string;
  url: string;
  method?: "GET" | "POST" | (string & {});
  payload?: unknown;
  status: TaskStatus;
  /** Raw body from the scraped platform (JSON or HTML text), or null. */
  responseBody: string | null;
  errorMessage?: string;
  [extra: string]: unknown;
}

/** One row of Count Scraping Tasks. */
export interface TaskCount {
  country: Country;
  status: TaskStatus;
  count: number;
  [extra: string]: unknown;
}

/** Result of Cancel Scraping Tasks: everything cancelled, including sub-tasks. */
export interface CancelResult {
  uuids: string[];
  countries: Country[];
  [extra: string]: unknown;
}

/** Time-range shortcuts accepted by the health endpoints. */
export type TimeShortcut = "LAST_1H" | "LAST_24H" | "LAST_72H";

/** How health results are grouped. */
export type Granularity = "TOTAL" | "HOUR" | "DAY";

export type Device = "DESKTOP_WEB" | "MOBILE_WEB" | "SYNTHETIC" | (string & {});
export type Confidence = "HIGH" | "LOW" | (string & {});

/** One session-preparation metric row. */
export interface SessionMetric {
  scraper: HealthScraper;
  country: Country;
  device: Device;
  /** 0.0–1.0, or null when there is no data. */
  preparationSuccessRate: number | null;
  confidence: Confidence;
  avgDurationSec: number | null;
  p95DurationSec: number | null;
  avgProxyBytes: number | null;
  p95ProxyBytes: number | null;
  [extra: string]: unknown;
}

/** One scraping-task metric row. */
export interface TaskMetric {
  scraper: HealthScraper;
  country: Country;
  device: Device;
  /** e.g. PRODUCT_SEARCH, PRODUCT_DETAIL, or UNKNOWN. */
  knownApi: string;
  /** 0.0–1.0, or null when there is no data. */
  successRate: number | null;
  confidence: Confidence;
  avgDurationSec: number | null;
  p95DurationSec: number | null;
  [extra: string]: unknown;
}

export interface HealthPeriod<M> {
  startAtIncl: string;
  endAtExcl: string;
  metrics: M[];
  [extra: string]: unknown;
}

/** A health-metrics response. */
export interface HealthReport<M> {
  startAtIncl: string;
  endAtExcl: string;
  granularity: Granularity | (string & {});
  scrapers: HealthScraper[];
  countries: Country[];
  /** Task metrics only; null when not filtered. */
  knownApis?: string[] | null;
  periods: HealthPeriod<M>[];
  [extra: string]: unknown;
}

/** One protocol/port check from Validate Proxies. */
export interface ProxyTest {
  type: "http" | "https" | "http3" | "stun" | "tcp20443" | "udp20443" | (string & {});
  success: boolean;
  ipAddress?: string;
  warnings?: string[];
  errors?: string[];
  [extra: string]: unknown;
}

export interface ProxyCompatibility {
  scraper: HealthScraper;
  description: string;
  compatible: boolean;
  incompatibilityReason?: string;
  degradedPerformanceReason?: string;
  [extra: string]: unknown;
}

/** Validation result for one proxy URL. */
export interface ProxyValidation {
  url: string;
  tests: ProxyTest[];
  compatibilities: ProxyCompatibility[];
  [extra: string]: unknown;
}

export interface ProxySetting {
  type: "DATACENTER" | "RESIDENTIAL" | (string & {});
  /** Proxy URLs; `${rand(...)}` and `${country(...)}` placeholders are expanded server-side. */
  urls: string[];
  /** When set, this setting is dedicated to that country. */
  country?: Country;
  [extra: string]: unknown;
}

/** Proxy configuration for one scraper. */
export interface ProxyConfig {
  scraper: HealthScraper;
  proxySettings: ProxySetting[];
  [extra: string]: unknown;
}
