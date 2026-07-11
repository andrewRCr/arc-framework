import { describe, expect, it } from "vitest";

import { GitHubGraphQLClient, type GraphQLPage } from "../../../../../../../src/scripts/review-gate/hosts/github/api/graphql.js";
import { fetchFake, networkError, response, type FetchStep } from "./fetch-fake.js";

const TOKEN = "ghs_secretinstallationtoken000000000000";

function client(steps: FetchStep[]): { gql: GitHubGraphQLClient; fake: ReturnType<typeof fetchFake> } {
  const fake = fetchFake(steps);
  const gql = new GitHubGraphQLClient({ fetch: fake.fetch, token: TOKEN, sleep: fake.sleep, maxReadAttempts: 1 });
  return { gql, fake };
}

interface Node {
  id: string;
}

function extractPage(data: unknown): GraphQLPage<Node> {
  const connection = (data as { repository?: { pullRequest?: { threads?: unknown } } }).repository?.pullRequest?.threads;
  const record = connection as {
    nodes?: Array<{ id?: unknown }>;
    pageInfo?: { hasNextPage?: unknown; endCursor?: unknown };
  };
  return {
    nodes: (record.nodes ?? []).map((node) => ({ id: String(node.id) })),
    hasNextPage: record.pageInfo?.hasNextPage === true,
    endCursor: typeof record.pageInfo?.endCursor === "string" ? record.pageInfo.endCursor : null,
  };
}

function page(nodes: string[], hasNextPage: boolean, endCursor: string | null): string {
  return JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          threads: { nodes: nodes.map((id) => ({ id })), pageInfo: { hasNextPage, endCursor } },
        },
      },
    },
  });
}

describe("GitHubGraphQLClient.query", () => {
  it("validates data through the parser", async () => {
    const { gql } = client([response(200, "{\"data\":{\"reviewDecision\":\"APPROVED\"}}")]);
    const result = await gql.query({
      query: "query { reviewDecision }",
      parse: (data) => (data as { reviewDecision: string }).reviewDecision,
    });
    expect(result).toEqual({ kind: "ok", value: "APPROVED" });
  });

  it("treats a non-empty errors array as a failure, not empty success", async () => {
    const { gql } = client([response(200, "{\"data\":null,\"errors\":[{\"message\":\"Bad credentials\"}]}")]);
    expect(await gql.query({ query: "q", parse: () => null })).toEqual({
      kind: "graphql-error",
      message: "Bad credentials",
    });
  });

  it("reports missing data as a graphql error", async () => {
    const { gql } = client([response(200, "{\"data\":null}")]);
    expect(await gql.query({ query: "q", parse: () => null })).toMatchObject({ kind: "graphql-error" });
  });

  it("propagates a transport-unavailable outcome", async () => {
    const { gql } = client([networkError()]);
    expect(await gql.query({ query: "q", parse: () => null })).toEqual({ kind: "unavailable", reason: "network" });
  });

  it("reports a non-2xx transport response as an http error", async () => {
    const { gql } = client([response(401, "Unauthorized")]);
    expect(await gql.query({ query: "q", parse: () => null })).toMatchObject({ kind: "http-error", status: 401 });
  });

  it("keeps the token out of the outcome", async () => {
    const { gql } = client([response(200, "{\"errors\":[{\"message\":\"x\"}]}")]);
    expect(JSON.stringify(await gql.query({ query: "q", parse: () => null }))).not.toContain(TOKEN);
  });
});

describe("GitHubGraphQLClient.paginate", () => {
  it("enumerates every page, threading the endCursor forward", async () => {
    const { gql, fake } = client([response(200, page(["a"], true, "CUR1")), response(200, page(["b", "c"], false, null))]);
    const result = await gql.paginate({ query: "q", extractPage });
    expect(result).toEqual({ kind: "ok", value: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    const secondBody = JSON.parse(fake.calls[1]?.init.body ?? "{}") as { variables?: { cursor?: unknown } };
    expect(secondBody.variables?.cursor).toBe("CUR1");
  });

  it("fails schema-error when a further page advertises no endCursor", async () => {
    const { gql } = client([response(200, page(["a"], true, null))]);
    expect(await gql.paginate({ query: "q", extractPage })).toMatchObject({ kind: "schema-error" });
  });
});
