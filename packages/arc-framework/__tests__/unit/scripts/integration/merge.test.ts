/** Pinned integration merge behavior and fail-closed exits. */

import { describe, expect, it } from "vitest";

import {
  mergeIntegration,
  type IntegrationMergeDependencies,
} from "../../../../src/scripts/integration/merge.js";
import { IntegrationCheckpointCompositionRecordSchema } from "../../../../src/scripts/integration/checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const checkpointHandle = `checkpoint-v1:${oid("c")}:${digest("e")}`;

function dependencies() {
  const state = { held: true, merged: false };
  const value: IntegrationMergeDependencies = {
    readCheckpoint: async () => IntegrationCheckpointCompositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "integration-checkpoint-composition/v1",
      checkpointId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      workUnit: "example",
      approvedHead: oid("c"),
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        baseRef: "main",
        headRef: "feat/example",
        headSha: oid("c"),
      },
      lifecycleVersion: oid("c"),
      settlementPlan: composeCanonicalSettlementPlan([]),
      mergeMethod: {
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "owner/repo",
        state: "validated",
        nextAction: "use-method",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: digest("d"),
      },
      compositionDigest: digest("e"),
    }),
    executeSettlement: async () => ({ state: "settled", completedActions: 0 }),
    readStatus: async () => ({
      actualHead: oid("c"),
      lifecycleComplete: true,
      lifecycleVersion: oid("c"),
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        baseRef: "main",
        headRef: "feat/example",
        headSha: oid("c"),
      },
    }),
    readMerged: async () => state.merged,
    readConfiguredBase: async () => "main",
    refreshTarget: async (target) => target,
    releaseLock: async () => {
      state.held = false;
      return { state: "released" };
    },
    holdLock: async () => {
      state.held = true;
      return { state: "held" };
    },
    createLockRequest: async (target) => ({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: {
        repository: (target?.repository ?? "owner/repo"),
        pullRequest: (target?.pullRequest ?? 42),
        headSha: (target?.headSha ?? oid("c")),
      },
      vehicle: { kind: "work-unit", slug: "example", archiveCadence: "with-integration" },
    }),
    awaitChecks: async () => ({
      schemaVersion: 1,
      mode: "review-checks-await",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: oid("c"),
      state: "not-required",
      nextAction: "complete",
      checks: [],
    }),
    resolveMergeMethod: async () => ({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: "owner/repo",
      state: "validated",
      nextAction: "use-method",
      method: "merge",
      allowedMethods: ["merge"],
      policyFingerprint: digest("d"),
    }),
    readFinalDrift: async () => ({ verdict: "clean" }),
    mergePinned: async () => {
      state.merged = true;
      return { state: "merged" };
    },
  };
  return { value, state };
}

const request = { schemaVersion: 1 as const, workUnit: "example", checkpointHandle };

describe("integration merge", () => {
  it("merges only the checkpointed head", async () => {
    const { value, state } = dependencies();

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "merged",
      payload: { approvedHead: oid("c"), pullRequest: 42 },
    });
    expect(state).toEqual({ held: false, merged: true });
  });

  it("re-locks when the persisted checkpoint is missing", async () => {
    const { value, state } = dependencies();
    state.held = false;
    value.readCheckpoint = async () => null;

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "checkpoint-missing",
    });
    expect(state.held).toBe(true);
  });

  it("reports success when the host merged before its command failure surfaced", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async () => {
      state.merged = true;
      throw new Error("host command lost its response");
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "merged",
      payload: { approvedHead: oid("c"), pullRequest: 42 },
    });
    expect(state).toEqual({ held: false, merged: true });
  });

  it("converges an already-merged retry before replaying settlement", async () => {
    const { value, state } = dependencies();
    state.merged = true;
    value.executeSettlement = async () => {
      throw new Error("settlement must not replay after the exact target merged");
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "merged",
      payload: { approvedHead: oid("c"), pullRequest: 42 },
    });
  });

  it("compensates a checkpoint read failure with a lock hold", async () => {
    const { value, state } = dependencies();
    state.held = false;
    value.readCheckpoint = async () => {
      throw new Error("checkpoint storage unavailable");
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      reason: "operation-failed",
    });
    expect(state.held).toBe(true);
  });

  it("refreshes and re-locks the same live change request after a head move", async () => {
    const { value } = dependencies();
    const liveTarget = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("f"),
    };
    const refreshedTarget = { ...liveTarget, headSha: oid("g") };
    let heldTarget: typeof refreshedTarget | undefined;
    value.readStatus = async () => ({
      actualHead: liveTarget.headSha,
      lifecycleComplete: true,
      lifecycleVersion: liveTarget.headSha,
      target: liveTarget,
    });
    value.refreshTarget = async (target) => {
      expect(target).toEqual({
        repository: "owner/repo",
        pullRequest: 42,
        baseRef: "main",
        headRef: "feat/example",
        headSha: oid("c"),
      });
      return refreshedTarget;
    };
    value.holdLock = async (target) => {
      heldTarget = target;
      return { state: "held" };
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "head-mismatch",
    });
    expect(heldTarget).toEqual(refreshedTarget);
  });

  it("re-locks the refreshed live head when an unexpected post-check operation fails", async () => {
    const { value } = dependencies();
    const movedTarget = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("f"),
    };
    let heldTarget: typeof movedTarget | undefined;
    value.readFinalDrift = async () => {
      throw new Error("drift reader unavailable");
    };
    let refreshes = 0;
    value.refreshTarget = async (target) => {
      refreshes += 1;
      return refreshes === 1 ? target : movedTarget;
    };
    value.holdLock = async (target) => {
      heldTarget = target;
      return { state: "held" };
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      reason: "operation-failed",
    });
    expect(heldTarget).toEqual(movedTarget);
  });

  it("refuses a configured-base move before releasing the merge lock", async () => {
    const { value, state } = dependencies();
    value.readConfiguredBase = async () => "release";

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "head-mismatch",
      payload: { configuredBase: "release", targetBase: "main" },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("keeps the lock held when the pull-request head moves after checks complete", async () => {
    const { value, state } = dependencies();
    value.refreshTarget = async (target) => ({ ...target, headSha: oid("f") });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "head-mismatch",
      payload: { approvedHead: oid("c"), actualHead: oid("f") },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("keeps the lock held when the configured base moves after checks complete", async () => {
    const { value, state } = dependencies();
    let reads = 0;
    value.readConfiguredBase = async () => {
      reads += 1;
      return reads === 1 ? "main" : "release";
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "head-mismatch",
      payload: { configuredBase: "release", targetBase: "main" },
    });
    expect(reads).toBe(2);
    expect(state).toEqual({ held: true, merged: false });
  });

  it("keeps a nonterminal host merge response unmerged and re-locks the candidate", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async () => ({ state: "not-merged" });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "merge-blocked",
      payload: { merge: { state: "not-merged" } },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it.each([
    ["lifecycle-moved", (deps: IntegrationMergeDependencies) => {
      deps.readStatus = async () => ({
        actualHead: oid("c"),
        lifecycleComplete: false,
        lifecycleVersion: oid("c"),
        target: {
          repository: "owner/repo",
          pullRequest: 42,
          baseRef: "main",
          headRef: "feat/example",
          headSha: oid("c"),
        },
      });
    }],
    ["release-blocked", (deps: IntegrationMergeDependencies) => {
      deps.releaseLock = async () => ({ state: "blocked" });
    }],
  ] as const)("re-locks the candidate after %s invalidates the merge", async (reason, arrange) => {
    const { value, state } = dependencies();
    arrange(value);

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "invalidated", reason });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("returns the exact lock request when compensating re-lock fails", async () => {
    const { value, state } = dependencies();
    value.readStatus = async () => ({
      actualHead: oid("c"),
      lifecycleComplete: false,
      lifecycleVersion: oid("c"),
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        baseRef: "main",
        headRef: "feat/example",
        headSha: oid("c"),
      },
    });
    value.holdLock = async () => {
      throw new Error("host refused lock hold");
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      reason: "relock-failed",
      payload: { invalidationReason: "lifecycle-moved" },
      remedy: {
        argv: ["arc", "merge", "lock", "hold", "-"],
        stdin: {
          target: { repository: "owner/repo", pullRequest: 42, headSha: oid("c") },
          vehicle: { kind: "work-unit", slug: "example" },
        },
      },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("rejects merge-method policy resolved for a different repository", async () => {
    const { value, state } = dependencies();
    value.resolveMergeMethod = async (repository) => {
      expect(repository).toBe("owner/repo");
      return {
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "other/repo",
        state: "validated",
        nextAction: "use-method",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: digest("d"),
      };
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "merge-method-moved",
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it.each([
    ["settlement-invalidated", (deps: IntegrationMergeDependencies) => {
      deps.executeSettlement = async () => ({
        state: "invalidated",
        reason: "stale",
        dispositionId: digest("1"),
        completedActions: 0,
      });
    }],
    ["head-mismatch", (deps: IntegrationMergeDependencies) => {
      deps.readStatus = async () => ({
        actualHead: oid("f"),
        lifecycleComplete: true,
        lifecycleVersion: oid("c"),
        target: {
          repository: "owner/repo",
          pullRequest: 42,
          baseRef: "main",
          headRef: "feat/example",
          headSha: oid("f"),
        },
      });
    }],
    ["merge-method-moved", (deps: IntegrationMergeDependencies) => {
      deps.resolveMergeMethod = async () => ({
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "owner/repo",
        state: "validated",
        nextAction: "use-method",
        method: "squash",
        allowedMethods: ["merge", "squash"],
        policyFingerprint: digest("f"),
      });
    }],
    ["checks-failed", (deps: IntegrationMergeDependencies) => {
      deps.awaitChecks = async () => ({
        schemaVersion: 1,
        mode: "review-checks-await",
        repository: "owner/repo",
        pullRequest: 42,
        headSha: oid("c"),
        state: "failed",
        nextAction: "stop",
        checks: [{ name: "test", state: "failed" }],
      });
    }],
    ["drift-reconcile", (deps: IntegrationMergeDependencies) => {
      deps.readFinalDrift = async () => ({ verdict: "reconcile" });
    }],
  ] as const)("re-locks before returning %s", async (reason, arrange) => {
    const { value, state } = dependencies();
    arrange(value);

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "invalidated", reason });
    expect(state.held).toBe(true);
    expect(state.merged).toBe(false);
  });

  it("resumes the same checkpoint after required checks reach their deadline", async () => {
    const { value, state } = dependencies();
    let attempts = 0;
    value.awaitChecks = async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          schemaVersion: 1,
          mode: "review-checks-await",
          repository: "owner/repo",
          pullRequest: 42,
          headSha: oid("c"),
          state: "pending",
          nextAction: "await",
          checks: [{ name: "merge-ok", state: "pending" }],
          diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
          elapsedMs: 600_000,
        };
      }
      return {
        schemaVersion: 1,
        mode: "review-checks-await",
        repository: "owner/repo",
        pullRequest: 42,
        headSha: oid("c"),
        state: "not-required",
        nextAction: "complete",
        checks: [],
      };
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "awaiting-checks",
      payload: {
        checks: [{ name: "merge-ok", state: "pending" }],
        diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
      },
    });
    expect(state.held).toBe(true);
    expect(state.merged).toBe(false);

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "merged" });
    expect(state.held).toBe(false);
    expect(state.merged).toBe(true);
  });
});
