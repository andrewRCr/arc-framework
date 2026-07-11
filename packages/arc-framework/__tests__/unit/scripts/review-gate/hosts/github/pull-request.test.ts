import { describe, expect, it } from "vitest";

import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import { parsePullRequest, resolvePullRequestFacts } from "../../../../../../src/scripts/review-gate/hosts/github/pull-request.js";
import { fetchFake, response } from "./api/fetch-fake.js";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);

function prPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    node_id: "PR_kwDOABC",
    number: 42,
    draft: false,
    mergeable: true,
    base: { ref: "main", sha: BASE_SHA, repo: { id: 100, node_id: "R_base" } },
    head: { ref: "feature", sha: HEAD_SHA, repo: { id: 100, node_id: "R_base" } },
    user: { id: 7, node_id: "U_author", login: "andrewRCr", type: "User" },
    ...overrides,
  };
}

describe("parsePullRequest", () => {
  it("binds immutable ids and validated SHAs for a same-repo PR", () => {
    expect(parsePullRequest(prPayload())).toEqual({
      repositoryId: "100",
      changeRequestId: "PR_kwDOABC",
      number: 42,
      baseRef: "main",
      baseSha: BASE_SHA,
      headRef: "feature",
      headSha: HEAD_SHA,
      headRepositoryId: "100",
      isCrossRepository: false,
      isDraft: false,
      mergeability: "mergeable",
      author: { identity: "7", nodeId: "U_author", login: "andrewRCr", kind: "user" },
    });
  });

  it("marks a distinct head repository cross-repository", () => {
    const facts = parsePullRequest(prPayload({ head: { ref: "f", sha: HEAD_SHA, repo: { id: 200, node_id: "R_fork" } } }));
    expect(facts.headRepositoryId).toBe("200");
    expect(facts.isCrossRepository).toBe(true);
  });

  it("marks a deleted head repository cross-repository with a null id", () => {
    const facts = parsePullRequest(prPayload({ head: { ref: "f", sha: HEAD_SHA, repo: null } }));
    expect(facts.headRepositoryId).toBeNull();
    expect(facts.isCrossRepository).toBe(true);
  });

  it("normalizes mergeability from the async merge computation", () => {
    expect(parsePullRequest(prPayload({ mergeable: false })).mergeability).toBe("conflicting");
    expect(parsePullRequest(prPayload({ mergeable: null })).mergeability).toBe("unknown");
  });

  it("carries draft readiness", () => {
    expect(parsePullRequest(prPayload({ draft: true })).isDraft).toBe(true);
  });

  it("rejects a non-40-hex head SHA", () => {
    expect(() => parsePullRequest(prPayload({ head: { ref: "f", sha: "not-a-sha", repo: { id: 100, node_id: "R" } } }))).toThrow();
  });

  it("rejects a missing base repo id", () => {
    expect(() => parsePullRequest(prPayload({ base: { ref: "main", sha: BASE_SHA, repo: { node_id: "R" } } }))).toThrow();
  });
});

describe("resolvePullRequestFacts", () => {
  it("reads and validates facts through the REST client", async () => {
    const fake = fetchFake([response(200, JSON.stringify(prPayload()))]);
    const rest = new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 });
    const result = await resolvePullRequestFacts(rest, { owner: "andrewRCr", repo: "arc-framework", number: 42 });
    expect(result).toMatchObject({ kind: "ok", value: { changeRequestId: "PR_kwDOABC" } });
    expect(fake.calls[0]?.url).toBe("https://api.github.com/repos/andrewRCr/arc-framework/pulls/42");
  });

  it("propagates a not-found PR as an HTTP error", async () => {
    const fake = fetchFake([response(404, "{\"message\":\"Not Found\"}")]);
    const rest = new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 });
    expect(await resolvePullRequestFacts(rest, { owner: "o", repo: "r", number: 1 })).toMatchObject({
      kind: "http-error",
      status: 404,
    });
  });
});
