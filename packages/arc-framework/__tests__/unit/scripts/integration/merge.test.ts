/** Pinned integration merge behavior and fail-closed exits. */

import { describe, expect, it } from "vitest";

import {
  mergeIntegration,
  type IntegrationFinalPlan,
  type IntegrationMergeDependencies,
  type IntegrationMergeTarget,
} from "../../../../src/scripts/integration/merge.js";
import { IntegrationCheckpointCompositionRecordSchema } from "../../../../src/scripts/integration/checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const checkpointHandle = `checkpoint-v1:${oid("c")}:${digest("e")}`;

function directFinalPlan(
  target: IntegrationMergeTarget,
): Extract<IntegrationFinalPlan, { status: "available" }> {
  const baseOid = oid("b");
  return {
    status: "available",
    target,
    baseOid,
    observation: {
      movement: "disjoint",
      integrationEvidenceComplete: true,
      feasibility: { state: "clean", base: baseOid, head: target.headSha },
      admission: {
        state: "mergeable",
        repository: target.repository,
        changeRequest: target.pullRequest,
        base: baseOid,
        head: target.headSha,
      },
    },
    plan: { state: "proceed" },
  };
}

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
        stackPosition: "top",
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
    resolveMergeMethod: async (_repository, stackPosition) => ({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: "owner/repo",
      stackPosition,
      state: "validated",
      nextAction: "use-method",
      method: "merge",
      allowedMethods: ["merge"],
      policyFingerprint: digest("d"),
    }),
    readFinalPlan: async (target, admissionOverride) => {
      const direct = directFinalPlan(target);
      if (admissionOverride === undefined) return direct;
      const observation = {
        ...direct.observation,
        admission: {
          ...admissionOverride,
          repository: target.repository,
          changeRequest: target.pullRequest,
          base: direct.baseOid,
          head: target.headSha,
        },
      };
      return {
        ...direct,
        observation,
        plan: admissionOverride.state === "refused"
          ? { state: "blocked", reason: "host-refused", detail: admissionOverride.detail }
          : { state: "reconcile", nextAction: "reconcile-base" },
      } as IntegrationFinalPlan;
    },
    mergePinned: async (target) => {
      state.merged = true;
      return { state: "merged", target, providerMergeId: "merge-123" };
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
      payload: {
        approvedHead: oid("c"),
        pullRequest: 42,
        target: { repository: "owner/repo", baseRef: "main", headSha: oid("c") },
        providerMergeId: "merge-123",
      },
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
    value.readFinalPlan = async () => {
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

  it("returns an opaque host refusal without selecting reconciliation and re-locks the candidate", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => ({
      state: "refused",
      target,
      detail: "The host rejected the exact merge without establishing a stricter cause.",
    });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "host-refused",
      payload: {
        target: {
          repository: "owner/repo",
          pullRequest: 42,
          baseRef: "main",
          headRef: "feat/example",
          headSha: oid("c"),
        },
        detail: "The host rejected the exact merge without establishing a stricter cause.",
      },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("preserves approval and does not re-lock when the mutating outcome is unknown", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => ({
      state: "merge-outcome-unknown",
      target,
      mutationDetail: "The mutating request timed out.",
      confirmationDetail: "The exact merged state could not be read.",
    });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      nextAction: "retry",
      reason: "merge-outcome-unknown",
      payload: {
        checkpointHandle,
        target: { headSha: oid("c") },
        mutationDetail: "The mutating request timed out.",
        confirmationDetail: "The exact merged state could not be read.",
      },
    });
    expect(state).toEqual({ held: false, merged: false });
  });

  it("returns a typed base reconcile only for independently established strict currency", async () => {
    const { value, state } = dependencies();
    value.readFinalPlan = async (target, admissionOverride) => {
      const direct = directFinalPlan(target);
      if (admissionOverride === undefined) return direct;
      const observation = {
        ...direct.observation,
        admission: {
          state: "base-currentness-required" as const,
          repository: target.repository,
          changeRequest: target.pullRequest,
          base: direct.baseOid,
          head: target.headSha,
          detail: admissionOverride.detail,
        },
      };
      return {
        ...direct,
        observation,
        plan: { state: "reconcile" as const, nextAction: "reconcile-base" as const },
      };
    };
    value.mergePinned = async (target) => ({
      state: "base-currentness-required",
      target,
      detail: "Applicable target policy requires the head to include the current base.",
    });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "reconcile-base",
      reason: "base-currentness-required",
      payload: {
        target: { headSha: oid("c") },
        baseOid: oid("b"),
        detail: "Applicable target policy requires the head to include the current base.",
      },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("does not reconcile a strict-currency refusal from incomplete integration evidence", async () => {
    const { value, state } = dependencies();
    value.readFinalPlan = async (target, admissionOverride) => {
      const direct = directFinalPlan(target);
      if (admissionOverride === undefined) return direct;
      return {
        ...direct,
        observation: {
          ...direct.observation,
          integrationEvidenceComplete: false,
          admission: {
            state: "base-currentness-required",
            repository: target.repository,
            changeRequest: target.pullRequest,
            base: direct.baseOid,
            head: target.headSha,
            detail: admissionOverride.detail,
          },
        },
        plan: { state: "reconcile", nextAction: "reconcile-base" },
      };
    };
    value.mergePinned = async (target) => ({
      state: "base-currentness-required",
      target,
      detail: "Applicable target policy requires the head to include the current base.",
    });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "checkpoint",
      reason: "base-currentness-required",
      payload: {
        terminalExplanation: "Complete exact integration evidence did not authorize base reconciliation.",
      },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("invalidates and re-locks when the host reports native head movement", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => ({
      state: "head-moved",
      target,
      actualHead: oid("f"),
      detail: "The change-request head moved before merge.",
    });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "checkpoint",
      reason: "head-moved",
      payload: {
        target: { headSha: oid("c") },
        actualHead: oid("f"),
        detail: "The change-request head moved before merge.",
      },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("returns an established operation failure and re-locks the exact target", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => ({
      state: "operation-failed",
      target,
      detail: "The host confirmed that the mutating request did not merge.",
    });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "operation-failed",
      payload: {
        target: { headSha: oid("c") },
        detail: "The host confirmed that the mutating request did not merge.",
      },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("returns prompt host-pending detail before releasing the merge lock", async () => {
    const { value, state } = dependencies();
    value.readFinalPlan = async (target) => ({
      status: "available",
      target,
      baseOid: oid("b"),
      observation: {
        movement: "disjoint",
        integrationEvidenceComplete: true,
        feasibility: { state: "clean", base: oid("b"), head: target.headSha },
        admission: {
          state: "unresolved",
          repository: target.repository,
          changeRequest: target.pullRequest,
          base: oid("b"),
          head: target.headSha,
          detail: "The host is still computing exact merge admission.",
        },
      },
      plan: {
        state: "blocked",
        reason: "host-pending",
        detail: "The host is still computing exact merge admission.",
      },
    });

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      nextAction: "retry",
      reason: "host-pending",
      payload: {
        checkpointHandle,
        target: { headSha: oid("c") },
        baseOid: oid("b"),
        detail: "The host is still computing exact merge admission.",
      },
    });
    expect(state).toEqual({ held: true, merged: false });
  });

  it("returns an exact host refusal before releasing the merge lock", async () => {
    const { value, state } = dependencies();
    value.readFinalPlan = async (target) => {
      const direct = directFinalPlan(target);
      return {
        ...direct,
        observation: {
          ...direct.observation,
          admission: {
            state: "refused",
            repository: target.repository,
            changeRequest: target.pullRequest,
            base: direct.baseOid,
            head: target.headSha,
            detail: "Repository policy refused this exact request.",
          },
        },
        plan: { state: "blocked", reason: "host-refused", detail: "Repository policy refused this exact request." },
      };
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "host-refused",
      payload: {
        target: { headSha: oid("c") },
        baseOid: oid("b"),
        detail: "Repository policy refused this exact request.",
      },
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
    value.resolveMergeMethod = async (repository, stackPosition) => {
      expect(repository).toBe("owner/repo");
      return {
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "other/repo",
        stackPosition,
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
        stackPosition: "top",
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
      deps.readFinalPlan = async (target) => ({
        ...directFinalPlan(target),
        plan: { state: "reconcile", nextAction: "reconcile-base" },
      });
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
