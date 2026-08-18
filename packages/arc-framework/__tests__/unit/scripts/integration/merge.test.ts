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
    refreshTarget: async (target) => target,
    releaseLock: async () => {
      state.held = false;
      return { state: "released" };
    },
    holdLock: async () => {
      state.held = true;
      return { state: "held" };
    },
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
          checks: [{ name: "test", state: "pending" }],
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

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "awaiting-checks" });
    expect(state.held).toBe(false);
    expect(state.merged).toBe(false);

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "merged" });
    expect(state.held).toBe(false);
    expect(state.merged).toBe(true);
  });
});
