import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import { ApprovedDispositionRecordSchema } from
  "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewRequirement, createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import type { IncrementalPredecessorApplicability } from
  "../../../../../src/scripts/review-gate/policy/incremental-coverage-basis.js";
import { bindReviewSourceReference } from
  "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";

const evidence = vi.hoisted(() => ({
  results: new Map<string, ReviewResult>(),
  records: new Map<string, unknown>(),
  confirmApplicability: vi.fn(async (): Promise<IncrementalPredecessorApplicability> => "applicable"),
  confirmMemberApplicability: vi.fn(async (): Promise<IncrementalPredecessorApplicability> => "review-required"),
  readPerformance: vi.fn(async () => null as unknown),
}));

vi.mock("../../../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: async () => ({ settings: { "branch.base": "main" } }),
}));
vi.mock("../../../../../src/scripts/review-gate/policy/lane-policy-config.js", () => ({
  resolveConfiguredLanePolicy: async () => ({ sources: ["codex-pr"], maxPasses: 3 }),
}));
vi.mock("../../../../../src/scripts/review-gate/runtime/local-prepare-composition.js", () => ({
  createLocalPrepareDependencies: () => ({ operationStore: {} }),
}));
vi.mock("../../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js", () => ({
  createRepositoryReviewResultReader: () => ({
    readResult: async (producerId: string) => {
      const result = evidence.results.get(producerId);
      if (result === undefined) throw new Error("missing producer");
      return result;
    },
  }),
}));
vi.mock("../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js", () => ({
  LocalApprovedDispositionRecordStore: class {
    readDispositionRecord(producerId: string) {
      return Promise.resolve(evidence.records.get(producerId) ?? null);
    }
  },
}));
vi.mock("../../../../../src/scripts/review-gate/lane-progress.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../../src/scripts/review-gate/lane-progress.js")>(),
  readLaneResponsePerformance: evidence.readPerformance,
}));
vi.mock("../../../../../src/scripts/review-gate/policy/local-review-coverage-selection.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../../src/scripts/review-gate/policy/local-review-coverage-selection.js")>(),
  confirmNonDeliveryIncrementalApplicability: evidence.confirmApplicability,
  confirmDeliveryMemberIncrementalApplicability: evidence.confirmMemberApplicability,
}));

const { createRespondDependencies } = await import(
  "../../../../../src/scripts/review-gate/runtime/respond-composition.js"
);

const oid = (letter: string) => letter.repeat(40);
const digest = (value: string) => canonicalDigest({ value });
const projection = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  retrigger: "full-final" as const,
  count: 1 as const,
};

function hostedFinding(headSha: string, producerId: string, severity: "major" | "minor") {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("a"),
    diffBaseTree: oid("b"),
    headSha,
    headTree: oid(headSha === oid("c") ? "e" : "f"),
  });
  const requirement = createReviewRequirement({
    target,
    projection,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  return {
    kind: "hosted" as const,
    producerId,
    repositoryId: target.repositoryId,
    target,
    sourceIdentity: "codex-pr",
    originalOutcome: "findings" as const,
    findings: [{
      findingId: severity === "major" ? "prior-finding" : "current-finding",
      severity,
      locus: "src/example.ts:1",
      evidenceUrlOrId: `hosted:${producerId}`,
      sourceOrdinal: 1,
    }],
    resultDigest: digest(producerId),
    admission: {
      lineage: {
        kind: "head-bound" as const,
        vehicleKind: "errand",
        vehicleIdentity: "example",
        headSha,
      },
      logicalPass: headSha === oid("c") ? 1 : 2,
      retryGeneration: 0,
      requestedCoverage: headSha === oid("c") ? "complete" as const : "incremental" as const,
      effectiveCoverage: headSha === oid("c") ? "complete" as const : "incremental" as const,
      scopeMode: "whole-target" as const,
      policyVersion: requirement.policyVersion,
      ...(headSha === oid("c") ? {} : { correctionScope: {
        schemaVersion: 1 as const,
        predecessorProducerId: "hosted/prior",
        predecessorHeadSha: oid("c"),
        basisHeadSha: oid("c"),
        headSha,
        requiredFindings: [{
          producerId: "hosted/prior",
          findingId: "prior-finding",
          locus: "src/example.ts:1",
        }],
      } }),
    },
    laneOperationId: "lane-progress-standard",
    actorIdentity: "reviewer-1",
    hostedTarget: { repository: "owner/repo", pullRequest: 42, headSha },
    requirement,
    hostSettlementFindingIds: [],
    noHostSettlementFindingIds: [],
    settled: false,
  } satisfies ReviewResult;
}

function approvedRecord(result: ReviewResult, disposition: "fix" | "defer") {
  if (result.kind !== "hosted") throw new Error("expected hosted result");
  const finding = result.findings[0];
  if (finding === undefined) throw new Error("missing finding");
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: result.target.targetId,
      producerId: result.producerId,
      resultDigest: result.resultDigest,
      policyVersion: result.admission.policyVersion,
      rubricVersion: result.requirement.rubricVersion,
      rubricDigest: result.requirement.rubricDigest,
      proposedBy: "arc-cli/0.1.0",
      proposedVerification: "full",
      findings: [{
        findingId: finding.findingId,
        sourceIdentity: result.sourceIdentity,
        locus: finding.locus,
        verificationRefs: [`source:${finding.locus}`],
        reportedSeverity: finding.severity,
        sourceVerification: "verified",
        verifiedSeverity: finding.severity,
        disposition,
        rationale: "The source confirms this finding.",
        recommendation: "Record the approved response.",
        openQuestions: [],
      }],
    })),
    approvedBy: "andrew",
    approvedAt: "2026-09-09T20:00:00Z",
  });
  return ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: result.repositoryId,
    operationId: result.producerId,
    candidate: null,
    errand: null,
    deliveryMember: null,
    source: {
      kind: "hosted",
      attemptRef: bindReviewSourceReference({
        kind: "hosted",
        operationId: result.laneOperationId,
        durableRef: result.producerId,
      }),
      hostedResultId: result.resultDigest,
    },
    currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
    approvedDispositionLineage: [{
      approvedDisposition,
      responsePolicyRequest: responsePolicyRequestFixture({
        headSha: result.target.headSha,
        sourceId: result.sourceIdentity,
        reviewOperationId: result.producerId,
      }),
      fixAuthorization: null,
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
      predecessorDispositionSetId: null,
      successorDispositionSetId: null,
    }],
  });
}

describe("production respond policy composition", () => {
  it("accepts changed-head incremental findings after the prior fix was performed", async () => {
    const prior = hostedFinding(oid("c"), "hosted/prior", "major");
    const current = hostedFinding(oid("d"), "hosted/current", "minor");
    const priorRecord = approvedRecord(prior, "fix");
    evidence.results.set(prior.producerId, prior);
    evidence.results.set(current.producerId, current);
    evidence.records.set(prior.producerId, priorRecord);
    evidence.records.set(current.producerId, approvedRecord(current, "defer"));
    evidence.confirmApplicability.mockClear();
    evidence.readPerformance.mockReset().mockResolvedValue({
      schemaVersion: 1,
      producerId: prior.producerId,
      dispositionSetId: priorRecord.currentDispositionSetId,
      originatingHeadSha: prior.target.headSha,
      producedHeadSha: current.target.headSha,
      performedAt: "2026-09-09T20:01:00Z",
    });
    const dependencies = createRespondDependencies({ cwd: "/repo", exec: vi.fn() as never });
    const request = responsePolicyRequestFixture({
      headSha: current.target.headSha,
      repository: "owner/repo",
      pullRequest: 42,
      sourceId: current.sourceIdentity,
      reviewOperationId: current.producerId,
      completedPasses: 2,
      standardReview: projection,
    });

    await expect(dependencies.resolvePolicy(request, current.target)).resolves.toMatchObject({
      state: "pass-complete",
      nextAction: "none",
      payload: { verifiedTerminalSignal: { coverageAdequate: true } },
    });
    expect(evidence.confirmApplicability).toHaveBeenCalledWith(expect.objectContaining({
      predecessor: expect.objectContaining({ producerId: prior.producerId }),
      currentTarget: current.target,
      currentLineage: current.admission.lineage,
      repository: "owner/repo",
      pullRequest: 42,
    }));
    expect(evidence.readPerformance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ producerId: prior.producerId }),
    );

    evidence.readPerformance.mockResolvedValue(null);
    await expect(dependencies.resolvePolicy(request, current.target)).resolves.toMatchObject({
      state: "coverage-required",
      nextAction: "select-coverage",
      payload: { verifiedTerminalSignal: { coverageAdequate: false } },
    });
  });

  it("requires current contribution proof for a same-owner delivery member", async () => {
    const priorRaw = hostedFinding(oid("c"), "hosted/prior", "major");
    const currentRaw = hostedFinding(oid("d"), "hosted/current", "minor");
    const memberLineage = {
      kind: "delivery-member" as const,
      planId: "123e4567-e89b-12d3-a456-426614174000",
      deliverableId: digest("member"),
      workUnitId: SlugSchema.parse("example"),
    };
    const memberTarget = (source: ReviewResult["target"], base: string) => {
      const { targetId: _targetId, ...input } = source;
      void _targetId;
      return createReviewTarget({ ...input, kind: "delivery-member", diffBaseSha: base });
    };
    const priorTarget = memberTarget(priorRaw.target, oid("a"));
    const currentTarget = memberTarget(currentRaw.target, oid("b"));
    const requirement = (target: ReviewResult["target"]) => createReviewRequirement({
      target,
      projection,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    const priorRequirement = requirement(priorTarget);
    const currentRequirement = requirement(currentTarget);
    if (priorRequirement === null || currentRequirement === null) throw new Error("missing requirement");
    const prior: ReviewResult = {
      ...priorRaw,
      target: priorTarget,
      admission: { ...priorRaw.admission, lineage: memberLineage, policyVersion: priorRequirement.policyVersion },
      requirement: priorRequirement,
    };
    const current: ReviewResult = {
      ...currentRaw,
      target: currentTarget,
      admission: { ...currentRaw.admission, lineage: memberLineage, policyVersion: currentRequirement.policyVersion },
      requirement: currentRequirement,
    };
    const priorRecord = approvedRecord(prior, "fix");
    evidence.results.set(prior.producerId, prior);
    evidence.results.set(current.producerId, current);
    evidence.records.set(prior.producerId, priorRecord);
    evidence.records.set(current.producerId, approvedRecord(current, "defer"));
    evidence.confirmMemberApplicability.mockReset().mockResolvedValue("review-required");
    evidence.readPerformance.mockReset().mockResolvedValue({
      schemaVersion: 1,
      producerId: prior.producerId,
      dispositionSetId: priorRecord.currentDispositionSetId,
      originatingHeadSha: prior.target.headSha,
      producedHeadSha: current.target.headSha,
      performedAt: "2026-09-09T20:01:00Z",
    });
    const dependencies = createRespondDependencies({ cwd: "/repo", exec: vi.fn() as never });
    const request = responsePolicyRequestFixture({
      headSha: current.target.headSha,
      repository: "owner/repo",
      pullRequest: 42,
      sourceId: current.sourceIdentity,
      reviewOperationId: current.producerId,
      completedPasses: 2,
      standardReview: projection,
    });

    await expect(dependencies.resolvePolicy(request, current.target)).resolves.toMatchObject({
      state: "coverage-required",
      nextAction: "select-coverage",
      payload: { verifiedTerminalSignal: { coverageAdequate: false } },
    });
    expect(evidence.confirmMemberApplicability).toHaveBeenCalledWith(expect.objectContaining({
      predecessor: expect.objectContaining({ producerId: prior.producerId }),
      currentTarget,
      currentLineage: memberLineage,
    }));
  });
});
