/**
 * Paginated GraphQL client over the injected HTTP transport.
 *
 * GraphQL queries are idempotent reads, so they inherit the transport's bounded
 * retry. A non-empty `errors` array is a failure, never an empty success, and
 * cursor pagination enumerates every page or fails `unavailable` — a partial
 * connection cannot masquerade as complete. Only queries are exposed; the client
 * offers no mutation path, so a retryable read can never re-send a write.
 *
 * @module
 */

import {
  graphqlHeaders,
  performRead,
  resolveGitHubHttpConfig,
  type GitHubHttpConfig,
  type ResolvedGitHubHttpConfig,
  type UnavailableReason,
} from "./http.js";

/** Why a GraphQL read could not yield a validated value. */
export type GraphQLUnavailableReason = UnavailableReason | "enumeration-cap";

/** Result of a validated GraphQL read. */
export type GraphQLOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "graphql-error"; message: string }
  | { kind: "http-error"; status: number; message: string }
  | { kind: "schema-error"; message: string }
  | { kind: "unavailable"; reason: GraphQLUnavailableReason };

/** A single GraphQL query and its variables. */
export interface GraphQLQuery<T> {
  query: string;
  variables?: Record<string, unknown>;
  parse: (data: unknown) => T;
}

/** One page of a cursor-paginated connection. */
export interface GraphQLPage<TNode> {
  nodes: TNode[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/** A cursor-paginated query; `$cursor` is supplied per page. */
export interface GraphQLPaginatedQuery<TNode> {
  query: string;
  variables?: Record<string, unknown>;
  extractPage: (data: unknown) => GraphQLPage<TNode>;
}

const MAX_ERROR_MESSAGE_LENGTH = 200;

function boundMessage(text: string): string {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  return collapsed.length > MAX_ERROR_MESSAGE_LENGTH ? `${collapsed.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : collapsed;
}

function collectGraphQLErrors(value: unknown): string | null {
  if (value === null || typeof value !== "object" || !("errors" in value)) return null;
  const errors: unknown = value.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const messages = errors.map((entry) => {
    if (entry !== null && typeof entry === "object" && "message" in entry) {
      const message = (entry as { message: unknown }).message;
      if (typeof message === "string") return message;
    }
    return "unknown GraphQL error";
  });
  return boundMessage(messages.join("; "));
}

/** A GraphQL client bound to one installation or read token. */
export class GitHubGraphQLClient {
  private readonly config: ResolvedGitHubHttpConfig;

  constructor(config: GitHubHttpConfig) {
    this.config = resolveGitHubHttpConfig(config);
  }

  private async execute(query: string, variables: Record<string, unknown>): Promise<
    | { kind: "data"; data: unknown }
    | { kind: "graphql-error"; message: string }
    | { kind: "http-error"; status: number; message: string }
    | { kind: "unavailable"; reason: UnavailableReason }
  > {
    const result = await performRead(this.config, this.config.graphqlUrl, {
      method: "POST",
      headers: graphqlHeaders(this.config),
      body: JSON.stringify({ query, variables }),
    });
    if (result.kind !== "response") return { kind: "unavailable", reason: result.reason };
    if (result.status < 200 || result.status >= 300) {
      return { kind: "http-error", status: result.status, message: boundMessage(result.body) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.body) as unknown;
    } catch {
      return { kind: "graphql-error", message: "response body is not valid JSON" };
    }
    const errorMessage = collectGraphQLErrors(parsed);
    if (errorMessage !== null) return { kind: "graphql-error", message: errorMessage };
    const data: unknown = parsed !== null && typeof parsed === "object" && "data" in parsed
      ? parsed.data
      : undefined;
    if (data === undefined || data === null) return { kind: "graphql-error", message: "response carried no data" };
    return { kind: "data", data };
  }

  /** Run one query and validate its `data`. */
  async query<T>(request: GraphQLQuery<T>): Promise<GraphQLOutcome<T>> {
    const result = await this.execute(request.query, request.variables ?? {});
    if (result.kind !== "data") return result;
    try {
      return { kind: "ok", value: request.parse(result.data) };
    } catch (error) {
      return { kind: "schema-error", message: error instanceof Error ? error.message : "invalid response schema" };
    }
  }

  /** Enumerate every page of a cursor-paginated connection. */
  async paginate<TNode>(request: GraphQLPaginatedQuery<TNode>): Promise<GraphQLOutcome<TNode[]>> {
    const nodes: TNode[] = [];
    let cursor: string | null = null;
    for (let page = 0; ; page += 1) {
      if (page >= this.config.maxPages) return { kind: "unavailable", reason: "enumeration-cap" };
      const result = await this.execute(request.query, { ...request.variables, cursor });
      if (result.kind !== "data") return result;
      let extracted: GraphQLPage<TNode>;
      try {
        extracted = request.extractPage(result.data);
      } catch (error) {
        return { kind: "schema-error", message: error instanceof Error ? error.message : "invalid response schema" };
      }
      nodes.push(...extracted.nodes);
      if (!extracted.hasNextPage) return { kind: "ok", value: nodes };
      if (extracted.endCursor === null) return { kind: "schema-error", message: "missing endCursor on a further page" };
      cursor = extracted.endCursor;
    }
  }
}
