/** Exact-effect Errand merge request and result contracts. */

import { describe, expect, it } from "vitest";

import {
  ErrandMergeRequestSchema,
  ErrandMergeResultSchema,
  mergeErrand,
  validateErrandMergeBinding,
  type ErrandMergeDependencies,
  type ErrandMergeFinalPlan,
} from "../../../../src/scripts/integration/errand-merge.js";
import { IntegrationBindingChangedError } from
  "../../../../src/scripts/integration/merge.js";
import { RequiredChecksObservationResultSchema } from
  "../../../../src/scripts/review-gate/checks-await.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const identity = {
  slug: "example",
  claimId: "1234567890abcdef1234567890abcdef",
  branch: "chore/example",
  generation: "errand-v1/example/1234567890abcdef1234567890abcdef",
} as const;
const approvedTarget = {
  repository: "owner/repo",
  pullRequest: 42,
  baseRef: "main",
  headRef: "chore/example",
  headSha: oid("c"),
};
const request = ErrandMergeRequestSchema.parse({
  schemaVersion: 1,
  identity,
  approvedTarget,
  lane: "reviewed",
  mergeMethod: {
    method: "merge",
    policyFingerprint: digest("d"),
  },
});
const coordinates = {
  observedTarget: approvedTarget,
  observedBaseOid: oid("b"),
};
const continuation = {
  kind: "remedy" as const,
  remedy: {
    invariant: "The exact approved effect remains bound.",
    text: "Retry the exact request: `arc errand merge example - --json`.",
    argv: ["arc", "errand", "merge", "example", "-", "--json"],
    stdin: request,
  },
};
const resultBase = {
  schemaVersion: 1 as const,
  mode: "errand-merge" as const,
  identity,
  approvedTarget,
  lane: "reviewed" as const,
};

describe("Errand merge contract", () => {
  it("binds the complete approved merge request", () => {
    expect(ErrandMergeRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    { ...request, identity: { ...identity, generation: "errand-v1/example/ffffffffffffffffffffffffffffffff" } },
    { ...request, approvedTarget: { ...approvedTarget, headRef: "chore/other" } },
    { ...request, lane: "native-auto-merge" },
    { ...request, unapproved: true },
  ])("rejects an unbound identity, target, lane, or field", (invalid) => {
    expect(() => ErrandMergeRequestSchema.parse(invalid)).toThrow();
  });

  it("accepts confirmed success without a native auto-merge arm", () => {
    expect(ErrandMergeResultSchema.parse({
      ...resultBase,
      state: "merged",
      nextAction: "complete",
      providerMergeId: "merge-123",
    })).toMatchObject({ state: "merged", nextAction: "complete" });
  });

  it.each([
    {
      state: "awaiting-checks",
      nextAction: "retry",
      reason: "checks-pending",
      detail: "Required checks are pending.",
      coordinates,
      availabilityCause: null,
      checks: [{ name: "build", state: "pending" }],
      diagnosticFailures: [],
      continuation,
    },
    {
      state: "applicability-judgment-required",
      nextAction: "assess-applicability",
      reason: "bounded-review-residual",
      detail: "Review applicability needs a bounded residual judgment.",
      coordinates,
      applicability: {
        verdict: "supplemental",
        residual: ["src/index.ts"],
        reason: "bounded-overlap",
        judgmentRequired: true,
      },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "Assess the bounded residual and obtain a fresh exact integration approval.",
      },
    },
    {
      state: "reconcile-base",
      nextAction: "reconcile-base",
      reason: "base-reconcile-required",
      detail: "The current plan requires an ordinary base reconcile.",
      coordinates,
      continuation,
    },
    {
      state: "reconcile-regenerable",
      nextAction: "reconcile-regenerable",
      reason: "regenerable-reconcile-required",
      detail: "The current plan admits only the determinate regenerable reconcile.",
      coordinates,
      continuation,
    },
    {
      state: "conflict",
      nextAction: "stop",
      reason: "substantive-conflict",
      detail: "The exact merge has substantive conflicts.",
      coordinates,
      paths: ["src/index.ts"],
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "No safe automated continuation exists for a substantive conflict.",
      },
    },
    {
      state: "host-pending",
      nextAction: "retry",
      reason: "host-admission-unresolved",
      detail: "Host admission is still computing.",
      coordinates,
      continuation,
    },
    {
      state: "host-refused",
      nextAction: "stop",
      reason: "host-refused",
      detail: "The host refused the exact merge.",
      coordinates,
      continuation,
    },
    {
      state: "invalidated",
      nextAction: "request-approval",
      reason: "target-moved",
      detail: "The approved target moved.",
      coordinates: { ...coordinates, observedTarget: { ...approvedTarget, headSha: oid("f") } },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "Recompose the exact request and obtain fresh approval.",
      },
    },
    {
      state: "merge-outcome-unknown",
      nextAction: "retry",
      reason: "mutation-outcome-unknown",
      detail: "The merge effect could not be confirmed.",
      coordinates,
      mutationDetail: "The mutation timed out.",
      confirmationDetail: "Confirmation was unavailable.",
      continuation,
    },
    {
      state: "operation-failed",
      nextAction: "stop",
      reason: "provider-operation-failed",
      detail: "The provider operation failed before mutation.",
      coordinates,
      continuation,
    },
  ] as const)("accepts a complete $state result", (result) => {
    expect(ErrandMergeResultSchema.parse({ ...resultBase, ...result })).toMatchObject({
      state: result.state,
      nextAction: result.nextAction,
      reason: result.reason,
      detail: result.detail,
      coordinates: result.coordinates,
      continuation: result.continuation,
    });
  });

  it("rejects a native auto-merge outcome", () => {
    expect(() => ErrandMergeResultSchema.parse({
      ...resultBase,
      state: "auto-merge-armed",
      nextAction: "await",
      providerMergeId: null,
    })).toThrow();
  });

  it("invalidates approval when the observed target changes", () => {
    expect(validateErrandMergeBinding(request, {
      identity: request.identity,
      target: { ...approvedTarget, headSha: oid("f") },
      baseOid: oid("b"),
    })).toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason: "target-moved",
      coordinates: {
        observedTarget: { ...approvedTarget, headSha: oid("f") },
        observedBaseOid: oid("b"),
      },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: expect.stringContaining("fresh approval"),
      },
    });
  });
});

function directPlan(): Extract<ErrandMergeFinalPlan, { status: "available" }> {
  return {
    status: "available",
    target: approvedTarget,
    baseOid: oid("b"),
    observation: {
      movement: "disjoint",
      integrationEvidenceComplete: true,
      feasibility: { state: "clean", base: oid("b"), head: approvedTarget.headSha },
      admission: {
        state: "mergeable",
        repository: approvedTarget.repository,
        changeRequest: approvedTarget.pullRequest,
        baseRef: approvedTarget.baseRef,
        base: oid("b"),
        head: approvedTarget.headSha,
      },
    },
    plan: { state: "proceed" },
    reviewApplicability: {
      verdict: "carries",
      residual: null,
      reason: "base-movement-disjoint",
      judgmentRequired: false,
    },
  };
}

function dependencies(): {
  value: ErrandMergeDependencies;
  state: { held: boolean; merged: boolean; mergeCalls: number };
} {
  const state = { held: true, merged: false, mergeCalls: 0 };
  return {
    state,
    value: {
      readCurrentIdentity: async () => request.identity,
      readMerged: async () => ({ merged: state.merged, providerMergeId: state.merged ? "merge-123" : null }),
      refreshTarget: async (target) => target,
      observeChecks: async () => ({
        schemaVersion: 1,
        mode: "review-checks-observe",
        repository: approvedTarget.repository,
        pullRequest: approvedTarget.pullRequest,
        headSha: approvedTarget.headSha,
        state: "not-required",
        nextAction: "complete",
        checks: [],
      }),
      resolveMergeMethod: async () => ({
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: approvedTarget.repository,
        stackPosition: "non-delivery",
        state: "validated",
        nextAction: "use-method",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: digest("d"),
      }),
      readFinalPlan: async () => directPlan(),
      releaseLock: async () => {
        state.held = false;
        return { state: "released" };
      },
      holdLock: async () => {
        state.held = true;
        return { state: "held" };
      },
      mergePinned: async (target) => {
        state.mergeCalls += 1;
        state.merged = true;
        return { state: "merged", target, providerMergeId: "merge-123" };
      },
    },
  };
}

describe("Errand merge operation", () => {
  it("directly merges only the exact approved head", async () => {
    const { value, state } = dependencies();

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "merged",
      nextAction: "complete",
      identity: request.identity,
      approvedTarget,
      providerMergeId: "merge-123",
    });
    expect(state).toEqual({ held: false, merged: true, mergeCalls: 1 });
  });

  it("confirms an already-merged exact head before requiring an open live target", async () => {
    const { value, state } = dependencies();
    state.merged = true;
    value.refreshTarget = async () => {
      throw new Error("The merged change request is no longer open.");
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "merged",
      nextAction: "complete",
      providerMergeId: "merge-123",
    });
    expect(state).toEqual({ held: true, merged: true, mergeCalls: 0 });
  });

  it("returns a typed failure when the current Errand identity is unavailable", async () => {
    const { value, state } = dependencies();
    value.readCurrentIdentity = async () => {
      throw new Error("The entering Errand identity could not be resolved.");
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "retry",
      reason: "identity-observation-failed",
      detail: "The entering Errand identity could not be resolved.",
      coordinates: { observedTarget: null, observedBaseOid: null },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("invalidates approval when the current Errand generation is known to have changed", async () => {
    const { value, state } = dependencies();
    value.readCurrentIdentity = async () => {
      throw new IntegrationBindingChangedError("identity", "The current Errand generation changed.");
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason: "identity-moved",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("invalidates approval when an authoritative host read no longer finds the bound request", async () => {
    const { value, state } = dependencies();
    value.refreshTarget = async () => {
      throw new IntegrationBindingChangedError("target", "The approved change request is no longer open.");
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason: "target-moved",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("keeps a later unavailable identity read distinct from a provider failure", async () => {
    const { value, state } = dependencies();
    let reads = 0;
    value.readCurrentIdentity = async () => {
      reads += 1;
      if (reads === 2) throw new Error("The identity observation is unavailable.");
      return request.identity;
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "retry",
      reason: "identity-observation-failed",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("retains approval and the lock when required checks are pending", async () => {
    const { value, state } = dependencies();
    value.observeChecks = async () => ({
      schemaVersion: 1,
      mode: "review-checks-observe",
      repository: approvedTarget.repository,
      pullRequest: approvedTarget.pullRequest,
      headSha: approvedTarget.headSha,
      state: "pending",
      nextAction: "retry",
      checks: [{ name: "merge-ok", state: "pending" }],
      diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "awaiting-checks",
      nextAction: "retry",
      reason: "checks-pending",
      availabilityCause: null,
      checks: [{ name: "merge-ok", state: "pending" }],
      diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
      continuation: {
        kind: "remedy",
        remedy: {
          argv: ["arc", "errand", "merge", "example", "-", "--json"],
          stdin: request,
        },
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it.each([
    [
      {
        schemaVersion: 1,
        mode: "review-checks-observe",
        repository: approvedTarget.repository,
        pullRequest: approvedTarget.pullRequest,
        headSha: approvedTarget.headSha,
        state: "failed",
        nextAction: "stop",
        checks: [{ name: "build", state: "failed" }],
      } as const,
      "checks-failed",
    ],
    [
      {
        schemaVersion: 1,
        mode: "review-checks-observe",
        repository: approvedTarget.repository,
        pullRequest: approvedTarget.pullRequest,
        headSha: approvedTarget.headSha,
        state: "stale-target",
        nextAction: "stop",
        actualHeadSha: oid("f"),
      } as const,
      "target-moved",
    ],
  ])("invalidates %s check evidence before mutation", async (observation, reason) => {
    const { value, state } = dependencies();
    value.observeChecks = async () => RequiredChecksObservationResultSchema.parse(observation);

    await expect(mergeErrand({ ...request, lane: "auto" }, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason,
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: expect.stringContaining("fresh approval"),
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it.each(["auto", "reviewed"] as const)("returns a bounded review-applicability judgment in the %s lane", async (lane) => {
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      reviewApplicability: {
        verdict: "supplemental",
        residual: ["src/index.ts"],
        reason: "bounded-overlap",
        judgmentRequired: true,
      },
    });

    await expect(mergeErrand({ ...request, lane }, value)).resolves.toMatchObject({
      state: "applicability-judgment-required",
      nextAction: "assess-applicability",
      reason: "bounded-review-residual",
      applicability: {
        residual: ["src/index.ts"],
        judgmentRequired: true,
      },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: expect.stringContaining("fresh exact integration approval"),
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("invalidates a changed merge method before mutation", async () => {
    const { value, state } = dependencies();
    value.resolveMergeMethod = async () => ({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: approvedTarget.repository,
      stackPosition: "non-delivery",
      state: "validated",
      nextAction: "use-method",
      method: "squash",
      allowedMethods: ["squash"],
      policyFingerprint: digest("e"),
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason: "merge-method-moved",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it.each(["auto", "reviewed"] as const)("requires fresh approval in the %s lane when review applicability is fresh", async (lane) => {
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      reviewApplicability: {
        verdict: "fresh",
        residual: null,
        reason: "interaction",
        judgmentRequired: false,
      },
    });

    await expect(mergeErrand({ ...request, lane }, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason: "review-applicability-fresh",
      coordinates: { observedBaseOid: oid("b"), observedTarget: approvedTarget },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("carries the cause that required fresh review into the result the operator reads", async () => {
    const { value } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      reviewApplicability: {
        verdict: "fresh",
        residual: null,
        reason: "overlap-ambiguous-base",
        judgmentRequired: false,
      },
    });

    // Fresh review is the verdict either way; which base reading produced it is what the operator acts on,
    // and it is the thing that stops at this boundary unless the result carries it.
    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "review-applicability-fresh",
      applicability: { verdict: "fresh", reason: "overlap-ambiguous-base" },
    });
  });

  it("sends an absent common ancestor to the join, not back around the approval loop", async () => {
    const { value } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      reviewApplicability: {
        verdict: "fresh",
        residual: null,
        reason: "overlap-unrelated-base",
        judgmentRequired: false,
      },
    });

    // Recomposing the request reduces over the same pair and returns the same invalidation, so the explanation
    // that asks for one is a loop. No `arc` verb clears this reading: the append-only reconcile declines
    // unrelated histories rather than joining them, so the operator performs the join.
    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      continuation: {
        kind: "remedy",
        remedy: {
          invariant: "Base movement can be proved only between revisions with a common ancestor.",
          argv: ["git", "merge", "--allow-unrelated-histories", oid("b")],
        },
      },
    });
  });

  it("sends a second merge base to the typed reconcile that collapses it", async () => {
    const { value } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      reviewApplicability: {
        verdict: "fresh",
        residual: null,
        reason: "overlap-ambiguous-base",
        judgmentRequired: false,
      },
    });

    // The opposite act from its sibling: merging the base in collapses two merge bases to one, which is exactly
    // what the append-only reconcile already does, so this pair keeps the route that clears it.
    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      continuation: {
        kind: "remedy",
        remedy: {
          argv: [
            "arc", "base", "merge",
            "--expected-base", oid("b"),
            "--expected-head", approvedTarget.headSha,
          ],
        },
      },
    });
  });

  it("returns typed unavailable drift evidence before mutation", async () => {
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      status: "unavailable",
      target: approvedTarget,
      baseOid: null,
      detail: "The exact base observation was unavailable.",
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "retry",
      reason: "drift-observation-failed",
      detail: "The exact base observation was unavailable.",
      coordinates: { observedBaseOid: null, observedTarget: approvedTarget },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it.each([
    ["reconcile-base", "reconcile-base", "base-reconcile-required", []],
    ["reconcile-regenerable", "reconcile-regenerable", "regenerable-reconcile-required", ["--regenerate-roadmap"]],
  ] as const)("returns %s from the shared final plan", async (stateName, nextAction, reason, extraArgv) => {
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      observation: {
        ...directPlan().observation,
        movement: "overlapping",
        feasibility: stateName === "reconcile-regenerable"
          ? {
              state: "regenerable-conflict",
              base: oid("b"),
              head: approvedTarget.headSha,
              paths: [".arc/README.md"],
            }
          : directPlan().observation.feasibility,
      },
      plan: { state: "reconcile", nextAction },
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: stateName,
      nextAction,
      reason,
      coordinates: { observedBaseOid: oid("b"), observedTarget: approvedTarget },
      continuation: {
        kind: "remedy",
        remedy: {
          argv: [
            "arc", "base", "merge",
            "--expected-base", oid("b"),
            "--expected-head", approvedTarget.headSha,
            ...extraArgv,
          ],
        },
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("returns unresolved host admission as a retryable exact request", async () => {
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      plan: { state: "blocked", reason: "host-pending", detail: "Host admission is still computing." },
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "host-pending",
      nextAction: "retry",
      reason: "host-admission-unresolved",
      detail: "Host admission is still computing.",
      continuation: {
        kind: "remedy",
        remedy: {
          argv: ["arc", "errand", "merge", "example", "-", "--json"],
          stdin: request,
        },
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it.each([
    [
      { state: "blocked", reason: "host-refused", detail: "Configured policy refused the merge." } as const,
      "host-refused",
      "host-refused",
      "remedy",
    ],
    [
      { state: "blocked", reason: "conflict", paths: ["src/index.ts"] } as const,
      "conflict",
      "substantive-conflict",
      "terminal-explanation",
    ],
    [
      { state: "blocked", reason: "unsafe-reconcile", detail: "Integration evidence is incomplete." } as const,
      "conflict",
      "unsafe-reconcile",
      "terminal-explanation",
    ],
  ] as const)("projects a blocked final plan as %s", async (plan, stateName, reason, continuationKind) => {
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      plan: "paths" in plan ? { ...plan, paths: [...plan.paths] } : plan,
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: stateName,
      nextAction: "stop",
      reason,
      coordinates: { observedBaseOid: oid("b"), observedTarget: approvedTarget },
      continuation: { kind: continuationKind },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it.each([
    [undefined, "Resolve the refusal, then retry the same approved request"],
    ["head-moved", "or recompose over the head it now carries, then retry the same approved request"],
    ["not-mergeable", "resolve the conflicts the host reports, then retry the same approved request"],
  ] as const)("keys a host admission refusal's continuation on its %s condition", async (condition, correction) => {
    const reapproval = " if the head is unchanged, or compose a new request and obtain fresh approval if the correction "
      + "moved it";
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      observation: {
        ...directPlan().observation,
        admission: {
          ...directPlan().observation.admission,
          state: "refused",
          detail: "The host refused the merge.",
          ...(condition === undefined ? {} : { condition }),
        },
      },
      plan: { state: "blocked", reason: "host-refused", detail: "The host refused the merge." },
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "host-refused",
      nextAction: "stop",
      continuation: {
        kind: "remedy",
        remedy: {
          text: expect.stringContaining(`${correction}${reapproval}`),
          argv: ["arc", "errand", "merge", "example", "-", "--json"],
          stdin: request,
        },
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("requires a bounded judgment before a reviewed-lane reconcile", async () => {
    const { value, state } = dependencies();
    value.readFinalPlan = async () => ({
      ...directPlan(),
      observation: { ...directPlan().observation, movement: "overlapping" },
      plan: { state: "reconcile", nextAction: "reconcile-base" },
      reviewApplicability: {
        verdict: "supplemental",
        residual: ["src/index.ts"],
        reason: "bounded-overlap",
        judgmentRequired: true,
      },
    });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "applicability-judgment-required",
      nextAction: "assess-applicability",
      reason: "bounded-review-residual",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("preserves approval without re-locking when the merge outcome is unknown", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return {
        state: "merge-outcome-unknown",
        target,
        mutationDetail: "The host request timed out.",
        confirmationDetail: "Exact merge confirmation was unavailable.",
      };
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "merge-outcome-unknown",
      nextAction: "retry",
      reason: "mutation-outcome-unknown",
      mutationDetail: "The host request timed out.",
      confirmationDetail: "Exact merge confirmation was unavailable.",
      continuation: {
        kind: "remedy",
        remedy: {
          argv: ["arc", "errand", "merge", "example", "-", "--json"],
          stdin: request,
        },
      },
    });
    expect(state).toEqual({ held: false, merged: false, mergeCalls: 1 });
  });

  it("re-holds the moved target after a definitive head-moved result", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return {
        state: "head-moved",
        target,
        actualHead: oid("f"),
        detail: "The change-request head moved before the host merge.",
      };
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      nextAction: "request-approval",
      reason: "target-moved",
      detail: "The change-request head moved before the host merge.",
      coordinates: {
        observedTarget: { ...approvedTarget, headSha: oid("f") },
        observedBaseOid: oid("b"),
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
  });

  it("reclassifies a definitive host refusal and re-holds the exact target", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return { state: "refused", target, detail: "Configured host policy refused the merge." };
    };
    value.readFinalPlan = async (_target, override) => override?.state === "refused"
      ? {
          ...directPlan(),
          observation: {
            ...directPlan().observation,
            admission: {
              state: "refused",
              repository: approvedTarget.repository,
              changeRequest: approvedTarget.pullRequest,
              baseRef: approvedTarget.baseRef,
              base: oid("b"),
              head: approvedTarget.headSha,
              detail: override.detail,
            },
          },
          plan: { state: "blocked", reason: "host-refused", detail: override.detail },
        }
      : directPlan();

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "host-refused",
      nextAction: "stop",
      reason: "host-refused",
      detail: "Configured host policy refused the merge.",
      coordinates: { observedTarget: approvedTarget, observedBaseOid: oid("b") },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
  });

  it.each(["refused", "base-currentness-required"] as const)(
    "invalidates when the base moves while %s is classified",
    async (outcome) => {
      const { value, state } = dependencies();
      value.mergePinned = async (target) => {
        state.mergeCalls += 1;
        return outcome === "refused"
          ? { state: "refused", target, detail: "The host refused the merge." }
          : { state: "base-currentness-required", target, detail: "The host requires the current base." };
      };
      value.readFinalPlan = async (_target, override) => {
        if (override === undefined) return directPlan();
        const moved = directPlan();
        const baseOid = oid("d");
        return {
          ...moved,
          baseOid,
          observation: {
            ...moved.observation,
            movement: "overlapping",
            feasibility: { state: "clean", base: baseOid, head: approvedTarget.headSha },
            admission: {
              ...override,
              repository: approvedTarget.repository,
              changeRequest: approvedTarget.pullRequest,
              base: baseOid,
              head: approvedTarget.headSha,
            },
          },
          plan: override.state === "refused"
            ? { state: "blocked", reason: "host-refused", detail: override.detail }
            : { state: "reconcile", nextAction: "reconcile-base" },
        } as ErrandMergeFinalPlan;
      };

      await expect(mergeErrand(request, value)).resolves.toMatchObject({
        state: "invalidated",
        nextAction: "request-approval",
        reason: "base-moved",
        detail: expect.stringContaining("base moved"),
        coordinates: { observedTarget: approvedTarget, observedBaseOid: oid("d") },
      });
      expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
    },
  );

  it("re-holds when refusal reclassification is unavailable", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return { state: "refused", target, detail: "The host refused the merge." };
    };
    value.readFinalPlan = async (_target, override) => {
      if (override !== undefined) throw new Error("Final coordinate observation failed.");
      return directPlan();
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "retry",
      reason: "drift-observation-failed",
      detail: "Final coordinate observation failed.",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
  });

  it("returns a planner-authorized reconcile after host currentness refusal and re-holds", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return { state: "base-currentness-required", target, detail: "The host requires the current base." };
    };
    value.readFinalPlan = async (_target, override) => override?.state === "base-currentness-required"
      ? {
          ...directPlan(),
          observation: {
            ...directPlan().observation,
            movement: "overlapping",
            admission: {
              state: "base-currentness-required",
              repository: approvedTarget.repository,
              changeRequest: approvedTarget.pullRequest,
              baseRef: approvedTarget.baseRef,
              base: oid("b"),
              head: approvedTarget.headSha,
              detail: override.detail,
            },
          },
          plan: { state: "reconcile", nextAction: "reconcile-base" },
        }
      : directPlan();

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "reconcile-base",
      nextAction: "reconcile-base",
      reason: "base-reconcile-required",
      coordinates: { observedTarget: approvedTarget, observedBaseOid: oid("b") },
      continuation: {
        kind: "remedy",
        remedy: {
          argv: [
            "arc", "base", "merge",
            "--expected-base", oid("b"),
            "--expected-head", approvedTarget.headSha,
          ],
        },
      },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
  });

  it("does not turn reviewed-lane host currentness into clearance for a new overlap", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return { state: "base-currentness-required", target, detail: "The host requires the current base." };
    };
    value.readFinalPlan = async (_target, override) => override?.state === "base-currentness-required"
      ? {
          ...directPlan(),
          plan: { state: "reconcile", nextAction: "reconcile-base" },
          reviewApplicability: {
            verdict: "supplemental",
            residual: ["src/index.ts"],
            reason: "bounded-overlap",
            judgmentRequired: true,
          },
        }
      : directPlan();

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "applicability-judgment-required",
      nextAction: "assess-applicability",
      reason: "bounded-review-residual",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
  });

  it("carries the cause through the base-currentness re-read, as its sibling arm does", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return { state: "base-currentness-required", target, detail: "The host requires the current base." };
    };
    value.readFinalPlan = async (_target, override) => override?.state === "base-currentness-required"
      ? {
          ...directPlan(),
          reviewApplicability: {
            verdict: "fresh",
            residual: null,
            reason: "overlap-unrelated-base",
            judgmentRequired: false,
          },
        }
      : directPlan();

    // The same verdict reached through the re-read after a host currentness refusal. The cause is what tells
    // the operator the base shares no history with the branch, and it dies at this boundary unless carried.
    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "invalidated",
      reason: "review-applicability-fresh",
      applicability: { verdict: "fresh", reason: "overlap-unrelated-base" },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
  });

  it("re-holds after a definitive provider operation failure", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return { state: "operation-failed", target, detail: "The provider rejected the request before mutation." };
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "retry",
      reason: "provider-operation-failed",
      detail: "The provider rejected the request before mutation.",
      coordinates: { observedTarget: approvedTarget, observedBaseOid: oid("b") },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 1 });
  });

  it("returns a typed lock failure when the exact hold cannot be released", async () => {
    const { value, state } = dependencies();
    value.releaseLock = async () => ({ state: "blocked" });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "stop",
      reason: "lock-operation-failed",
      coordinates: { observedTarget: approvedTarget, observedBaseOid: oid("b") },
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("re-holds and types an unexpected lock-release exception", async () => {
    const { value, state } = dependencies();
    value.releaseLock = async () => {
      state.held = false;
      throw new Error("The lock transition response was malformed.");
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "stop",
      reason: "lock-operation-failed",
      detail: "The lock transition response was malformed.",
    });
    expect(state).toEqual({ held: true, merged: false, mergeCalls: 0 });
  });

  it("reports the re-hold failure after a definitively unapproved exit", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async (target) => {
      state.mergeCalls += 1;
      return { state: "operation-failed", target, detail: "The provider refused before mutation." };
    };
    value.holdLock = async () => ({ state: "blocked" });

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "operation-failed",
      nextAction: "stop",
      reason: "lock-operation-failed",
      detail: expect.stringContaining("could not be re-held"),
      coordinates: { observedTarget: approvedTarget, observedBaseOid: oid("b") },
    });
    expect(state).toEqual({ held: false, merged: false, mergeCalls: 1 });
  });

  it("confirms exact success after an unexpected mutating adapter exception", async () => {
    const { value, state } = dependencies();
    value.mergePinned = async () => {
      state.mergeCalls += 1;
      state.merged = true;
      throw new Error("The provider response was malformed.");
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "merged",
      nextAction: "complete",
      providerMergeId: "merge-123",
    });
    expect(state).toEqual({ held: false, merged: true, mergeCalls: 1 });
  });

  it("preserves approval when an unexpected mutating exception cannot be confirmed", async () => {
    const { value, state } = dependencies();
    let initialRead = true;
    value.readMerged = async () => {
      if (initialRead) {
        initialRead = false;
        return { merged: false, providerMergeId: null };
      }
      throw new Error("Exact confirmation was unavailable.");
    };
    value.mergePinned = async () => {
      state.mergeCalls += 1;
      throw new Error("The provider response was malformed.");
    };

    await expect(mergeErrand(request, value)).resolves.toMatchObject({
      state: "merge-outcome-unknown",
      nextAction: "retry",
      reason: "mutation-outcome-unknown",
      mutationDetail: "The provider response was malformed.",
      confirmationDetail: "Exact confirmation was unavailable.",
    });
    expect(state).toEqual({ held: false, merged: false, mergeCalls: 1 });
  });
});
