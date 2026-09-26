/** Current-contribution applicability in pre-publication policy composition. */

import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import {
  composePrePublicationReviewRequest,
  type AssuranceRead,
  type CandidateRead,
  type ImmutableTargetRead,
  type PrePublicationCompositionDependencies,
  type ReviewLane,
  type TargetRead,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";
import {
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import { resolveReviewRouting } from
  "../../../../../src/scripts/review-gate/policy/routing.js";
import { resolveReviewPolicy } from
  "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { projectStandardReviewObligation } from
  "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";

const HEAD = "a".repeat(40);
const CANDIDATE_ID = `sha256:${"c".repeat(64)}`;
const DELIVERY_PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const WORK_UNIT_ID = SlugSchema.parse("example");
const digest = (value: string): string => canonicalDigest({ value });

const currentCandidate: CandidateRead = {
  status: "current",
  candidateId: CANDIDATE_ID,
  headSha: HEAD,
  subjectDigest: `sha256:${"d".repeat(64)}`,
  implementationChanged: false,
  convergenceVerification: "satisfied",
  convergenceScope: null,
  lineageHeadShas: [HEAD],
};

const resolvedAssurance: AssuranceRead = {
  status: "resolved",
  assurance: { workContext: "work-unit", workClass: "Heavy" },
  activity: { selfReview: true, frontlineReview: false },
};

const resolvedTarget: TargetRead = {
  status: "resolved",
  target: { repository: "arc-framework/example", pullRequest: null, headSha: HEAD },
};

const immutableTarget: ImmutableTargetRead = {
  status: "resolved",
  target: createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "arc-framework/example",
    baseRef: "main",
    diffBaseSha: "c".repeat(40),
    diffBaseTree: "d".repeat(40),
    headSha: HEAD,
    headTree: "e".repeat(40),
  }),
};

function deliveryMemberTarget(input: {
  deliverableCharacter: string;
  baseCharacter: string;
  headCharacter: string;
}) {
  const head = input.headCharacter.repeat(40);
  return {
    target: createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "arc-framework/example",
      baseRef: "main",
      diffBaseSha: input.baseCharacter.repeat(40),
      diffBaseTree: input.baseCharacter.repeat(40),
      headSha: head,
      headTree: input.headCharacter.repeat(40),
    }),
    vehicle: {
      kind: "delivery-member" as const,
      planId: DELIVERY_PLAN_ID,
      deliverableId: `sha256:${input.deliverableCharacter.repeat(64)}`,
      workUnitId: WORK_UNIT_ID,
      head,
    },
  };
}

const defaultStandardReview = projectStandardReviewObligation(resolveReviewRouting({
  schemaVersion: 1,
  changeSetState: "unknown",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
  assurance: resolvedAssurance.assurance,
  activity: resolvedAssurance.activity,
}).decision);

function hostedFindingsResult(
  producerId: string,
  pullRequest: number,
): ReviewResult {
  if (immutableTarget.status !== "resolved") throw new Error("expected immutable target");
  const requirement = createReviewRequirement({
    target: immutableTarget.target,
    projection: defaultStandardReview,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  return {
    kind: "hosted",
    producerId,
    repositoryId: immutableTarget.target.repositoryId,
    target: immutableTarget.target,
    sourceIdentity: "codex-pr",
    originalOutcome: "findings",
    findings: [{
      findingId: "finding-1",
      severity: "major",
      locus: "src/example.ts:1",
      evidenceUrlOrId: "hosted:finding-1",
      sourceOrdinal: 1,
    }],
    resultDigest: digest(`${producerId}-result`),
    admission: {
      lineage: { kind: "candidate", candidateId: CANDIDATE_ID },
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: "whole-target",
      policyVersion: requirement.policyVersion,
    },
    laneOperationId: "lane-progress-standard",
    actorIdentity: "reviewer-1",
    hostedTarget: {
      repository: "arc-framework/example",
      pullRequest,
      headSha: HEAD,
    },
    requirement,
    hostSettlementFindingIds: [],
    noHostSettlementFindingIds: [],
    settled: false,
  };
}

function dependencies(
  overrides: Partial<PrePublicationCompositionDependencies> = {},
): PrePublicationCompositionDependencies {
  return {
    resultReader: {
      readResult: vi.fn(async () => {
        throw new Error("unexpected review result read");
      }),
    },
    dispositionStore: {
      readDispositionRecord: vi.fn(async () => null),
      appendDispositionRecord: vi.fn(async () => {
        throw new Error("unexpected disposition write");
      }),
    },
    readResponsePerformance: vi.fn(async () => null),
    confirmIncrementalApplicability: vi.fn(async () => "applicable" as const),
    confirmPriorProducerApplicability: vi.fn(async () => "applicable" as const),
    readCandidate: vi.fn(async () => currentCandidate),
    readAssurance: vi.fn(async () => resolvedAssurance),
    resolveTarget: vi.fn(async () => resolvedTarget),
    readReservationTarget: vi.fn(async (_workUnit, singleton) => ({
      status: "resolved" as const,
      target: { kind: "pinned-head" as const, ...singleton },
    })),
    readDeliveryReviewTargets: vi.fn(async () => ({ status: "absent" as const })),
    deriveImmutableTarget: vi.fn(async () => immutableTarget),
    readOwnerTerminusAuthority: vi.fn(async () => ({
      status: "authorized" as const,
      ownerIdentity: "andrew",
    })),
    readLaneProgress: vi.fn(async (): Promise<LaneProgressProjection> => ({
      status: "recorded",
      completedPasses: 0,
      completePasses: 0,
      attempts: [],
    })),
    readLanePolicy: vi.fn(async (lane: ReviewLane) => lane === "frontline"
      ? { sources: [], maxPasses: 2 }
      : { sources: ["codex-pr"], maxPasses: 2 }),
    ...overrides,
  };
}

describe("pre-publication current contribution applicability", () => {
  it("asks contribution authority for a same-owner delivery predecessor", async () => {
    const priorMember = deliveryMemberTarget({
      deliverableCharacter: "1", baseCharacter: "2", headCharacter: "3",
    });
    const currentMember = deliveryMemberTarget({
      deliverableCharacter: "1", baseCharacter: "4", headCharacter: "5",
    });
    const requirement = (target: ReviewResult["target"]) => createReviewRequirement({
      target,
      projection: defaultStandardReview,
      acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
      initialAdmission: "automatic",
    });
    const priorRequirement = requirement(priorMember.target);
    const currentRequirement = requirement(currentMember.target);
    if (priorRequirement === null || currentRequirement === null) throw new Error("missing requirement");
    const lineage = {
      kind: "delivery-member" as const,
      planId: currentMember.vehicle.planId,
      deliverableId: currentMember.vehicle.deliverableId,
      workUnitId: currentMember.vehicle.workUnitId,
    };
    const request = (target: ReviewResult["target"], requirementId: string, logicalPass: number) =>
      createReviewRequest(target, {
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        repositoryId: target.repositoryId,
        targetId: target.targetId,
        requirementId,
        carrier: { kind: "local-change-set", adapterId: "delegated-agent", changeRequestId: null },
        authorIdentity: "andrew",
        evaluatorIdentity: "codex",
        lineageId: digest("member-lineage"),
        logicalPass,
        generation: 0,
        requestMechanism: "subagent",
      });
    const predecessor: ReviewResult = {
      kind: "attested-local",
      producerId: "attempt-prior-member",
      repositoryId: priorMember.target.repositoryId,
      target: priorMember.target,
      sourceIdentity: "delegated-agent",
      originalOutcome: "clean",
      findings: [],
      resultDigest: digest("prior-member-result"),
      admission: {
        lineage, logicalPass: 1, retryGeneration: 0,
        requestedCoverage: "complete", effectiveCoverage: "complete",
        scopeMode: "whole-target", policyVersion: priorRequirement.policyVersion,
      },
      requirement: priorRequirement,
      vehicle: { kind: "delivery-member", identity: priorMember.vehicle.deliverableId },
      receiptRef: "receipts/prior-member.json",
      localSourceRef: "sources/prior-member.json",
      request: request(priorMember.target, priorRequirement.requirementId, 1),
    };
    const current: ReviewResult = {
      ...predecessor,
      producerId: "attempt-current-member",
      target: currentMember.target,
      originalOutcome: "clean",
      findings: [],
      resultDigest: digest("current-member-result"),
      admission: {
        ...predecessor.admission,
        logicalPass: 2,
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
        correctionScope: {
          schemaVersion: 1,
          predecessorProducerId: predecessor.producerId,
          predecessorHeadSha: predecessor.target.headSha,
          basisHeadSha: predecessor.target.headSha,
          headSha: currentMember.target.headSha,
          requiredFindings: [],
        },
        policyVersion: currentRequirement.policyVersion,
      },
      requirement: currentRequirement,
      request: request(currentMember.target, currentRequirement.requirementId, 2),
    };
    const confirmIncrementalApplicability = vi.fn(async () => "review-required" as const);
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" },
      dependencies({
        readReservationTarget: async () => ({
          status: "resolved",
          target: {
            kind: "delivery", repository: "arc-framework/example",
            planId: DELIVERY_PLAN_ID, workUnitId: WORK_UNIT_ID,
          },
        }),
        readDeliveryReviewTargets: async () => ({
          status: "composed", planId: DELIVERY_PLAN_ID, targets: [currentMember],
        }),
        resultReader: { readResult: async (id) => id === predecessor.producerId ? predecessor : current },
        confirmIncrementalApplicability,
        readLanePolicy: async (lane) => lane === "standard"
          ? { sources: ["delegated-agent"], maxPasses: 2 }
          : { sources: [], maxPasses: 2 },
        readLaneProgress: async (lane) => lane === "standard"
          ? {
              status: "recorded", completedPasses: 2, completePasses: 1,
              attempts: [{
                attemptId: current.producerId, logicalPass: 2,
                sourceId: "delegated-agent", outcome: "clean",
              }],
            }
          : { status: "recorded", completedPasses: 0, completePasses: 0, attempts: [] },
      }),
    );
    expect(composition.status === "refused" ? composition.reason : "").toBe("");
    expect(composition.status === "composed" && composition.request.standard).toMatchObject({
      verifiedTerminalSignal: { coverageAdequate: false },
    });
    expect(confirmIncrementalApplicability).toHaveBeenCalledWith(
      "example", expect.objectContaining({ producerId: predecessor.producerId }),
      expect.objectContaining({ producerId: current.producerId }),
      expect.anything(),
    );
  });

  it("routes a same-head old-base clean terminal through current applicability", async () => {
    const priorRaw = hostedFindingsResult("attempt-old-base", 42);
    if (priorRaw.kind !== "hosted") throw new Error("expected hosted result");
    const prior: ReviewResult = {
      ...priorRaw,
      originalOutcome: "clean",
      findings: [],
    };
    const { targetId: _targetId, ...currentInput } = prior.target;
    void _targetId;
    const currentTarget = createReviewTarget({
      ...currentInput,
      diffBaseSha: "7".repeat(40),
      diffBaseTree: "8".repeat(40),
    });
    const confirmPriorProducerApplicability = vi.fn(async () => "review-required" as
      "applicable" | "review-required" | "unavailable");
    const deps = dependencies({
      resolveTarget: async () => ({
        status: "resolved", target: { repository: "arc-framework/example", pullRequest: 42, headSha: HEAD },
      }),
      deriveImmutableTarget: async () => ({ status: "resolved", target: currentTarget }),
      resultReader: { readResult: async () => prior },
      confirmPriorProducerApplicability,
      readLaneProgress: async (lane) => lane === "standard"
        ? {
            status: "recorded", completedPasses: 1, completePasses: 1,
            attempts: [{
              attemptId: prior.producerId, logicalPass: 1,
              sourceId: "codex-pr", outcome: "clean",
              hosted: { reviewTarget: prior.target },
            }],
          } as unknown as LaneProgressProjection
        : { status: "recorded", completedPasses: 0, completePasses: 0, attempts: [] },
    });
    const required = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" }, deps,
    );
    expect(required.status).toBe("composed");
    if (required.status !== "composed") return;
    expect(required.request.standard.attempts).toEqual([]);
    expect(required.request.standard.verifiedTerminalSignal).toBeUndefined();
    expect(resolveReviewPolicy(required.request.standard)).toMatchObject({
      state: "ready", nextAction: "hosted-request",
    });
    expect(confirmPriorProducerApplicability).toHaveBeenCalledWith(
      "example", prior, currentTarget,
      { kind: "candidate", candidateId: CANDIDATE_ID },
      expect.anything(),
    );

    confirmPriorProducerApplicability.mockResolvedValue("unavailable");
    const unavailable = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" }, deps,
    );
    expect(unavailable.status === "composed" && resolveReviewPolicy(unavailable.request.standard))
      .toMatchObject({ state: "ready", nextAction: "hosted-request" });

    confirmPriorProducerApplicability.mockResolvedValue("applicable");
    const retained = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" }, deps,
    );
    expect(retained.status === "composed" && retained.request.standard).toMatchObject({
      verifiedTerminalSignal: { reviewOperationId: prior.producerId, coverageAdequate: true },
    });
  });

});
