import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../../src/lib/git/exec.js";
import type { GateProjection } from "../../../../../src/scripts/review-gate/core/execution.js";
import type { HttpFetch } from "../../../../../src/scripts/review-gate/hosts/github/api/http.js";
import { SELF_HOSTING_POLICY } from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";
import type {
  CompositionIo,
  ReconcileComposition,
  ReconcileRuntimeConfig,
} from "../../../../../src/scripts/review-gate/runtime/composition.js";
import type { CanonicalReconcileState, ReconcileRuntime } from "../../../../../src/scripts/review-gate/runtime/reconcile.js";
import {
  runReconcileMain,
  type ReconcileMainDependencies,
  type ReconcileMainEnv,
} from "../../../../../src/scripts/review-gate/runtime/reconcile-main.js";

const NOW = new Date("2026-07-11T20:00:00.000Z");

const state: CanonicalReconcileState = {
  repositoryId: 100,
  pullRequestNumber: 7,
  headSha: "a".repeat(40),
  policyVersion: "p",
  permissionVersion: "m",
  ledgerVersion: 0,
};

const projection: GateProjection = {
  schemaVersion: 1,
  conclusion: "pending",
  summary: "pending",
  blockers: [],
  requirementExecutions: [],
  receiptRefs: [],
  policyDecision: { lane: "reviewed", reviewRisk: "routine", disposition: "required", reasons: [], policyVersion: "b".repeat(64) },
  ciState: "pending",
  ledgerVersion: 0,
  evidence: [],
};

const fakeRuntime: ReconcileRuntime = {
  read: async () => state,
  reduce: async () => ({ request: null, projection }),
  reserve: async () => null,
  confirmPending: async () => false,
  execute: async () => ({ status: "acknowledged", invoked: true }),
  publish: async () => undefined,
};

function baseEnv(overrides: Partial<ReconcileMainEnv> = {}): ReconcileMainEnv {
  return {
    GITHUB_REPOSITORY: "o/r",
    ARC_REPOSITORY_ID: "100",
    ARC_PULL_REQUEST_NUMBER: "7",
    ARC_REVIEW_GATE_APP_ID: "4268856",
    ARC_APP_TOKEN: "ghs_apptoken",
    ARC_APP_SLUG: "arc-review-gate",
    GITHUB_TOKEN: "ghs_readtoken",
    REVIEW_GATE_CONTEXT_MODE: "shadow",
    ...overrides,
  };
}

function harness() {
  const captured: { config?: ReconcileRuntimeConfig; io?: CompositionIo } = {};
  const sentinelExec = (async () => ({ stdout: "" })) as GitExec;
  const fetchSeam = (async () => ({ status: 200, headers: { get: () => null }, text: async () => "" })) as HttpFetch;
  const createGitExec = vi.fn(() => sentinelExec);
  const createRuntime = vi.fn(async (config: ReconcileRuntimeConfig, io: CompositionIo) => {
    captured.config = config;
    captured.io = io;
    return { runtime: fakeRuntime } as unknown as ReconcileComposition;
  });
  const deps: ReconcileMainDependencies = {
    createRuntime,
    fetch: fetchSeam,
    createGitExec,
    policy: SELF_HOSTING_POLICY,
    now: NOW,
  };
  return { deps, captured, createGitExec, createRuntime, sentinelExec, fetchSeam };
}

describe("runReconcileMain", () => {
  it("resolves the environment into a composition config and reports the reconcile status", async () => {
    const { deps, captured, createGitExec, sentinelExec, fetchSeam } = harness();

    const result = await runReconcileMain(baseEnv(), deps);

    expect(result).toEqual({ status: "published", effectInvoked: false });
    expect(captured.config).toMatchObject({
      owner: "o",
      repo: "r",
      repositoryId: 100,
      pullRequestNumber: 7,
      appToken: "ghs_apptoken",
      appSlug: "arc-review-gate",
      expectedAppId: "4268856",
      mode: "shadow",
    });
    expect(createGitExec).toHaveBeenCalledWith("ghs_readtoken");
    expect(captured.io?.exec).toBe(sentinelExec);
    expect(captured.io?.fetch).toBe(fetchSeam);
  });

  it.each([
    ["shadow default when unset", { REVIEW_GATE_CONTEXT_MODE: undefined }, "shadow"],
    ["dual when configured", { REVIEW_GATE_CONTEXT_MODE: "dual" }, "dual"],
  ])("parses context mode: %s", async (_name, overrides, mode) => {
    const { deps, captured } = harness();
    await runReconcileMain(baseEnv(overrides), deps);
    expect(captured.config?.mode).toBe(mode);
  });

  it.each([
    ["missing app slug", { ARC_APP_SLUG: undefined }, /missing-environment:ARC_APP_SLUG/u],
    ["missing git read token", { GITHUB_TOKEN: undefined }, /missing-environment:GITHUB_TOKEN/u],
    ["malformed repository", { GITHUB_REPOSITORY: "owner-only" }, /invalid-environment:GITHUB_REPOSITORY/u],
    ["non-positive pull number", { ARC_PULL_REQUEST_NUMBER: "0" }, /invalid-environment:ARC_PULL_REQUEST_NUMBER/u],
  ])("fails closed on %s", async (_name, overrides, message) => {
    const { deps, createRuntime } = harness();
    await expect(runReconcileMain(baseEnv(overrides), deps)).rejects.toThrow(message);
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("appends a deleted-trigger tombstone before ordinary reconciliation reads", async () => {
    const order: string[] = [];
    const runtime: ReconcileRuntime = {
      ...fakeRuntime,
      read: async () => {
        order.push("reconcile-read");
        return state;
      },
    };
    const store = {} as ReconcileComposition["store"];
    const { deps } = harness();
    deps.createRuntime = async () => ({ runtime, store, changeRequestId: "change-7" }) as ReconcileComposition;
    deps.appendTriggerDeletion = async (input) => {
      order.push("tombstone-append");
      expect(input.changeRequestId).toBe("change-7");
      expect(input.deletion).toMatchObject({ commentId: "123", providerIdentity: "codex-pr" });
      return { status: "appended", receiptHash: "f".repeat(64) };
    };
    const deletion = JSON.stringify({
      schemaVersion: 1,
      commentId: "123",
      actorIdentity: "author-1",
      priorBodyDigest: "b".repeat(64),
      deletedAt: "2026-07-12T20:00:00.000Z",
      observedHeadSha: "a".repeat(40),
      providerIdentity: "codex-pr",
      triggerClassification: "provider-trigger",
      authenticatedEventRef: "github-event:issue-comment-deleted:123",
    });

    await runReconcileMain(baseEnv({ ARC_TRIGGER_DELETION: deletion }), deps);

    expect(order[0]).toBe("tombstone-append");
    expect(order).toContain("reconcile-read");
  });
});
