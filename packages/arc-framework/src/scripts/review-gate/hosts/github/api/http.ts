/**
 * Injected HTTP transport for the GitHub host adapter.
 *
 * A version-pinned boundary over an injected `fetch`: no runtime HTTP dependency
 * is added, and every network read is bounded. Idempotent reads retry on
 * declared transient and rate-limit responses; writes are never retried, and a
 * write whose outcome cannot be observed is surfaced as `ambiguous` (it may have
 * applied) rather than silently retried or collapsed to an empty result. Token
 * material is confined to request headers the transport constructs and never
 * enters an outcome value, so it cannot reach a log, error, receipt, or
 * projection built from these results.
 *
 * @module
 */

/** REST API version pinned on every request via `X-GitHub-Api-Version`. */
export const GITHUB_REST_API_VERSION = "2022-11-28";
/** Default REST base URL for github.com. */
export const GITHUB_REST_BASE_URL = "https://api.github.com";
/** Default GraphQL endpoint for github.com. */
export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
/** User-Agent sent with every request; carries no version to avoid coupling. */
export const GITHUB_API_USER_AGENT = "arc-review-gate";

/** Total read attempts (initial plus retries) before a read fails unavailable. */
export const DEFAULT_MAX_READ_ATTEMPTS = 4;
/** Maximum pages a single connection may enumerate before failing unavailable. */
export const DEFAULT_MAX_PAGES = 100;
/** Upper bound on any single retry backoff, honoring `Retry-After` up to this cap. */
export const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;

/** Case-insensitive header accessor, satisfied by the WHATWG `Headers` type. */
export interface HttpResponseHeaders {
  get(name: string): string | null;
}

/** Minimal response shape the transport consumes, satisfied by `Response`. */
export interface HttpResponse {
  status: number;
  headers: HttpResponseHeaders;
  text(): Promise<string>;
}

/** Request initializer the transport constructs, structurally compatible with `fetch`. */
export interface HttpRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/** Injected fetch seam; production passes the Node global `fetch`. */
export type HttpFetch = (url: string, init: HttpRequestInit) => Promise<HttpResponse>;

/** Injected backoff sleep; tests pass a no-op to keep retries synchronous. */
export type SleepFn = (ms: number) => Promise<void>;

/** Configuration for a GitHub HTTP boundary bound to one installation token. */
export interface GitHubHttpConfig {
  /** Injected fetch implementation. */
  fetch: HttpFetch;
  /** Installation or read token; never surfaced in any outcome. */
  token: string;
  /** REST base URL; defaults to {@link GITHUB_REST_BASE_URL}. */
  restBaseUrl?: string;
  /** GraphQL endpoint; defaults to {@link GITHUB_GRAPHQL_URL}. */
  graphqlUrl?: string;
  /** User-Agent header; defaults to {@link GITHUB_API_USER_AGENT}. */
  userAgent?: string;
  /** Total read attempts; defaults to {@link DEFAULT_MAX_READ_ATTEMPTS}. */
  maxReadAttempts?: number;
  /** Maximum pages per connection; defaults to {@link DEFAULT_MAX_PAGES}. */
  maxPages?: number;
  /** Backoff sleep; defaults to a real timer. */
  sleep?: SleepFn;
  /** Retry-delay ceiling; defaults to {@link DEFAULT_MAX_RETRY_DELAY_MS}. */
  maxRetryDelayMs?: number;
}

/** Config with defaults applied, shared by the REST and GraphQL clients. */
export interface ResolvedGitHubHttpConfig {
  fetch: HttpFetch;
  token: string;
  restBaseUrl: string;
  graphqlUrl: string;
  userAgent: string;
  maxReadAttempts: number;
  maxPages: number;
  sleep: SleepFn;
  maxRetryDelayMs: number;
}

/** Why an idempotent read could not produce a response. */
export type UnavailableReason = "network" | "timeout" | "retry-exhausted" | "rate-limited";
/** Why a write's effect cannot be observed and must not be blindly retried. */
export type AmbiguousReason = "network" | "timeout" | "server";

/** A concrete HTTP response returned by either transport path. */
export interface TransportResponse {
  kind: "response";
  status: number;
  body: string;
  header: (name: string) => string | null;
}

/** Outcome of a bounded idempotent read: a response or a preserved unavailability. */
export type ReadTransportResult =
  | TransportResponse
  | { kind: "unavailable"; reason: UnavailableReason };

/** Outcome of a single write: a response, a pre-effect rate limit, or a preserved ambiguity. */
export type WriteTransportResult =
  | TransportResponse
  | { kind: "unavailable"; reason: "rate-limited" }
  | { kind: "ambiguous"; reason: AmbiguousReason };

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Apply configuration defaults once, up front, for a stable per-request view. */
export function resolveGitHubHttpConfig(config: GitHubHttpConfig): ResolvedGitHubHttpConfig {
  return {
    fetch: config.fetch,
    token: config.token,
    restBaseUrl: config.restBaseUrl ?? GITHUB_REST_BASE_URL,
    graphqlUrl: config.graphqlUrl ?? GITHUB_GRAPHQL_URL,
    userAgent: config.userAgent ?? GITHUB_API_USER_AGENT,
    maxReadAttempts: config.maxReadAttempts ?? DEFAULT_MAX_READ_ATTEMPTS,
    maxPages: config.maxPages ?? DEFAULT_MAX_PAGES,
    sleep: config.sleep ?? defaultSleep,
    maxRetryDelayMs: config.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
  };
}

/** Standard headers for a REST request; the only place the token is applied. */
export function restHeaders(config: ResolvedGitHubHttpConfig, write: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_REST_API_VERSION,
    "User-Agent": config.userAgent,
  };
  if (write) headers["Content-Type"] = "application/json";
  return headers;
}

/** Standard headers for a GraphQL POST; queries are treated as idempotent reads. */
export function graphqlHeaders(config: ResolvedGitHubHttpConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "User-Agent": config.userAgent,
  };
}

function transientServerStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/** Whether a response denotes a primary or secondary rate limit. */
export function isRateLimited(status: number, header: (name: string) => string | null): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  if (header("retry-after") !== null) return true;
  return header("x-ratelimit-remaining") === "0";
}

function retryAfterMs(header: (name: string) => string | null): number | null {
  const raw = header("retry-after");
  if (raw === null) return null;
  const seconds = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
}

function backoffMs(config: ResolvedGitHubHttpConfig, attempt: number, retryAfter: number | null): number {
  const exponential = Math.min(config.maxRetryDelayMs, 100 * 2 ** (attempt - 1));
  const chosen = retryAfter === null ? exponential : Math.min(config.maxRetryDelayMs, retryAfter);
  return chosen;
}

function headerAccessor(headers: HttpResponseHeaders): (name: string) => string | null {
  return (name) => headers.get(name);
}

interface CaughtNetworkFailure {
  reason: "network" | "timeout";
}

function classifyNetworkFailure(error: unknown): CaughtNetworkFailure {
  return { reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network" };
}

async function toResponse(response: HttpResponse): Promise<TransportResponse> {
  const header = headerAccessor(response.headers);
  return { kind: "response", status: response.status, body: await response.text(), header };
}

/**
 * Perform one bounded idempotent read. Transient 5xx, rate-limit, and network
 * failures retry up to {@link ResolvedGitHubHttpConfig.maxReadAttempts}, then
 * fail `unavailable` with the last reason; a definitive response (2xx or 4xx) is
 * returned without retry.
 */
export async function performRead(
  config: ResolvedGitHubHttpConfig,
  url: string,
  init: HttpRequestInit,
): Promise<ReadTransportResult> {
  let lastReason: UnavailableReason = "retry-exhausted";
  for (let attempt = 1; attempt <= config.maxReadAttempts; attempt += 1) {
    let response: HttpResponse;
    try {
      response = await config.fetch(url, init);
    } catch (error) {
      lastReason = classifyNetworkFailure(error).reason;
      if (attempt < config.maxReadAttempts) {
        await config.sleep(backoffMs(config, attempt, null));
        continue;
      }
      return { kind: "unavailable", reason: lastReason };
    }
    const header = headerAccessor(response.headers);
    const retryReason: UnavailableReason | null = isRateLimited(response.status, header)
      ? "rate-limited"
      : transientServerStatus(response.status)
        ? "retry-exhausted"
        : null;
    if (retryReason === null) return toResponse(response);
    lastReason = retryReason;
    if (attempt >= config.maxReadAttempts) return { kind: "unavailable", reason: retryReason };
    await config.sleep(backoffMs(config, attempt, retryAfterMs(header)));
  }
  return { kind: "unavailable", reason: lastReason };
}

/**
 * Perform exactly one write attempt. A definitive response (including a
 * pre-effect 4xx) is returned as-is; a rate-limit rejection is `unavailable`
 * (not applied); a network error or transient 5xx — where the write may have
 * applied — is `ambiguous` so the caller reconciles by idempotency identity
 * rather than re-sending.
 */
export async function performWrite(
  config: ResolvedGitHubHttpConfig,
  url: string,
  init: HttpRequestInit,
): Promise<WriteTransportResult> {
  let response: HttpResponse;
  try {
    response = await config.fetch(url, init);
  } catch (error) {
    return { kind: "ambiguous", reason: classifyNetworkFailure(error).reason };
  }
  const header = headerAccessor(response.headers);
  if (isRateLimited(response.status, header)) return { kind: "unavailable", reason: "rate-limited" };
  if (transientServerStatus(response.status)) return { kind: "ambiguous", reason: "server" };
  return toResponse(response);
}
