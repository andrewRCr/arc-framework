/**
 * Version-pinned REST client over the injected HTTP transport.
 *
 * Reads validate every response body through a caller-supplied parser and fully
 * enumerate `Link`-paginated connections, failing `unavailable` on incomplete
 * enumeration or an enumeration cap rather than returning a partial page. Writes
 * make a single transport attempt: a definitive HTTP rejection or rate limit is
 * reported without retry, while an ambiguous outcome (the write may have applied)
 * is reconciled by an optional idempotency-identity re-query supplied by the
 * caller. Error bodies are reduced to a sanitized message; request headers, which
 * carry the token, never enter an outcome.
 *
 * @module
 */

import {
  performRead,
  performWrite,
  resolveGitHubHttpConfig,
  restHeaders,
  type AmbiguousReason,
  type GitHubHttpConfig,
  type ResolvedGitHubHttpConfig,
  type UnavailableReason,
} from "./http.js";

/** Why a read could not yield a validated value. */
export type ReadUnavailableReason = UnavailableReason | "enumeration-cap";

/** Result of a validated REST read. */
export type ReadOutcome<T> =
  | { kind: "ok"; status: number; value: T }
  | { kind: "http-error"; status: number; message: string }
  | { kind: "schema-error"; message: string }
  | { kind: "unavailable"; reason: ReadUnavailableReason };

/** Result of a single REST write attempt. */
export type WriteOutcome<T> =
  | { kind: "ok"; status: number; value: T }
  | { kind: "http-error"; status: number; message: string }
  | { kind: "rate-limited" }
  | { kind: "schema-error"; message: string }
  | { kind: "ambiguous"; reason: AmbiguousReason };

/** Query values appended to a REST URL. */
export type RestQuery = Record<string, string | number>;

/** A validated read, including a page-item extractor for list endpoints. */
export interface ReadRequest<T> {
  query?: RestQuery;
  parse: (value: unknown) => T;
}

/** A paginated read that concatenates validated items across every page. */
export interface PaginatedRequest<T> {
  query?: RestQuery;
  parsePage: (value: unknown) => T[];
}

/** A single write attempt with an optional idempotency reconcile. */
export interface WriteRequest<T> {
  body?: unknown;
  parse: (value: unknown) => T;
  /**
   * Re-query the write's effect by its stable idempotency identity. Invoked only
   * when the transport reports the write ambiguous; a concrete value resolves the
   * write as applied, anything else leaves it ambiguous (never a blind resend).
   */
  reconcile?: () => Promise<ReadOutcome<T | null>>;
}

const MAX_ERROR_MESSAGE_LENGTH = 200;

function sanitizeErrorBody(body: string): string {
  let text = body;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed !== null && typeof parsed === "object" && "message" in parsed) {
      const message: unknown = parsed.message;
      if (typeof message === "string") text = message;
    }
  } catch {
    // Non-JSON body — fall back to a bounded snippet below.
  }
  const collapsed = text.replace(/\s+/gu, " ").trim();
  return collapsed.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${collapsed.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : collapsed;
}

function parseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}

function successful(status: number): boolean {
  return status >= 200 && status < 300;
}

function parseNextLink(header: string | null): string | null {
  if (header === null) return null;
  for (const segment of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/u.exec(segment);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

function withQuery(url: string, query: RestQuery | undefined): string {
  if (query === undefined) return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, String(value));
  return parsed.toString();
}

/** A version-pinned REST client bound to one installation or read token. */
export class GitHubRestClient {
  private readonly config: ResolvedGitHubHttpConfig;

  constructor(config: GitHubHttpConfig) {
    this.config = resolveGitHubHttpConfig(config);
  }

  private restUrl(path: string): string {
    return path.startsWith("http") ? path : `${this.config.restBaseUrl}${path}`;
  }

  /** Read and validate a single resource. */
  async get<T>(path: string, request: ReadRequest<T>): Promise<ReadOutcome<T>> {
    const url = withQuery(this.restUrl(path), request.query);
    return this.readValidated(url, request.parse);
  }

  private async readValidated<T>(url: string, parse: (value: unknown) => T): Promise<ReadOutcome<T>> {
    const result = await performRead(this.config, url, {
      method: "GET",
      headers: restHeaders(this.config, false),
    });
    if (result.kind !== "response") return { kind: "unavailable", reason: result.reason };
    if (!successful(result.status)) {
      return { kind: "http-error", status: result.status, message: sanitizeErrorBody(result.body) };
    }
    const json = parseJson(result.body);
    if (!json.ok) return { kind: "schema-error", message: "response body is not valid JSON" };
    try {
      return { kind: "ok", status: result.status, value: parse(json.value) };
    } catch (error) {
      return { kind: "schema-error", message: error instanceof Error ? error.message : "invalid response schema" };
    }
  }

  /** Read and validate every page of a `Link`-paginated connection. */
  async getPaginated<T>(path: string, request: PaginatedRequest<T>): Promise<ReadOutcome<T[]>> {
    const items: T[] = [];
    let url: string | null = withQuery(this.restUrl(path), request.query);
    for (let page = 0; url !== null; page += 1) {
      if (page >= this.config.maxPages) return { kind: "unavailable", reason: "enumeration-cap" };
      const result = await performRead(this.config, url, {
        method: "GET",
        headers: restHeaders(this.config, false),
      });
      if (result.kind !== "response") return { kind: "unavailable", reason: result.reason };
      if (!successful(result.status)) {
        return { kind: "http-error", status: result.status, message: sanitizeErrorBody(result.body) };
      }
      const json = parseJson(result.body);
      if (!json.ok) return { kind: "schema-error", message: "response body is not valid JSON" };
      try {
        items.push(...request.parsePage(json.value));
      } catch (error) {
        return { kind: "schema-error", message: error instanceof Error ? error.message : "invalid response schema" };
      }
      url = parseNextLink(result.header("link"));
    }
    return { kind: "ok", status: 200, value: items };
  }

  /** Perform one write, reconciling an ambiguous outcome by idempotency identity. */
  async write<T>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, request: WriteRequest<T>): Promise<WriteOutcome<T>> {
    const result = await performWrite(this.config, this.restUrl(path), {
      method,
      headers: restHeaders(this.config, true),
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    if (result.kind === "unavailable") return { kind: "rate-limited" };
    if (result.kind === "ambiguous") return this.reconcileWrite(result.reason, request.reconcile);
    if (!successful(result.status)) {
      return { kind: "http-error", status: result.status, message: sanitizeErrorBody(result.body) };
    }
    const json = parseJson(result.body);
    if (!json.ok) return { kind: "schema-error", message: "response body is not valid JSON" };
    try {
      return { kind: "ok", status: result.status, value: request.parse(json.value) };
    } catch (error) {
      return { kind: "schema-error", message: error instanceof Error ? error.message : "invalid response schema" };
    }
  }

  private async reconcileWrite<T>(
    reason: AmbiguousReason,
    reconcile: (() => Promise<ReadOutcome<T | null>>) | undefined,
  ): Promise<WriteOutcome<T>> {
    if (reconcile === undefined) return { kind: "ambiguous", reason };
    const found = await reconcile();
    if (found.kind === "ok" && found.value !== null) return { kind: "ok", status: found.status, value: found.value };
    return { kind: "ambiguous", reason };
  }
}
