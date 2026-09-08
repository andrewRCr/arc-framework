import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalChangeSetCarrier } from "../../../../../src/scripts/review-gate/core/local-carrier.js";
import { LaneSubjectLineageSchema } from
  "../../../../../src/scripts/review-gate/core/lane-admission.js";
import {
  FrontlineRunStateSchema,
  LaneProgressStateSchema,
  LocalReviewStateSchema,
  ReviewOperationStateSchema,
  ReviewSuspensionStateSchema,
  type ReviewOperationState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../../../../../src/scripts/review-gate/core/ports.js";
import { projectLocalReviewGuidance } from
  "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";

const digest = (value: string) => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

const localTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: objectId("a"),
  diffBaseTree: objectId("b"),
  headSha: objectId("c"),
  headTree: objectId("d"),
});
const localRequirement = createReviewRequirement({
  target: localTarget,
  projection: {
    obligation: "recommended",
    reasons: ["routine-code"],
    rubricVersion: "standard-review/v1",
    rubricDigest: digest("rubric"),
    retrigger: "full-final",
    count: 1,
  },
  acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
  initialAdmission: "checkpoint",
});
if (localRequirement === null) throw new Error("expected local requirement");
const localLineage = { kind: "candidate" as const, candidateId: digest("candidate") };
const localCarrier = createLocalChangeSetCarrier({
  target: localTarget,
  lineage: localLineage,
  logicalPass: 1,
  requirementId: localRequirement.requirementId,
  snapshot: {
    state: "exact",
    repositoryId: localTarget.repositoryId,
    baseRef: localTarget.baseRef,
    diffBaseSha: localTarget.diffBaseSha,
    diffBaseTree: localTarget.diffBaseTree,
    headSha: localTarget.headSha,
    headTree: localTarget.headTree,
  },
  authorIdentity: "author-1",
  evaluatorIdentity: "evaluator-1",
  attestation: {
    evaluatorIdentity: "evaluator-1",
    runtimeIdentity: "arc-cli/0.1.0",
    mechanism: "local-attestation",
  },
  generation: 0,
  requestMechanism: "local-attestation",
});

const frontline = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-operation/v1" as const,
  operationId: "frontline-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "frontline-run" as const,
  targetId: digest("target"),
  sourceIdentity: "local-frontline",
  generation: 0,
  outcome: "findings" as const,
  passCount: 1,
  policyVersion: digest("policy"),
  sourceBindingId: digest("source-binding"),
};

const suspension = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-operation/v1" as const,
  operationId: "suspension-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "review-suspension" as const,
  vehicle: { kind: "work-unit" as const, identity: "review-architecture" },
  repositoryId: "repo-1",
  changeRequestId: "pull/42",
  targetId: digest("target"),
  requestId: digest("request"),
  sourceIdentity: "codex-pr",
  generation: 1,
  policyVersion: digest("policy"),
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  deadlineAt: "2026-07-20T21:00:00Z",
  wakeupToken: digest("wakeup"),
};

const localReview = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-operation/v1" as const,
  operationId: "local-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "local-review" as const,
  vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
  lineage: localLineage,
  logicalPass: 1,
  retryGeneration: 0,
  repositoryId: "repo-1",
  targetId: localTarget.targetId,
  requestId: localCarrier.request.requestId,
  policyVersion: localRequirement.policyVersion,
  policyBindingDigest: digest("binding"),
  laneSourceId: "delegated-agent",
  attestationRuntimeKind: "arc-cli",
  sourceRef: "refs/arc/review/local-1",
  sourceDigest: digest("source"),
  guidance: projectLocalReviewGuidance().projection,
  guidanceDigest: projectLocalReviewGuidance().guidanceDigest,
  reviewerInstructions: projectLocalReviewGuidance().reviewerInstructions,
  target: localTarget,
  requirement: localRequirement,
  request: localCarrier.request,
  attestation: localCarrier.attestation,
  cleanupTtlMs: 86_400_000,
};

const laneProgress = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-operation/v1" as const,
  operationId: "lane-progress-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "lane-progress" as const,
  lane: "standard" as const,
  repositoryId: "repo-1",
  lineage: localLineage,
  completedPasses: 0,
  attempts: [{
    attemptId: "hosted/attempt-1",
    logicalPass: 1,
    retryGeneration: 0,
    changeRequestId: null,
    headSha: objectId("c"),
    terminalProducer: false,
    sourceId: "coderabbit-pr",
    outcome: "rate-limited" as const,
  }],
};

const memberTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "delivery-member",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: objectId("a"),
  diffBaseTree: objectId("b"),
  headSha: objectId("c"),
  headTree: objectId("d"),
});
const memberRequirement = createReviewRequirement({
  target: memberTarget,
  projection: {
    obligation: "recommended",
    reasons: ["routine-code"],
    rubricVersion: "standard-review/v1",
    rubricDigest: digest("rubric"),
    retrigger: "full-final",
    count: 1,
  },
  acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
  initialAdmission: "checkpoint",
});
if (memberRequirement === null) throw new Error("expected member requirement");
const memberLineage = LaneSubjectLineageSchema.parse({
  kind: "delivery-member" as const,
  planId: "123e4567-e89b-12d3-a456-426614174000",
  workUnitId: "review-surface-binding",
  deliverableId: digest("deliverable"),
});
const memberCarrier = createLocalChangeSetCarrier({
  target: memberTarget,
  lineage: memberLineage,
  logicalPass: 1,
  requirementId: memberRequirement.requirementId,
  snapshot: {
    state: "exact",
    repositoryId: memberTarget.repositoryId,
    baseRef: memberTarget.baseRef,
    diffBaseSha: memberTarget.diffBaseSha,
    diffBaseTree: memberTarget.diffBaseTree,
    headSha: memberTarget.headSha,
    headTree: memberTarget.headTree,
  },
  authorIdentity: "author-1",
  evaluatorIdentity: "evaluator-1",
  attestation: {
    evaluatorIdentity: "evaluator-1",
    runtimeIdentity: "arc-cli/0.1.0",
    mechanism: "local-attestation",
  },
  generation: 0,
  requestMechanism: "local-attestation",
});
const memberReview = {
  ...localReview,
  vehicle: { kind: "delivery-member" as const, identity: digest("deliverable") },
  lineage: memberLineage,
  targetId: memberTarget.targetId,
  requestId: memberCarrier.request.requestId,
  policyVersion: memberRequirement.policyVersion,
  target: memberTarget,
  requirement: memberRequirement,
  request: memberCarrier.request,
  attestation: memberCarrier.attestation,
};

describe("review operation state schemas", () => {
  it("round-trips the immutable local-review operation and rejects missing or extra fields", () => {
    expect(LocalReviewStateSchema.parse(localReview)).toEqual(localReview);
    expect(() => LocalReviewStateSchema.parse({ ...localReview, sourceRef: undefined })).toThrow();
    expect(() => LocalReviewStateSchema.parse({ ...localReview, phase: "ready" })).toThrow();
    expect(() => LocalReviewStateSchema.parse({
      ...localReview,
      requestId: digest("different-request"),
    })).toThrow(/request/iu);
  });

  it("accepts the new frontline terminal outcomes", () => {
    expect(FrontlineRunStateSchema.parse({ ...frontline, outcome: "timed-out" }).outcome).toBe("timed-out");
    expect(FrontlineRunStateSchema.parse({ ...frontline, outcome: "stale-target" }).outcome).toBe("stale-target");
  });

  it("discriminates all three registered operation variants", () => {
    const records: ReviewOperationState[] = [
      FrontlineRunStateSchema.parse(frontline),
      ReviewSuspensionStateSchema.parse(suspension),
      LocalReviewStateSchema.parse(localReview),
    ];
    expect(records.map((record) => record.kind)).toEqual(["frontline-run", "review-suspension", "local-review"]);
    expect(() => ReviewOperationStateSchema.parse({ ...frontline, kind: "controller-verdict" })).toThrow();
  });

  it("round-trips a delivery-member vehicle keyed by its deliverable id", () => {
    expect(LocalReviewStateSchema.parse(memberReview)).toEqual(memberReview);
    expect(ReviewOperationStateSchema.parse(memberReview)).toEqual(memberReview);
  });

  it("accepts a canonical deliverable-id digest as a vehicle identity", () => {
    const deliverableId = digest("deliverable");
    expect(deliverableId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(LocalReviewStateSchema.parse(memberReview).vehicle.identity).toBe(deliverableId);
  });

  it("rejects crossed delivery-member vehicle and target kinds", () => {
    expect(() => LocalReviewStateSchema.parse({
      ...localReview,
      vehicle: memberReview.vehicle,
    })).toThrow(/vehicle and target kinds mismatch/iu);
    expect(() => LocalReviewStateSchema.parse({
      ...memberReview,
      vehicle: localReview.vehicle,
    })).toThrow(/vehicle and target kinds mismatch/iu);
  });

  it("leaves the work-unit and errand vehicles unaffected", () => {
    for (const vehicle of [
      { kind: "work-unit" as const, identity: "review-surface-binding" },
      { kind: "errand" as const, identity: "archived-integration-recovery" },
    ]) {
      expect(LocalReviewStateSchema.parse({ ...localReview, vehicle }).vehicle).toEqual(vehicle);
      expect(ReviewSuspensionStateSchema.parse({ ...suspension, vehicle }).vehicle).toEqual(vehicle);
    }
    expect(() => LocalReviewStateSchema.parse({
      ...localReview,
      vehicle: { kind: "delivery-plan", identity: digest("plan") },
    })).toThrow();
  });

  it("rejects evidence, approval, authorization, and unknown fields", () => {
    for (const forbidden of [
      { approval: { approvedBy: "maintainer" } },
      { receipt: { result: "clean" } },
      { fixAuthorization: digest("authorization") },
      { nextAction: "Resume review" },
    ]) {
      expect(() => ReviewOperationStateSchema.parse({ ...suspension, ...forbidden })).toThrow();
    }
  });

  it("round-trips lane progress and rejects extra or missing fields", () => {
    expect(LaneProgressStateSchema.parse(laneProgress)).toEqual(laneProgress);
    expect(() => LaneProgressStateSchema.parse({ ...laneProgress, lane: undefined })).toThrow();
    expect(() => LaneProgressStateSchema.parse({ ...laneProgress, resolvedAt: "2026-07-20T20:00:00Z" })).toThrow();
    expect(() => LaneProgressStateSchema.parse({ ...laneProgress, lane: "hosted" })).toThrow();
  });

  it("keeps every attempt outcome the fall-through decision reads", () => {
    for (const outcome of [
      "clean",
      "findings",
      "rate-limited",
      "transient-unavailable",
      "partial",
      "ambiguous-delivery",
      "malformed",
      "timed-out",
      "stale-target",
      "capability-unsupported",
      "source-unbound",
      "terminal-failure",
    ]) {
      const terminalProducer = outcome === "clean" || outcome === "findings";
      const parsed = LaneProgressStateSchema.parse({
        ...laneProgress,
        completedPasses: terminalProducer ? 1 : 0,
        attempts: [{ ...laneProgress.attempts[0], outcome, terminalProducer }],
      });
      expect(parsed.attempts[0]?.outcome).toBe(outcome);
    }
  });

  it("refuses a collapsed unavailable outcome that loses the fall-through distinction", () => {
    for (const collapsed of ["unavailable", "failed"]) {
      expect(() => LaneProgressStateSchema.parse({
        ...laneProgress,
        attempts: [{ ...laneProgress.attempts[0], outcome: collapsed }],
      })).toThrow();
    }
  });

  it("preserves attempt order as recorded", () => {
    const attempts = [
      laneProgress.attempts[0],
      {
        ...laneProgress.attempts[0],
        attemptId: "hosted/attempt-2",
        retryGeneration: 1,
        sourceId: "codex-pr",
        outcome: "transient-unavailable" as const,
      },
      {
        ...laneProgress.attempts[0],
        attemptId: "local/attempt-3",
        retryGeneration: 2,
        terminalProducer: true,
        sourceId: "delegated-agent",
        outcome: "findings" as const,
      },
    ];
    expect(LaneProgressStateSchema.parse({ ...laneProgress, completedPasses: 1, attempts }).attempts).toEqual(attempts);
  });

  it("binds hosted and local attempt evidence to their owning source kinds", () => {
    const localAttempt = {
      ...laneProgress.attempts[0],
      attemptId: "local-1",
      terminalProducer: true,
      sourceId: "delegated-agent",
      outcome: "clean" as const,
      local: {
        operationId: "local-1",
        requestId: localCarrier.request.requestId,
        vehicle: localReview.vehicle,
        target: localTarget,
      },
    };
    expect(LaneProgressStateSchema.parse({
      ...laneProgress,
      completedPasses: 1,
      attempts: [localAttempt],
    }).attempts).toEqual([localAttempt]);
    expect(() => LaneProgressStateSchema.parse({
      ...laneProgress,
      completedPasses: 1,
      attempts: [{ ...localAttempt, sourceId: "coderabbit-pr" }],
    })).toThrow(/local attempt source/iu);
    expect(() => LaneProgressStateSchema.parse({
      ...laneProgress,
      completedPasses: 1,
      attempts: [{
        ...localAttempt,
        local: { ...localAttempt.local, operationId: "local-other" },
      }],
    })).toThrow(/local attempt operation/iu);

    const hostedAttempt = {
      ...laneProgress.attempts[0]!,
      sourceId: "delegated-agent",
      hosted: {
        target: { repository: "owner/repo", pullRequest: 42, headSha: memberTarget.headSha },
        requestedCoverage: "complete" as const,
        effectiveCoverage: "complete" as const,
        vehicle: {
          kind: "delivery-member" as const,
          planId: "123e4567-e89b-12d3-a456-426614174000",
          deliverableId: digest("deliverable"),
          workUnitId: "review-surface-binding",
          head: memberTarget.headSha,
        },
        reviewTarget: memberTarget,
        requirement: memberRequirement,
        actorIdentity: "reviewer-1",
        findings: [],
        dispositionSetId: null,
        settledFindingIds: [],
      },
    };
    expect(() => LaneProgressStateSchema.parse({
      ...laneProgress,
      changeRequestId: "pull/42",
      attempts: [hostedAttempt],
    })).toThrow(/hosted attempt source/iu);
  });

  it("rejects a source id the policy driver would refuse", () => {
    for (const sourceId of ["CodeRabbit_PR", "-leading", "trailing-", "has space"]) {
      expect(() => LaneProgressStateSchema.parse({
        ...laneProgress,
        attempts: [{ ...laneProgress.attempts[0], sourceId }],
      })).toThrow();
    }
  });

  it("carries a chunk-series completion flag when the attempt had one", () => {
    const attempts = [{
      ...laneProgress.attempts[0],
      chunkSeriesComplete: true,
    }];
    expect(LaneProgressStateSchema.parse({ ...laneProgress, attempts }).attempts).toEqual(attempts);
  });

  it("retains change-request binding on each attempt", () => {
    expect(LaneProgressStateSchema.parse(laneProgress).attempts[0]?.changeRequestId).toBeNull();
    const bound = {
      ...laneProgress,
      attempts: [{ ...laneProgress.attempts[0], changeRequestId: "pull/42" }],
    };
    expect(LaneProgressStateSchema.parse(bound).attempts[0]?.changeRequestId).toBe("pull/42");
  });

  it("rejects an attempt outside its head-bound owner lineage", () => {
    expect(() => LaneProgressStateSchema.parse({
      ...laneProgress,
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: "repair-review-state",
        headSha: objectId("e"),
      },
    })).toThrow(/lineage/iu);
  });

  it("keeps the record free of host vocabulary the core boundary forbids", () => {
    expect(() => LaneProgressStateSchema.parse({
      ...laneProgress,
      target: { repository: "owner/repo", pullRequest: 42, headSha: objectId("c") },
    })).toThrow();
  });

  it("discriminates lane progress inside the operation-state union", () => {
    expect(ReviewOperationStateSchema.parse(laneProgress)).toEqual(laneProgress);
    expect(ReviewOperationStateSchema.parse(laneProgress).kind).toBe("lane-progress");
  });

  it("crosses storage only through the injected versioned port", async () => {
    let state: ReviewOperationState | null = null;
    let version = 0;
    const store: ReviewOperationStateStore = {
      readOperation: async () => ({ version, state }),
      publishOperation: async (next, expectedVersion) => {
        if (expectedVersion !== version) throw new Error("operation-state-version-conflict");
        state = ReviewOperationStateSchema.parse(next);
        version += 1;
        return { version };
      },
    };
    await expect(store.publishOperation(frontline, 0)).resolves.toEqual({ version: 1 });
    await expect(store.readOperation("frontline-1")).resolves.toEqual({ version: 1, state: frontline });
  });
});
