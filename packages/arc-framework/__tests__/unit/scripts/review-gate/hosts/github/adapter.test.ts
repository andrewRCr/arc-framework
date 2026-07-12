import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import type { GateProjection } from "../../../../../../src/scripts/review-gate/core/execution.js";
import {
  GitHubHostAdapter,
  GitHubHostReadAdapter,
  GitHubHostReadError,
  type GitHubHostReadFunctions,
} from "../../../../../../src/scripts/review-gate/hosts/github/adapter.js";
import type { GitHubGraphQLClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/graphql.js";
import type { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import type {
  CheckRunMutation,
  GitHubCheckRun,
  GitHubCheckRunApi,
} from "../../../../../../src/scripts/review-gate/hosts/github/check-runs.js";

const HEAD = "c".repeat(40);
const changeRequest = {
  schemaVersion: 1 as const,
  repositoryId: "100",
  changeRequestId: "PR_node",
  hostRef: "github:o/r/pull/7",
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: "b".repeat(40),
  headSha: HEAD,
  changeSetId: "d".repeat(64),
};

function adapter(functions: Partial<GitHubHostReadFunctions> = {}): GitHubHostReadAdapter {
  return new GitHubHostReadAdapter({
    rest: {} as GitHubRestClient,
    gql: {} as GitHubGraphQLClient,
    exec: (async () => ({ stdout: "" })) as GitExec,
    owner: "o",
    repo: "r",
    baseRemote: "origin",
  }, {
    resolveChangeRequest: async () => ({
      kind: "resolved",
      changeRequest,
      context: {
        changedPaths: [{ status: "modified", path: "src/a.ts" }],
        author: { identity: "7", nodeId: "U_7", login: "author", kind: "user" },
        isDraft: false,
        isCrossRepository: false,
        mergeability: "mergeable",
      },
    }),
    resolveActorCapabilities: async () => ({
      kind: "resolved",
      actor: { identity: "7", nodeId: "U_7", login: "author", kind: "user" },
      capabilities: { schemaVersion: 1, actorIdentity: "7", permissions: ["write"] },
    }),
    resolveReviews: async () => ({
      kind: "ok",
      status: 200,
      value: [{
        reviewId: "PRR_1",
        url: "https://github.test/reviews/1",
        actor: { identity: "42", nodeId: "BOT_42", login: "provider[bot]", kind: "bot" },
        state: "approved",
        commitId: HEAD,
        submittedAt: "2026-07-11T20:00:00.000Z",
      }],
    }),
    resolveReviewDecision: async () => ({ kind: "ok", value: "approved" }),
    resolveThreads: async () => ({
      kind: "ok",
      value: [{
        threadId: "T_1",
        isResolved: true,
        resolvedBy: { identity: "9", nodeId: "U_9", login: "resolver", kind: "user" },
      }],
    }),
    ...functions,
  });
}

function projection(): GateProjection {
  return {
    schemaVersion: 1,
    conclusion: "success",
    summary: "independent-analysis: clean",
    blockers: [],
    requirementExecutions: [{
      requirementId: "independent-analysis",
      state: "clean",
      sourceIdentity: "codex-cli",
      detail: "non-blocking",
    }],
    receiptRefs: [],
    policyDecision: {
      lane: "reviewed",
      reviewRisk: "sensitive",
      disposition: "required",
      reasons: ["code-surface"],
      policyVersion: "e".repeat(64),
    },
    ciState: "success",
    ledgerVersion: 1,
    evidence: [],
  };
}

class MemoryChecks implements GitHubCheckRunApi {
  readonly mutations: CheckRunMutation[] = [];
  readonly updatedIds: number[] = [];

  constructor(private readonly existing: GitHubCheckRun[] = []) {}

  async list(): Promise<GitHubCheckRun[]> {
    return this.existing;
  }

  async create(value: CheckRunMutation): Promise<GitHubCheckRun> {
    this.mutations.push(value);
    return {
      id: this.mutations.length,
      nodeId: `CR_${this.mutations.length}`,
      name: value.name,
      externalId: value.externalId,
      appId: "4268856",
      status: value.status,
      conclusion: value.conclusion,
      createdAt: "2026-07-11T20:00:00.000Z",
      htmlUrl: `https://github.test/checks/${this.mutations.length}`,
    };
  }

  async update(id: number, value: CheckRunMutation): Promise<GitHubCheckRun> {
    this.updatedIds.push(id);
    this.mutations.push(value);
    return {
      id,
      nodeId: `CR_${id}`,
      name: value.name,
      externalId: value.externalId,
      appId: "4268856",
      status: value.status,
      conclusion: value.conclusion,
      createdAt: "2026-07-11T20:00:00.000Z",
      htmlUrl: `https://github.test/checks/${id}`,
    };
  }
}

function fullAdapter(checks: GitHubCheckRunApi): GitHubHostAdapter {
  return new GitHubHostAdapter({
    rest: {} as GitHubRestClient,
    gql: {} as GitHubGraphQLClient,
    exec: (async () => ({ stdout: "" })) as GitExec,
    owner: "o",
    repo: "r",
    baseRemote: "origin",
  }, checks);
}

describe("GitHub host read adapter", () => {
  it("returns the full normalized change and policy/readiness context", async () => {
    await expect(adapter().resolveChangeRequest(changeRequest.hostRef)).resolves.toEqual({
      changeRequest,
      context: {
        changedPaths: [{ status: "modified", path: "src/a.ts" }],
        author: { identity: "7", login: "author" },
        isDraft: false,
        isCrossRepository: false,
        mergeability: "mergeable",
      },
    });
  });

  it("resolves login-addressed capability while retaining immutable identity", async () => {
    await expect(adapter().resolveActorCapabilities({ login: "author", expectedActorId: "7" })).resolves.toEqual({
      schemaVersion: 1,
      actorIdentity: "7",
      permissions: ["write"],
    });
  });

  it("preserves aggregate review, approvals, closures, and provider dispositions without evidence synthesis", async () => {
    const result = await adapter().observeNativeReview({
      hostRef: changeRequest.hostRef,
      headSha: HEAD,
      authorIdentity: "7",
      expectsNativeReview: true,
    });

    expect(result).toMatchObject({
      nativeReview: { decision: "approved", requestedChanges: false },
      peerApprovals: [{ actorIdentity: "42", headSha: HEAD }],
      closures: [{ findingId: "T_1", authorityIdentity: "9" }],
      providerReviews: [{
        reviewId: "PRR_1",
        actorIdentity: "42",
        state: "approved",
        evidenceRef: "https://github.test/reviews/1",
      }],
    });
    expect(result).not.toHaveProperty("evidence");
  });

  it("fails closed on leaf errors and references outside the pinned repository", async () => {
    const unavailable = adapter({ resolveChangeRequest: async () => ({ kind: "unavailable", reason: "network" }) });
    await expect(unavailable.resolveChangeRequest(changeRequest.hostRef)).rejects.toBeInstanceOf(GitHubHostReadError);
    await expect(adapter().resolveChangeRequest("github:other/r/pull/7")).rejects.toMatchObject({
      code: "host-ref-outside-pinned-scope",
    });
  });
});

describe("GitHub verdict publication", () => {
  it.each([
    ["shadow", ["review-gate-shadow"]],
    ["dual", ["review-gate-shadow", "merge-ok"]],
    ["final", ["merge-ok"]],
  ] as const)("publishes the %s context set without changing verdict content", async (mode, names) => {
    const checks = new MemoryChecks();
    const refs = await fullAdapter(checks).publishVerdict({
      hostRef: changeRequest.hostRef,
      headSha: changeRequest.headSha,
      changeSetId: changeRequest.changeSetId,
      projection: projection(),
      mode,
      expectedAppId: "4268856",
      anchorReceiptCount: 1,
      readCurrentState: async () => ({
        headSha: changeRequest.headSha,
        changeSetId: changeRequest.changeSetId,
      }),
    });

    expect(checks.mutations.map((mutation) => mutation.name)).toEqual(names);
    expect(checks.mutations.every((mutation) => mutation.output.summary.includes("independent-analysis: clean")))
      .toBe(true);
    expect(refs).toHaveLength(names.length);
  });

  it("fails closed without a write when canonical state moved", async () => {
    const checks = new MemoryChecks();
    await expect(fullAdapter(checks).publishVerdict({
      hostRef: changeRequest.hostRef,
      headSha: changeRequest.headSha,
      changeSetId: changeRequest.changeSetId,
      projection: projection(),
      mode: "shadow",
      expectedAppId: "4268856",
      anchorReceiptCount: 1,
      readCurrentState: async () => ({ headSha: "f".repeat(40), changeSetId: changeRequest.changeSetId }),
    })).rejects.toMatchObject({ code: "stale-writer" });
    expect(checks.mutations).toEqual([]);
  });

  it("updates an existing authoritative check run", async () => {
    const existing: GitHubCheckRun = {
      id: 41,
      nodeId: "CR_41",
      name: "review-gate-shadow",
      externalId: `arc-review-gate:7:${changeRequest.changeSetId}:review-gate-shadow`,
      appId: "4268856",
      status: "in_progress",
      conclusion: null,
      createdAt: "2026-07-11T19:00:00.000Z",
      htmlUrl: "https://github.test/checks/41",
    };
    const checks = new MemoryChecks([existing]);
    await expect(fullAdapter(checks).publishVerdict({
      hostRef: changeRequest.hostRef,
      headSha: changeRequest.headSha,
      changeSetId: changeRequest.changeSetId,
      projection: projection(),
      mode: "shadow",
      expectedAppId: "4268856",
      anchorReceiptCount: 1,
      readCurrentState: async () => ({
        headSha: changeRequest.headSha,
        changeSetId: changeRequest.changeSetId,
      }),
    })).resolves.toEqual([{ opaqueRef: "https://github.test/checks/41" }]);
    expect(checks.updatedIds).toEqual([41]);
  });

  it("revalidates each dual-mode write and rejects a partially stale batch", async () => {
    const checks = new MemoryChecks();
    let reads = 0;
    await expect(fullAdapter(checks).publishVerdict({
      hostRef: changeRequest.hostRef,
      headSha: changeRequest.headSha,
      changeSetId: changeRequest.changeSetId,
      projection: projection(),
      mode: "dual",
      expectedAppId: "4268856",
      anchorReceiptCount: 1,
      readCurrentState: async () => {
        reads += 1;
        return reads === 1
          ? { headSha: changeRequest.headSha, changeSetId: changeRequest.changeSetId }
          : { headSha: "f".repeat(40), changeSetId: changeRequest.changeSetId };
      },
    })).rejects.toMatchObject({ code: "stale-writer" });
    expect(reads).toBe(2);
    expect(checks.mutations).toHaveLength(1);
  });
});
