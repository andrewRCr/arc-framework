import { describe, expect, it } from "vitest";

import {
  unlockReviewHead,
  type ReviewUnlockDispatchPayload,
  type ReviewUnlockPort,
} from "../../../../src/scripts/review-gate/unlock.js";

const SHA = "a".repeat(40);

function request() {
  return {
    schemaVersion: 1 as const,
    treeRoot: "/candidate",
    target: {
      repository: "owner/repo",
      pullRequest: 42,
      headSha: SHA,
    },
    vehicle: {
      kind: "work-unit" as const,
      slug: "demo",
      archiveCadence: "manual" as const,
    },
  };
}

function readyEnvelope() {
  return {
    schemaVersion: 1 as const,
    mode: "review-readiness" as const,
    diagnostics: [],
    state: "ready" as const,
    nextAction: "none" as const,
    payload: {
      target: request().target,
      vehicle: request().vehicle,
    },
  };
}

interface FakeUnlockPort extends ReviewUnlockPort {
  dispatched: ReviewUnlockDispatchPayload[];
  inspected: Array<{ repository: string; ref: string; path: string }>;
}

function port(overrides: Partial<ReviewUnlockPort> = {}): FakeUnlockPort {
  const dispatched: ReviewUnlockDispatchPayload[] = [];
  const inspected: Array<{ repository: string; ref: string; path: string }> = [];
  return {
    dispatched,
    inspected,
    resolveRepository: async () => ({
      repository: "owner/repo",
      defaultBranch: "main",
    }),
    resolvePullRequest: async () => ({
      repository: "owner/repo",
      number: 42,
      state: "open",
      headBranch: "feat/demo",
      headSha: SHA,
    }),
    inspectWorkflow: async (input) => {
      inspected.push(input);
      return { state: "present" };
    },
    checkReadiness: async () => readyEnvelope(),
    dispatch: async (payload) => {
      dispatched.push(payload);
    },
    ...overrides,
  };
}

describe("unlockReviewHead", () => {
  it("dispatches once for the exact live head, installed workflow, and ready products", async () => {
    const boundary = port();

    const result = await unlockReviewHead(request(), boundary);

    expect(result).toMatchObject({
      mode: "review-unlock",
      state: "dispatched",
      nextAction: "await-clearance",
      payload: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: SHA,
      },
    });
    expect(boundary.dispatched).toEqual([{
      eventType: "arc-clearance",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: SHA,
      vehicle: {
        kind: "work-unit",
        slug: "demo",
        archiveCadence: "manual",
      },
    }]);
    expect(boundary.inspected).toEqual([{
      repository: "owner/repo",
      ref: "main",
      path: ".github/workflows/arc-clearance.yml",
    }]);
  });

  it("returns typed no-unlock when the canonical workflow is absent", async () => {
    const boundary = port({
      inspectWorkflow: async () => ({ state: "absent" }),
    });

    const result = await unlockReviewHead(request(), boundary);

    expect(result).toMatchObject({
      state: "no-unlock",
      nextAction: "none",
      payload: {
        reason: "workflow-absent",
      },
    });
    expect(boundary.dispatched).toEqual([]);
  });

  it.each([
    [
      "unreadable workflow",
      { inspectWorkflow: async () => ({ state: "unreadable" as const }) },
      "workflow-unreadable",
    ],
    [
      "ambiguous workflow",
      { inspectWorkflow: async () => ({ state: "ambiguous" as const }) },
      "workflow-ambiguous",
    ],
    [
      "stale head",
      { resolvePullRequest: async () => ({
        repository: "owner/repo",
        number: 42,
        state: "open" as const,
        headBranch: "feat/demo",
        headSha: "b".repeat(40),
      }) },
      "stale-head",
    ],
    [
      "closed PR",
      { resolvePullRequest: async () => ({
        repository: "owner/repo",
        number: 42,
        state: "closed" as const,
        headBranch: "feat/demo",
        headSha: SHA,
      }) },
      "pull-request-closed",
    ],
    [
      "failed readiness",
      { checkReadiness: async () => ({
        schemaVersion: 1 as const,
        mode: "review-readiness" as const,
        diagnostics: [{
          code: "missing-artifact",
          path: ".arc/active/meta-demo.md",
          message: "missing",
        }],
        state: "invalid" as const,
        nextAction: "stop" as const,
        payload: {
          target: request().target,
          vehicle: request().vehicle,
          facts: [{
            code: "missing-artifact",
            path: ".arc/active/meta-demo.md",
            message: "missing",
          }],
        },
      }) },
      "readiness-failed",
    ],
    [
      "repository mismatch",
      { resolveRepository: async () => ({
        repository: "owner/other",
        defaultBranch: "main",
      }) },
      "repository-mismatch",
    ],
  ] as const)("blocks %s without dispatch", async (_case, overrides, reason) => {
    const boundary = port(overrides);

    const result = await unlockReviewHead(request(), boundary);

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { reason },
    });
    expect(boundary.dispatched).toEqual([]);
  });
});
