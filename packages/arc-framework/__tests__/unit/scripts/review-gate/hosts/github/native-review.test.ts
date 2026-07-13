import { describe, expect, it } from "vitest";

import type { NormalizedActor } from "../../../../../../src/scripts/review-gate/hosts/github/actor.js";
import { GitHubGraphQLClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/graphql.js";
import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import {
  reduceNativeReview,
  resolveReviewDecision,
  resolveReviews,
  resolveThreads,
  type NativeReviewReduction,
  type NativeReviewReductionInput,
  type NormalizedReview,
  type NormalizedThread,
} from "../../../../../../src/scripts/review-gate/hosts/github/native-review.js";
import { fetchFake, response, type FetchStep } from "./api/fetch-fake.js";

const HEAD = "d".repeat(40);
const OLD_HEAD = "e".repeat(40);
const AUTHOR = "9";

function actor(id: number, login = "rev"): NormalizedActor {
  return { identity: String(id), nodeId: `U_${id}`, login, kind: "user" };
}

function review(overrides: Partial<NormalizedReview> = {}): NormalizedReview {
  return {
    reviewId: "PRR_1",
    url: "https://github.test/reviews/1",
    actor: actor(2),
    state: "approved",
    commitId: HEAD,
    submittedAt: "2026-07-10T10:00:00.000Z",
    ...overrides,
  };
}

function thread(overrides: Partial<NormalizedThread> = {}): NormalizedThread {
  return { threadId: "PRRT_1", isResolved: false, resolvedBy: null, ...overrides };
}

function reduce(overrides: Partial<NativeReviewReductionInput> = {}): NativeReviewReduction {
  return reduceNativeReview({
    reviews: [], reviewDecision: null, threads: [], headSha: HEAD, authorIdentity: AUTHOR, expectsNativeReview: false,
    ...overrides,
  });
}

function restClient(steps: FetchStep[]): GitHubRestClient {
  const fake = fetchFake(steps);
  return new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 });
}

function gqlClient(steps: FetchStep[]): { gql: GitHubGraphQLClient; fake: ReturnType<typeof fetchFake> } {
  const fake = fetchFake(steps);
  return { gql: new GitHubGraphQLClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 }), fake };
}

describe("reduceNativeReview: individual reviews", () => {
  it("a current qualified approval becomes a peer approval (peer-only)", () => {
    expect(reduce({ reviews: [review({ actor: actor(2), state: "approved", commitId: HEAD })] }).peerApprovals).toEqual([
      { actorIdentity: "2", headSha: HEAD },
    ]);
  });

  it("excludes a stale approval bound to an older head", () => {
    expect(reduce({ reviews: [review({ commitId: OLD_HEAD })] }).peerApprovals).toEqual([]);
  });

  it("excludes a self-approval by the PR author", () => {
    expect(reduce({ reviews: [review({ actor: actor(9) })] }).peerApprovals).toEqual([]);
  });

  it("treats a later dismissal as clearing an earlier approval", () => {
    const result = reduce({
      reviews: [
        review({ reviewId: "a", actor: actor(2), state: "approved", submittedAt: "2026-07-10T10:00:00.000Z" }),
        review({ reviewId: "b", actor: actor(2), state: "dismissed", submittedAt: "2026-07-10T11:00:00.000Z" }),
      ],
    });
    expect(result.peerApprovals).toEqual([]);
    expect(result.nativeReview.requestedChanges).toBe(false);
  });

  it("blocks on a current requested-changes review", () => {
    expect(reduce({ reviews: [review({ state: "changes-requested" })] }).nativeReview.requestedChanges).toBe(true);
  });

  it("does not treat a commented review as an effective state", () => {
    const result = reduce({ reviews: [review({ state: "commented" })] });
    expect(result.peerApprovals).toEqual([]);
    expect(result.nativeReview.requestedChanges).toBe(false);
  });
});

describe("reduceNativeReview: aggregate decision", () => {
  it("maps the host decision only when native review is expected", () => {
    expect(reduce({ expectsNativeReview: false, reviewDecision: "changes-requested" }).nativeReview.decision).toBe("not-configured");
    expect(reduce({ expectsNativeReview: true, reviewDecision: "review-required" }).nativeReview.decision).toBe("review-required");
    expect(reduce({ expectsNativeReview: true, reviewDecision: "changes-requested" }).nativeReview.decision).toBe("changes-requested");
    expect(reduce({ expectsNativeReview: true, reviewDecision: "approved" }).nativeReview.decision).toBe("approved");
    expect(reduce({ expectsNativeReview: true, reviewDecision: null }).nativeReview.decision).toBe("unknown");
  });

  it("blocks on the host decision without manufacturing peer or Code Owner evidence", () => {
    const result = reduce({ expectsNativeReview: true, reviewDecision: "changes-requested" });
    expect(result.nativeReview.requestedChanges).toBe(true);
    expect(result.peerApprovals).toEqual([]);
  });
});

describe("reduceNativeReview: conversations and closure authority", () => {
  it("counts every unresolved thread independent of requirement count", () => {
    const result = reduce({ threads: [thread({ threadId: "T1" }), thread({ threadId: "T2" })] });
    expect(result.nativeReview.unresolvedRequiredConversations).toBe(2);
  });

  it("keeps native resolution observational even when the host exposes a resolver", () => {
    const result = reduce({
      threads: [
        thread({ threadId: "T1", isResolved: true, resolvedBy: actor(5) }),
        thread({ threadId: "T2", isResolved: false }),
      ],
    });
    expect(result.closures).toEqual([]);
    expect(result.nativeReview.unresolvedRequiredConversations).toBe(1);
  });

  it("never derives closure from a bare isResolved with no resolver", () => {
    expect(reduce({ threads: [thread({ threadId: "T1", isResolved: true, resolvedBy: null })] }).closures).toEqual([]);
  });

  it("does not let a non-closing resolver (provider bot) close a finding", () => {
    const result = reduce({
      threads: [thread({ threadId: "T1", isResolved: true, resolvedBy: actor(42) })],
      nonClosingResolvers: ["42"],
    });
    expect(result.closures).toEqual([]);
  });
});

describe("reduceNativeReview: head binding and determinism", () => {
  it("stales a native approval when the head changes", () => {
    expect(reduce({ reviews: [review({ commitId: OLD_HEAD })], headSha: HEAD }).peerApprovals).toEqual([]);
  });

  it("reconstructs the same result from the same observed state", () => {
    const input: Partial<NativeReviewReductionInput> = {
      reviews: [review({ actor: actor(2), state: "approved" })],
      threads: [thread({ threadId: "T1", isResolved: true, resolvedBy: actor(5) })],
      reviewDecision: "approved",
      expectsNativeReview: true,
    };
    expect(reduce(input)).toEqual(reduce(input));
  });
});

describe("native review fetch layer", () => {
  it("normalizes submitted reviews from the REST list", async () => {
    const payload = JSON.stringify([
      {
        node_id: "PRR_1",
        html_url: "https://github.test/reviews/1",
        user: { id: 2, node_id: "U_2", login: "rev", type: "User" },
        state: "APPROVED",
        commit_id: HEAD,
        submitted_at: "2026-07-10T10:00:00Z",
      },
    ]);
    const result = await resolveReviews(restClient([response(200, payload)]), { owner: "o", repo: "r", number: 5 });
    expect(result).toMatchObject({ kind: "ok", value: [{ reviewId: "PRR_1", state: "approved", commitId: HEAD, actor: { identity: "2" } }] });
  });

  it("normalizes the aggregate reviewDecision", async () => {
    const payload = JSON.stringify({ data: { repository: { pullRequest: { reviewDecision: "APPROVED" } } } });
    const { gql } = gqlClient([response(200, payload)]);
    expect(await resolveReviewDecision(gql, { owner: "o", repo: "r", number: 5 })).toEqual({ kind: "ok", value: "approved" });
  });

  it("normalizes review threads with resolver identity", async () => {
    const payload = JSON.stringify({
      data: { repository: { pullRequest: { reviewThreads: {
        nodes: [{ id: "T1", isResolved: true, resolvedBy: { __typename: "User", id: "U_5", databaseId: 5, login: "r" } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      } } } },
    });
    const { gql, fake } = gqlClient([response(200, payload)]);
    expect(await resolveThreads(gql, { owner: "o", repo: "r", number: 5 })).toEqual({
      kind: "ok",
      value: [{ threadId: "T1", isResolved: true, resolvedBy: { identity: "5", nodeId: "U_5", login: "r", kind: "user" } }],
    });
    const request = JSON.parse(String(fake.calls[0]?.init.body)) as { query: string };
    const resolverSelection = /resolvedBy \{([\s\S]*?)\n {10}\}/u.exec(request.query)?.[1];
    expect(resolverSelection).toContain("id databaseId login");
    expect(resolverSelection).not.toContain("... on Bot");
  });

  it.each([
    ["nodes", { nodes: null, pageInfo: { hasNextPage: false, endCursor: null } }],
    ["hasNextPage", { nodes: [], pageInfo: { hasNextPage: "false", endCursor: null } }],
    ["endCursor", { nodes: [], pageInfo: { hasNextPage: false, endCursor: 7 } }],
    ["isResolved", { nodes: [{ id: "T1", isResolved: "false", resolvedBy: null }], pageInfo: { hasNextPage: false, endCursor: null } }],
  ])("fails closed on malformed review-thread %s", async (_field, reviewThreads) => {
    const payload = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads } } } });
    const { gql } = gqlClient([response(200, payload)]);
    await expect(resolveThreads(gql, { owner: "o", repo: "r", number: 5 })).resolves.toMatchObject({
      kind: "schema-error",
    });
  });
});
