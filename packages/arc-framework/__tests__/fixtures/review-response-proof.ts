/** Immutable producers and validated approvals for response-chain tests. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { ApprovedDispositionRecordSchema } from "../../src/scripts/review-gate/core/advisory-records.js";
import { approveDispositionState, createDispositionSet, proposeDispositionSet } from "../../src/scripts/review-gate/core/dispositions.js";
import { createReviewRequirement, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from "../../src/scripts/review-gate/core/review-result.js";
import { bindReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";
import { responsePolicyRequestFixture } from "./review-response-policy.js";

const objectId = (character: string): string => character.repeat(40);
const digest = (value: string) => canonicalDigest({ value });

const policyTarget = {
  repository: "arc-framework/example",
  pullRequest: 42,
  headSha: objectId("c"),
};

const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  retrigger: "full-final" as const,
  count: 1 as const,
};

export function cleanHostedResult(): ReviewResult {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: policyTarget.headSha,
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: standardReview,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  return {
    kind: "hosted",
    producerId: "hosted/attempt-1",
    repositoryId: target.repositoryId,
    target,
    sourceIdentity: "codex-pr",
    originalOutcome: "clean",
    findings: [],
    resultDigest: digest("result"),
    admission: {
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: "example",
        headSha: target.headSha,
      },
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: "whole-target",
      policyVersion: requirement.policyVersion,
    },
    laneOperationId: "lane-progress-standard",
    actorIdentity: "reviewer-1",
    hostedTarget: policyTarget,
    requirement,
    hostSettlementFindingIds: [],
    noHostSettlementFindingIds: [],
    settled: false,
  };
}

export function approvedRecord(
  result: ReviewResult,
  judgments: readonly ({
    sourceVerification: "verified";
    verifiedSeverity: "critical" | "major" | "minor";
    disposition: "fix" | "defer" | "reject";
  } | {
    sourceVerification: "not-supported";
    verifiedSeverity: null;
    disposition: "reject";
  })[],
) {
  if (result.kind === "frontline") throw new Error("expected standard result");
  const set = createDispositionSet({
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
    findings: judgments.map((judgment, index) => {
      const finding = result.findings[index];
      if (finding === undefined) throw new Error("missing producer finding");
      const common = {
        findingId: finding.findingId,
        sourceIdentity: result.sourceIdentity,
        locus: finding.locus,
        verificationRefs: [`source:${finding.locus}`],
        reportedSeverity: finding.severity,
        rationale: "The source check established this disposition.",
        recommendation: "Record the approved response.",
        openQuestions: [],
      };
      return judgment.sourceVerification === "verified"
        ? { ...common, ...judgment }
        : { ...common, ...judgment };
    }),
  });
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(set),
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
    source: result.kind === "attested-local" ? {
      kind: "attested-local",
      receiptRef: bindReviewSourceReference({ kind: "attested-local", operationId: result.producerId, durableRef: result.receiptRef }),
      localSourceRef: result.localSourceRef,
    } : {
      kind: "hosted",
      attemptRef: bindReviewSourceReference({ kind: "hosted", operationId: result.laneOperationId, durableRef: result.producerId }),
      hostedResultId: result.resultDigest,
    },
    currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
    approvedDispositionLineage: [{
      approvedDisposition,
      responsePolicyRequest: responsePolicyRequestFixture({
        repository: result.kind === "hosted" ? result.hostedTarget.repository : `local/${result.repositoryId}`,
        pullRequest: result.kind === "hosted" ? result.hostedTarget.pullRequest : null,
        headSha: result.target.headSha,
        sourceId: result.sourceIdentity,
        reviewOperationId: result.producerId,
        completedPasses: result.admission.logicalPass,
        standardReview: {
          obligation: result.requirement.obligation, reasons: result.requirement.reasons,
          rubricVersion: result.requirement.rubricVersion, rubricDigest: result.requirement.rubricDigest,
          retrigger: result.requirement.retrigger, count: result.requirement.count,
        },
      }),
      fixAuthorization: null,
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
      predecessorDispositionSetId: null,
      successorDispositionSetId: null,
    }],
  });
}

export function findingsHostedResult(
  severities: readonly ("critical" | "major" | "minor")[],
): ReviewResult {
  const clean = cleanHostedResult();
  return {
    ...clean,
    originalOutcome: "findings",
    findings: severities.map((severity, index) => ({
      findingId: `finding-${index + 1}`,
      severity,
      locus: `src/example.ts:${index + 1}`,
      evidenceUrlOrId: `hosted:finding-${index + 1}`,
      sourceOrdinal: index + 1,
    })),
    resultDigest: digest(`result-${severities.join("-")}`),
  };
}

export function performedFix(result: ReviewResult, record: ReturnType<typeof approvedRecord>) {
  return {
    schemaVersion: 1 as const,
    producerId: result.producerId,
    dispositionSetId: record.currentDispositionSetId,
    originatingHeadSha: result.target.headSha,
    producedHeadSha: result.target.headSha,
    performedAt: "2026-09-09T21:00:00Z",
  };
}
