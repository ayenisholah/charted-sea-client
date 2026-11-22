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
