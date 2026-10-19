/** Ended outcome fixtures built from production admissions and result constructors. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createReviewReceipt, createReviewRequirement } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from "../../src/scripts/review-gate/core/local-operation.js";
import { createHostedHandleFixture, createHostedTerminalAttemptFixture, type HostedHandleFixtureInput } from "./hosted-review.js";
import type { NormalizedReviewFinding } from "../../src/scripts/review-gate/core/finding-records.js";
import type { HostedFinding } from "../../src/scripts/review-gate/hosted/await.js";
import { projectHostedFinding } from "../../src/scripts/review-gate/hosted/await.js";
import type { LaneSubjectLineage } from "../../src/scripts/review-gate/core/lane-admission.js";
import type { ReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import type { LocalReviewAuthority } from "../../src/scripts/review-gate/core/local-review-authority.js";
import type { LocalReviewCoverageAdmission } from "../../src/scripts/review-gate/core/local-review-coverage.js";
import type { ReviewScopeMode } from "../../src/scripts/review-gate/core/review-primitives.js";
import type { DeliveryLocalReviewAdmission } from "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { createFrontlineFixture } from "./frontline-review.js";

export function hostedOutcome(options: HostedHandleFixtureInput & {
  outcome?: "clean" | "findings"; findings?: readonly HostedFinding[];
} = {}) {
  const handle = createHostedHandleFixture(options);
  const { attemptId, hosted } = createHostedTerminalAttemptFixture({ admission: handle.admission, outcome: options.outcome ?? "clean", findings: options.findings, artifact: options.artifact, effectiveCoverage: options.effectiveCoverage });
  const binding = {
    admission: hosted.admission, handle: hosted.handle, target: hosted.target,
    requestedCoverage: hosted.requestedCoverage, effectiveCoverage: hosted.effectiveCoverage,
    reviewTarget: hosted.reviewTarget, requirement: hosted.requirement, actorIdentity: hosted.actorIdentity,
    requestFailureReason: hosted.requestFailureReason, sealedResult: hosted.sealedResult,
    ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
  };
  return {
    schemaVersion: 1, attemptId, lane: "standard", lineage: handle.admission.lineage,
    logicalPass: handle.admission.logicalPass, retryGeneration: 0, source: { sourceId: handle.provider, kind: "hosted" },
    target: handle.admission.reviewTarget, requestedCoverage: handle.requestedCoverage, effectiveCoverage: hosted.effectiveCoverage,
    ...(handle.admission.correctionScope === undefined ? {} : { correctionScope: handle.admission.correctionScope }),
    outcome: options.outcome ?? "clean", findings: (hosted.sealedResult?.findings ?? []).map(projectHostedFinding), requirement: handle.admission.requirement,
    endedAt: "2026-10-19T13:00:00Z", hosted: binding,
  };
}

export function frontlineOutcome(options: Parameters<typeof createFrontlineFixture>[1] & { target?: ReviewTarget } = {}) {
  const { admission, outcomeRecord, run } = createFrontlineFixture(options.target, options);
  return {
    schemaVersion: 1, attemptId: admission.operationId, lane: "frontline", lineage: admission.lineage,
    logicalPass: 1, retryGeneration: 0, source: { sourceId: outcomeRecord.sourceIdentity, kind: "frontline" },
    target: admission.target, requestedCoverage: "complete", effectiveCoverage: "complete",
    outcome: outcomeRecord.outcome.outcome, findings: outcomeRecord.outcome.findings, endedAt: "2026-10-19T13:00:00Z",
    frontline: {
      admission: { ...admission, frontlineReview: { ...admission.frontlineReview,
        source: { sourceId: outcomeRecord.sourceIdentity, kind: "command", capability: null } } },
      sourceBindingId: run.sourceBindingId,
      outcomeDigest: outcomeRecord.outcomeDigest, executableIdentity: outcomeRecord.executableIdentity,
      reason: outcomeRecord.outcome.reason,
      ...(outcomeRecord.responseBinding === undefined ? {} : { responseBinding: outcomeRecord.responseBinding }),
    },
  };
}

export function localOutcome(options: {
  lineage?: LaneSubjectLineage; target?: ReviewTarget; logicalPass?: number; retryGeneration?: number; scopeMode?: ReviewScopeMode;
  vehicle?: LocalReviewAuthority["vehicle"]; coverageAdmission?: LocalReviewCoverageAdmission;
  deliveryAdmission?: DeliveryLocalReviewAdmission; outcome?: "clean" | "findings" | "terminal-failure";
  findings?: NormalizedReviewFinding[];
} = {}) {
  const target = options.target ?? createHostedHandleFixture().admission.reviewTarget;
  const logicalPass = options.logicalPass ?? 1;
  const retryGeneration = options.retryGeneration ?? 0;
  const coverageAdmission = options.coverageAdmission ?? { requestedCoverage: "complete" as const };
  const outcome = options.outcome ?? "clean";
  const effectiveCoverage = outcome === "terminal-failure" ? null : coverageAdmission.requestedCoverage;
  const requirement = createReviewRequirement({
    target, projection: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }], initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected required review");
  const lineage = options.lineage ?? { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: 1 }) };
  const admission = createLocalReviewAdmission({ target, requirement, lineage, logicalPass, retryGeneration, scopeMode: options.scopeMode,
    authority: { vehicle: options.vehicle ?? { kind: "work-unit", identity: "test-work" }, authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1", attestationRuntimeKind: "arc-cli", runtimeIdentity: "arc-cli/1.0.0",
      attestationMechanism: "local-attestation" },
    laneSourceId: "delegated-agent", policyBindingDigest: canonicalDigest({ policy: 1 }),
    requestMechanism: "local-attestation", coverageAdmission, deliveryAdmission: options.deliveryAdmission });
  const receipt = outcome === "terminal-failure" ? undefined : createReviewReceipt({ target, requirement, request: admission.carrier.request,
    applicabilityId: null, reviewRunId: "run-1", evaluatorIdentity: "evaluator-1",
    attestingRuntimeIdentity: "arc-cli/1.0.0", attestationMechanism: "local-attestation",
    providerEventIdentity: null, result: outcome, findings: options.findings ?? [] });
  return {
    schemaVersion: 1, attemptId: admission.operationId, lane: "standard", lineage, logicalPass, retryGeneration,
    source: { sourceId: "delegated-agent", kind: "local" }, target, requestedCoverage: coverageAdmission.requestedCoverage,
    correctionScope: coverageAdmission.correctionScope, effectiveCoverage, outcome, findings: options.findings ?? [], requirement, endedAt: "2026-10-19T13:00:00Z",
    local: { operationId: admission.operationId, requestId: admission.carrier.request.requestId,
      vehicle: admission.authority.vehicle, target, requestedCoverage: coverageAdmission.requestedCoverage, effectiveCoverage,
      correctionScope: coverageAdmission.correctionScope, deliveryAdmission: options.deliveryAdmission,
      scopeMode: admission.scopeMode, request: admission.carrier.request, attestation: admission.carrier.attestation,
      policyVersion: requirement.policyVersion, policyBindingDigest: admission.policyBindingDigest,
      attestationRuntimeKind: admission.authority.attestationRuntimeKind, sourceDigest: canonicalDigest({ source: 1 }),
      guidanceDigest: canonicalDigest({ guidance: 1 }), receipt },
  };
}
