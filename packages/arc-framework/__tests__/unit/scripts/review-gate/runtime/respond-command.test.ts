import { describe, expect, it, vi } from "vitest";

import { createHostedTerminalAttemptFixture } from "../../../../fixtures/hosted-review.js";

import { canonicalDigest, canonicalize } from "../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import {
  candidateReviewResponses,
  createCandidateAttestation,
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  ApprovedDispositionRecordSchema,
  currentApprovedDispositionNode,
  createFrontlineOutcomeRecord,
  ErrandReviewBindingSchema,
  type ApprovedDispositionRecord,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LaneSubjectLineageSchema, type LaneSubjectLineage } from
  "../../../../../src/scripts/review-gate/core/lane-admission.js";
import { createFixAuthorization } from
  "../../../../../src/scripts/review-gate/core/fix-authorization.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import type { LocalReviewAuthority } from
  "../../../../../src/scripts/review-gate/core/local-review-authority.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import {
  computeConditionalPassAuthorizationId,
  type FrontlineRunState,
  type LocalReviewState,
} from
  "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import { projectHostedFinding } from "../../../../../src/scripts/review-gate/hosted/await.js";
import { createHostedAdmission } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { laneContinuationOperationId } from "../../../../../src/scripts/review-gate/lane-progress.js";

import { projectLocalReviewGuidance } from
  "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import { CandidateBoundMemberFixAuthoringSchema } from
  "../../../../../src/scripts/review-gate/core/review-command-envelope.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { computeFrontlineSourceBindingId } from
  "../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import {
  respondToReviewCommand,
  type RespondCommandDependencies,
} from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

const DELIVERABLE_ID = `sha256:${"a".repeat(64)}`;
const memberVehicle = { kind: "delivery-member", identity: DELIVERABLE_ID } as const;
const workUnitVehicle = { kind: "work-unit", identity: "review-surface-binding" } as const;
const errandVehicle = { kind: "errand", identity: "repair-review-state", claimId: "claim-1" } as const;

function activeErrandBinding(claimId = "claim-1") {
  return ErrandReviewBindingSchema.parse({
    key: "repair-review-state",
    claimId,
    branch: "chore/repair-review-state",
  });
}

function fixture(
  vehicle: LocalReviewAuthority["vehicle"] = workUnitVehicle,
  sourceLabel?: string,
  lineage: LaneSubjectLineage = {
    kind: "candidate",
    candidateId: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
  },
  scopeMode: "whole-target" | "chunked" = "whole-target",
  logicalPass = 1,
) {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: vehicle.kind === "delivery-member" ? "delivery-member" : "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
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
  if (requirement === null) throw new Error("expected requirement");
  const authority = {
    vehicle,
    authorIdentity: "author-1",
    evaluatorIdentity: "evaluator-1",
    attestationRuntimeKind: "arc-cli",
    runtimeIdentity: "arc-cli/0.1.0",
    attestationMechanism: "local-attestation" as const,
  };
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority,
    laneSourceId: "delegated-agent",
    lineage,
    logicalPass,
    retryGeneration: 0,
    scopeMode,
    coverageAdmission: { requestedCoverage: "complete" },
    policyBindingDigest: digest("binding"),
    requestMechanism: "local-attestation",
  });
  const source = createLocalReviewSource({
    schemaVersion: 1,
    semanticsVersion: "git-object-range/v1",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    objectFormat: "sha1",
    diffBaseSha: target.diffBaseSha,
    diffBaseTree: target.diffBaseTree,
    headSha: target.headSha,
    headTree: target.headTree,
    reachabilityRef: `refs/arc/review/local/${admission.operationId}`,
    materializationRef: `/tmp/${admission.operationId}`,
  });
  const operation: LocalReviewState = {
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "local-review",
    operationId: admission.operationId,
    updatedAt: "2026-07-23T17:00:00Z",
    vehicle: authority.vehicle,
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requestId: admission.carrier.request.requestId,
    policyVersion: requirement.policyVersion,
    policyBindingDigest: admission.policyBindingDigest,
    laneSourceId: admission.laneSourceId,
    scopeMode: admission.scopeMode,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
    coverageAdmission: admission.coverageAdmission,
    attestationRuntimeKind: authority.attestationRuntimeKind,
    sourceRef: "source.json",
    sourceDigest: source.sourceDigest,
    guidance: projectLocalReviewGuidance().projection,
    guidanceDigest: digest("guidance"),
    reviewerInstructions: projectLocalReviewGuidance().reviewerInstructions,
    target,
    requirement,
    request: admission.carrier.request,
    attestation: admission.carrier.attestation,
    cleanupTtlMs: 60_000,
  };
  const finding = {
    findingId: "finding-1",
    severity: "major" as const,
    locus: "src/index.ts:7",
    evidenceUrlOrId: "review:finding-1",
    sourceOrdinal: 1,
    ...(sourceLabel === undefined ? {} : { sourceLabel }),
  };
  const receipt = createLocalReviewReceipt({
    target,
    requirement,
    carrier: admission.carrier,
    result: {
      status: "complete",
      result: "findings",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      headSha: target.headSha,
      headTree: target.headTree,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      sourceDigest: source.sourceDigest,
      guidanceDigest: operation.guidanceDigest,
      evaluatorIdentity: authority.evaluatorIdentity,
      reviewRunId: "run-1",
      applicabilityId: null,
      findings: [finding],
    },
    runtimeIdentity: authority.runtimeIdentity,
    attestationMechanism: authority.attestationMechanism,
    sourceDigest: source.sourceDigest,
    guidanceDigest: operation.guidanceDigest,
  });
  const receiptRef = bindReviewSourceReference({
    kind: "attested-local",
    operationId: operation.operationId,
    durableRef: "git-common:review-gate/evidence/receipts-v2.json#1",
  });
  return { target, authority, operation, source, receipt, receiptRef, finding };
}

function deliveryLocalFixture() {
  const records = fixture(memberVehicle, undefined, undefined, "chunked");
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({
    kind: "delivery-member",
    planId: "123e4567-e89b-42d3-a456-426614174000",
    deliverableId: memberVehicle.identity,
    workUnitId: "example",
    head: records.target.headSha,
  });
  records.operation.deliveryAdmission = {
    schemaVersion: 1,
    sourceId: "delegated-agent",
    target: { repository: "owner/repo", pullRequest: 42, headSha: records.target.headSha },
    vehicle,
    pass: 1,
    requestedCoverage: "complete",
    scopeSelection: {
      mode: "chunked",
      target: { repository: "owner/repo", pullRequest: 42, headSha: records.target.headSha },
    },
    statusTarget: {
      repository: "owner/repo",
      headRef: "delivery/example/member-7",
      headSha: records.target.headSha,
    },
  };
  return { ...records, vehicle };
}

function approved(input: {
  targetId: string;
  producerId: string;
  resultDigest: string;
  policyVersion: string;
  rubricVersion: string;
  rubricDigest: string;
  sourceIdentity: string;
  finding: ReturnType<typeof fixture>["finding"];
  disposition?: "fix" | "defer" | "reject";
  proposedVerification?: "targeted" | "focused" | "full";
  proposedBy?: string;
  approvedBy?: string;
}) {
  const disposition = input.disposition ?? "fix";
  return approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: input.targetId,
      producerId: input.producerId,
      resultDigest: input.resultDigest,
      policyVersion: input.policyVersion,
      rubricVersion: input.rubricVersion,
      rubricDigest: input.rubricDigest,
      proposedBy: input.proposedBy ?? "arc-cli/0.1.0",
      proposedVerification: input.proposedVerification ?? "full",
      findings: [{
        findingId: input.finding.findingId,
        sourceIdentity: input.sourceIdentity,
        locus: input.finding.locus,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        reportedSeverity: input.finding.severity,
        verifiedSeverity: input.finding.severity,
        disposition,
        gating: "blocking",
        rationale: "The selected source supports this disposition.",
        recommendation: disposition === "fix" ? "Apply the fix." : "Record the disposition.",
        openQuestions: [],
      }],
    })),
    approvedBy: input.approvedBy ?? "author-1",
    approvedAt: "2026-07-23T20:00:00Z",
  });
}

function localResult(records: ReturnType<typeof fixture>): ReviewResult {
  return {
    kind: "attested-local",
    vehicle: records.operation.vehicle,
    producerId: records.operation.operationId,
    repositoryId: records.operation.repositoryId,
    target: records.target,
    sourceIdentity: records.authority.evaluatorIdentity,
    originalOutcome: "findings",
    findings: records.receipt.findings,
    resultDigest: canonicalDigest({
      domain: "test.review-result/local",
      producerId: records.operation.operationId,
      receipt: records.receipt,
    }),
    admission: {
      lineage: records.operation.lineage,
      logicalPass: records.operation.logicalPass,
      retryGeneration: records.operation.retryGeneration,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: records.operation.scopeMode,
      policyVersion: records.operation.policyVersion,
    },
    receiptRef: "git-common:review-gate/evidence/receipts-v2.json#1",
    localSourceRef: records.operation.sourceRef,
    requirement: records.operation.requirement,
    request: records.operation.request,
    ...(records.operation.deliveryAdmission === undefined
      ? {}
      : { deliveryAdmission: records.operation.deliveryAdmission }),
  };
}

function dependencies(records: ReturnType<typeof fixture>) {
  let disposition: ApprovedDispositionRecord | null = null;
  let responsePerformance: Awaited<ReturnType<RespondCommandDependencies["readResponsePerformance"]>> = null;
  const deps: RespondCommandDependencies = {
    withOperationLock: async (_operationId, action) => action(),
    resultReader: { readResult: async () => localResult(records) },
    dispositionStore: {
      readDispositionRecord: async () => disposition,
      appendDispositionRecord: async (record) => {
        const currentExisting = disposition === null ? null : currentApprovedDispositionNode(disposition);
        const currentNext = currentApprovedDispositionNode(record);
        const errandAdvance = disposition !== null
          && currentExisting?.errandFixResponse === null
          && currentNext.errandFixResponse !== null
          && canonicalize(disposition.approvedDispositionLineage.map((node) => ({
            ...node,
            errandFixResponse: null,
          }))) === canonicalize(record.approvedDispositionLineage.map((node) => ({
            ...node,
            errandFixResponse: null,
          })));
        const deliveryAdvance = disposition !== null
          && currentExisting?.deliveryMemberFixResponse === null
          && currentNext.deliveryMemberFixResponse !== null
          && canonicalize(disposition.approvedDispositionLineage.map((node) => ({
            ...node,
            deliveryMemberFixResponse: null,
          }))) === canonicalize(record.approvedDispositionLineage.map((node) => ({
            ...node,
            deliveryMemberFixResponse: null,
          })));
        const successorAdvance = disposition !== null
          && record.approvedDispositionLineage.length === disposition.approvedDispositionLineage.length + 1
          && record.approvedDispositionLineage.at(-2)?.successorDispositionSetId === record.currentDispositionSetId
          && currentNext.predecessorDispositionSetId === disposition.currentDispositionSetId;
        const policyProjectionAdvance = disposition !== null
          && disposition.currentDispositionSetId === record.currentDispositionSetId
          && currentExisting?.policyProjectionPending === true
          && currentNext.policyProjectionPending !== true
          && canonicalize(disposition.approvedDispositionLineage.map((node) => ({
            ...node,
            responsePolicyRequest: null,
            policyProjectionPending: null,
          }))) === canonicalize(record.approvedDispositionLineage.map((node) => ({
            ...node,
            responsePolicyRequest: null,
            policyProjectionPending: null,
          })));
        if (disposition !== null
          && canonicalize(disposition) !== canonicalize(record)
          && !errandAdvance
          && !deliveryAdvance
          && !successorAdvance
          && !policyProjectionAdvance) {
          throw new Error("conflict");
        }
        disposition = record;
        return { dispositionRecordRef: "git-common:review-gate/evidence/disposition.json" };
      },
    },
    confirmTarget: async (target) => ({ state: "current", target }),
    confirmCorrectionTarget: async (target, expectedFixPaths) => ({
      state: "current",
      target,
      dirtyPaths: expectedFixPaths,
    }),
    confirmPinnedDeliveryMemberTarget: async () => null,
    resolveLocalActors: async () => ({
      approverIdentity: records.authority.authorIdentity,
      proposerIdentity: records.authority.runtimeIdentity,
    }),
    resolveFrontlineActors: async () => ({
      approverIdentity: records.authority.authorIdentity,
      proposerIdentity: records.authority.runtimeIdentity,
    }),
    resolveActiveErrand: async () => null,
    resolveDeliveryMemberFixTarget: async () => null,
    resolveCandidateFixAuthoring: async ({ workUnit, expectedHead }) =>
      CandidateBoundMemberFixAuthoringSchema.parse({
        kind: "candidate",
        workUnit,
        head: expectedHead,
        ref: "refs/heads/feat/example",
        checkoutPath: "/repo",
        deliverySuffixReconstruction: "after-candidate-advance",
      }),
    now: () => "2026-07-23T21:00:00Z",
    readCandidateLineage: async () => {
      const record = candidateRecord();
      return candidateLineageBinding(records, record, {
        revision: records.target.headSha,
        subject: record.subject,
      });
    },
    appendCandidateResponse: () => Promise.reject(new Error("unexpected Candidate append")),
    stageCandidateResponse: () => Promise.reject(new Error("unexpected Candidate stage")),
    settleLaneFindings: async () => undefined,
    recordResponsePerformance: async (performance) => {
      responsePerformance = {
        schemaVersion: 1,
        producerId: performance.attemptId,
        dispositionSetId: performance.dispositionSetId,
        originatingHeadSha: performance.headSha,
        producedHeadSha: performance.producedHeadSha,
        performedAt: "2026-07-23T21:00:00Z",
      };
    },
    readResponsePerformance: async () => responsePerformance,
    bindHostedDisposition: async () => undefined,
    resolvePolicy: async (request) => {
      const terminalAttempt = request.attempts.at(-1);
      return {
        schemaVersion: 1,
        mode: "review-resolve",
        diagnostics: [],
        state: "findings",
        nextAction: "respond",
        payload: {
          lane: request.lane,
          scope: request.scopeSelection?.mode ?? "whole-target",
          sourceId: terminalAttempt?.sourceId ?? "delegated-agent",
          pass: Math.max(1, request.completedPasses),
          completedPasses: request.completedPasses,
          consumedPass: true,
          attemptedSources: request.attempts,
          verifiedTerminalSignal: {
            reviewOperationId: terminalAttempt !== undefined && "reviewOperationId" in terminalAttempt
              ? terminalAttempt.reviewOperationId
              : records.operation.operationId,
            confirmedFindingCount: 1,
            maxConfirmedSeverity: "major",
            coverageAdequate: true,
          },
          postResponseAction: "resolve-next-pass",
        },
      };
    },
    readConfiguredLanePolicy: async (lane) => ({
      sources: lane === "frontline" ? ["coderabbit-cli"] : ["delegated-agent"],
      maxPasses: 2,
    }),
    captureConditionalNextPass: async (input) => ({
      authorizationId: computeConditionalPassAuthorizationId({
        ...input,
        originatingHeadSha: input.headSha,
      }),
    }),
    withdrawConditionalNextPass: () => Promise.reject(new Error("unexpected conditional withdrawal")),
    invalidateConditionalNextPass: async () => undefined,
    preflightConditionalNextPassInvalidation: async () => ({ state: "ready" }),
    preflightHostedDisposition: async () => ({ state: "ready" }),
    supersedeHostedDisposition: async () => ({
      state: "advanced",
      carriedFindingIds: [],
      reopenedFindingIds: [],
    }),
  };
  return deps;
}

const CANDIDATE_RECORD_PATH = ".arc/system/.internal/candidates/example.json";

function candidateSubject(source: string) {
  return createCandidateSubjectSnapshot([
    { path: "src/index.ts", mode: "100644", digest: canonicalDigest({ source }), treatment: "reviewable" },
  ]);
}

function candidateRecord(): CandidateManagedRecordV1 {
  const rootSubject = candidateSubject("root");
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "example",
      subject: rootSubject,
      baseRevision: objectId("a"),
      attestedBy: "author-1",
      attestedAt: "2026-08-15T14:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    }),
    subject: rootSubject,
    transitions: [],
    lineageAttestations: [],
  };
}

function effectiveCurrent(
  record: CandidateManagedRecordV1,
  target: { revision: string; subject: ReturnType<typeof candidateSubject> },
) {
  const baseline = reduceCandidateDurableBaseline(record);
  const implementationChanged = baseline.implementationChanged
    || baseline.target.subject.subjectDigest !== target.subject.subjectDigest;
  return {
    schemaVersion: 1 as const,
    mode: "candidate-effective-target" as const,
    state: "current" as const,
    nextAction: "continue" as const,
    candidateId: record.attestation.candidateId,
    durableBaselineTarget: baseline.target,
    recognizedTarget: target,
    recognition: { kind: "durable" as const },
    implementationChanged,
    ...(implementationChanged
      ? { convergenceVerification: "pending" as const, convergenceScope: "full" as const }
      : { convergenceVerification: "satisfied" as const, convergenceScope: null }),
  };
}

function effectiveChanged(
  record: CandidateManagedRecordV1,
  currentTarget: { revision: string; subject: ReturnType<typeof candidateSubject> },
) {
  const baseline = reduceCandidateDurableBaseline(record);
  return {
    schemaVersion: 1 as const,
    mode: "candidate-effective-target" as const,
    state: "changed" as const,
    nextAction: "establish-new-root" as const,
    candidateId: record.attestation.candidateId,
    durableBaselineTarget: baseline.target,
    currentTarget,
    projectionDigest: digest("projection"),
    residualDigest: digest("residual"),
    selectedBy: "author-1",
  };
}

function candidateLineageBinding(
  records: ReturnType<typeof fixture>,
  record: CandidateManagedRecordV1,
  current: { revision: string; subject: ReturnType<typeof candidateSubject> },
) {
  const baseline = reduceCandidateDurableBaseline(record);
  const candidateFixTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: records.target.kind,
    repositoryId: records.target.repositoryId,
    baseRef: records.target.baseRef,
    diffBaseSha: records.target.diffBaseSha,
    diffBaseTree: records.target.diffBaseTree,
    headSha: current.revision,
    headTree: current.revision === records.target.headSha ? records.target.headTree : objectId("f"),
  });
  return {
    workUnit: "example",
    record,
    recordVersion: canonicalDigest(record),
    reviewed: effectiveCurrent(record, { revision: records.target.headSha, subject: baseline.target.subject }),
    effective: effectiveCurrent(record, current),
    current,
    candidateFixTarget,
    unstagedReviewablePaths: [],
  };
}

/** Bind respond to a Candidate lineage and the head movement a landed fix produces. */
function lineageDependencies(
  records: ReturnType<typeof fixture>,
  current: { revision: string; subject: ReturnType<typeof candidateSubject> },
  proposedVerification: "targeted" | "focused" | "full" = "focused",
) {
  const record = candidateRecord();
  const recordVersion = canonicalDigest(record);
  const appends: Array<{
    workUnit: string;
    record: CandidateManagedRecordV1;
    expectedRecordVersion: string;
  }> = [];
  const deps: RespondCommandDependencies = {
    ...dependencies(records),
    confirmTarget: async (target) => ({
      state: "stale-target",
      attemptedTarget: target,
      currentTarget: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: target.repositoryId,
        baseRef: "main",
        diffBaseSha: objectId("a"),
        diffBaseTree: objectId("b"),
        headSha: objectId("e"),
        headTree: objectId("f"),
      }),
    }),
    readCandidateLineage: async () => ({
      ...candidateLineageBinding(records, record, current),
      recordVersion,
    }),
    appendCandidateResponse: async (input) => {
      appends.push(input);
      return { recordPath: CANDIDATE_RECORD_PATH };
    },
    stageCandidateResponse: async () => ({ recordPath: CANDIDATE_RECORD_PATH }),
  };
  const dispositions = localRequest(records, "fix", proposedVerification).dispositions;
  const fixAuthorization = createFixAuthorization({
    dispositionState: dispositions,
    oldTarget: records.target,
  });
  const candidateDisposition = ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: records.target.repositoryId,
    operationId: records.operation.operationId,
    candidate: { workUnit: "example", candidateId: record.attestation.candidateId },
    errand: null,
    deliveryMember: null,
    source: {
      kind: "attested-local",
      receiptRef: records.receiptRef,
      localSourceRef: records.operation.sourceRef,
    },
    currentDispositionSetId: dispositions.dispositionSet.dispositionSetId,
    approvedDispositionLineage: [{
      approvedDisposition: dispositions,
      responsePolicyRequest: policyRequest(records),
      fixAuthorization,
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
      predecessorDispositionSetId: null,
      successorDispositionSetId: null,
    }],
  });
  deps.dispositionStore.readDispositionRecord = async () => candidateDisposition;
  return { deps, record, appends };
}

function verifiedFixRequest(records: ReturnType<typeof fixture>, disposition: "fix" | "defer" = "fix") {
  return {
    ...localRequest(records, disposition),
    verifiedFix: {
      applicability: "focused" as const,
      verificationEvidenceRefs: ["verification://focused-fix"],
    },
  };
}

function localRequest(
  records: ReturnType<typeof fixture>,
  disposition: "fix" | "defer" | "reject" = "fix",
  proposedVerification: "targeted" | "focused" | "full" = "focused",
) {
  const result = localResult(records);
  return {
    schemaVersion: 1,
    source: { kind: "attested-local", receiptRef: records.receiptRef },
    policyRequest: {
      ...policyRequest(records, {
        pullRequest: records.operation.deliveryAdmission?.target.pullRequest,
      }),
      ...(records.operation.deliveryAdmission === undefined
        ? {}
        : {
            scopeSelection: records.operation.deliveryAdmission.scopeSelection,
            attempts: [{
              sourceId: "delegated-agent",
              outcome: "findings" as const,
              reviewOperationId: records.operation.operationId,
              chunkSeriesComplete: true,
            }],
          }),
    },
    dispositions: approved({
      targetId: records.target.targetId,
      producerId: result.producerId,
      resultDigest: result.resultDigest,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      sourceIdentity: records.authority.evaluatorIdentity,
      finding: records.finding,
      disposition,
      proposedVerification,
    }),
  };
}

function policyRequest(
  records: ReturnType<typeof fixture>,
  input: {
    lane?: "frontline" | "standard";
    sourceId?: string;
    reviewOperationId?: string;
    pullRequest?: number | null;
  } = {},
) {
  return {
    schemaVersion: 1 as const,
    target: {
      repository: "owner/repo",
      pullRequest: input.pullRequest ?? null,
      headSha: records.target.headSha,
    },
    lane: input.lane ?? "standard" as const,
    frontlineActive: false,
    standardReview: {
      obligation: records.operation.requirement.obligation,
      reasons: records.operation.requirement.reasons,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      retrigger: records.operation.requirement.retrigger,
      count: records.operation.requirement.count,
    },
    completedPasses: 1,
    attempts: [{
      sourceId: input.sourceId ?? "delegated-agent",
      outcome: "findings" as const,
      reviewOperationId: input.reviewOperationId ?? records.operation.operationId,
    }],
  };
}

function hostedResponseFixture(
  origin: "review-thread" | "review-body",
  vehicle: LocalReviewAuthority["vehicle"] = workUnitVehicle,
  reportedNit = false,
) {
  const records = fixture(vehicle);
  const operationId = "lane-progress/hosted-1";
  const reportedClassification = reportedNit
    ? { severity: "minor" as const, nit: true as const }
    : { severity: records.finding.severity };
  const hostedFinding = origin === "review-thread"
    ? {
        findingId: records.finding.findingId,
        origin,
        commentId: "comment-1",
        threadId: "thread-1",
        settlement: "reply-and-resolve" as const,
        ...reportedClassification,
        locus: records.finding.locus,
        url: "https://example.test/thread-1",
        sourceOrdinal: 1,
      }
    : {
        findingId: records.finding.findingId,
        origin,
        reviewId: "review-1",
        fingerprint: "fingerprint-1",
        settlement: "not-applicable" as const,
        ...reportedClassification,
        locus: records.finding.locus,
        url: "https://example.test/review-1",
        body: "Finding body.",
        sourceOrdinal: 1,
      };
  const lineage = LaneSubjectLineageSchema.parse(vehicle.kind === "delivery-member"
    ? {
        kind: "delivery-member" as const,
        planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: vehicle.identity,
        workUnitId: "example" as const,
      }
    : { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: records.target.targetId }) });
  const deliveryVehicle = vehicle.kind !== "delivery-member"
    ? undefined
    : DeliveryReviewMemberVehicleSchema.parse({
        kind: "delivery-member" as const,
        planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: vehicle.identity,
        workUnitId: "example",
        head: records.target.headSha,
      });
  const target = { repository: "owner/repo", pullRequest: 42, headSha: records.target.headSha };
  const requirement = createReviewRequirement({
    target: records.target,
    projection: {
      obligation: records.operation.requirement.obligation,
      reasons: records.operation.requirement.reasons,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      retrigger: records.operation.requirement.retrigger,
      count: records.operation.requirement.count,
    },
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    initialAdmission: records.operation.requirement.initialAdmission,
  });
  if (requirement === null) throw new Error("expected hosted response requirement");
  const admission = createHostedAdmission({
    schemaVersion: 1,
    repositoryId: records.target.repositoryId,
    lineage,
    logicalPass: 1,
    sourceId: "codex-pr",
    target,
    requestedCoverage: "complete",
    ...(deliveryVehicle === undefined ? {} : { vehicle: deliveryVehicle }),
    reviewTarget: records.target,
    requirement,
    actorIdentity: "host-actor-1",
  });
  const terminal = createHostedTerminalAttemptFixture({
    admission,
    outcome: "findings",
    findings: [hostedFinding],
  });
  const { attemptId } = terminal;
  const operation = {
    schemaVersion: 1 as const,
    semanticsVersion: "review-operation/v1" as const,
    operationId,
    updatedAt: "2026-07-23T17:00:00Z",
    kind: "lane-progress" as const,
    lane: "standard" as const,
    repositoryId: records.target.repositoryId,
    lineage,
    completedPasses: 1,
    attempts: [{
      attemptId,
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: "pull/42",
      headSha: records.target.headSha,
      terminalProducer: true,
      sourceId: "codex-pr",
      outcome: "findings" as const,
      hosted: terminal.hosted,
    }],
  };
  const attemptRef = bindReviewSourceReference({ kind: "hosted", operationId, durableRef: attemptId });
  return { records, operation, attemptRef };
}

function hostedResult(input: ReturnType<typeof hostedResponseFixture>): ReviewResult {
  const attempt = input.operation.attempts[0];
  const hosted = attempt?.hosted;
  const sealed = hosted?.sealedResult;
  if (attempt === undefined || hosted === undefined || sealed === undefined) {
    throw new Error("missing hosted result fixture");
  }
  return {
    kind: "hosted",
    producerId: attempt.attemptId,
    repositoryId: input.operation.repositoryId,
    target: hosted.reviewTarget,
    sourceIdentity: attempt.sourceId,
    originalOutcome: sealed.outcome,
    findings: sealed.findings.map(projectHostedFinding),
    resultDigest: sealed.hostedResultId,
    admission: {
      lineage: hosted.admission.lineage,
      logicalPass: hosted.admission.logicalPass,
      retryGeneration: attempt.retryGeneration,
      requestedCoverage: hosted.requestedCoverage,
      effectiveCoverage: hosted.effectiveCoverage ?? hosted.requestedCoverage,
      scopeMode: "whole-target",
      policyVersion: hosted.requirement.policyVersion,
    },
    laneOperationId: input.operation.operationId,
    actorIdentity: hosted.actorIdentity,
    hostedTarget: hosted.target,
    requirement: hosted.requirement,
    ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
    hostSettlementFindingIds: sealed.findings
      .filter(({ settlement }) => settlement === "reply-and-resolve")
      .map(({ findingId }) => findingId),
    noHostSettlementFindingIds: sealed.findings
      .filter(({ settlement }) => settlement === "not-applicable")
      .map(({ findingId }) => findingId),
    settled: false,
  };
}

/** The same approved set, approved by an identity that is not the active local one. */
function foreignApproval(records: ReturnType<typeof fixture>) {
  const result = localResult(records);
  return approved({
    targetId: records.target.targetId,
    producerId: result.producerId,
    resultDigest: result.resultDigest,
    policyVersion: records.operation.policyVersion,
    rubricVersion: records.operation.requirement.rubricVersion,
    rubricDigest: records.operation.requirement.rubricDigest,
    sourceIdentity: records.authority.evaluatorIdentity,
    finding: records.finding,
    approvedBy: "a-different-author",
  });
}

function frontlineResult(input: {
  operation: FrontlineRunState;
  record: ReturnType<typeof createFrontlineOutcomeRecord>;
  outcomeRef: string;
}): ReviewResult {
  const { operation, record, outcomeRef } = input;
  if (record.outcome.outcome !== "clean" && record.outcome.outcome !== "findings") {
    throw new Error("frontline result fixture must be terminal");
  }
  return {
    kind: "frontline",
    producerId: operation.operationId,
    repositoryId: record.repositoryId,
    target: record.outcome.target,
    sourceIdentity: record.sourceIdentity,
    originalOutcome: record.outcome.outcome,
    findings: record.outcome.findings,
    resultDigest: record.outcomeDigest,
    admission: {
      lineage: operation.lineage,
      logicalPass: operation.logicalPass,
      retryGeneration: operation.retryGeneration,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: "whole-target",
      policyVersion: operation.policyVersion,
    },
    outcomeRef,
    sourceBindingId: operation.sourceBindingId,
    executableIdentity: record.executableIdentity,
    outcome: record.outcome,
  };
}

describe("review response command", () => {
  it("routes an approved local delivery-member fix through selector-free correction", async () => {
    const records = deliveryLocalFixture();

    await expect(respondToReviewCommand(localRequest(records), dependencies(records))).resolves.toMatchObject({
      state: "delivery-correction-required",
      nextAction: "continue-delivery-correction",
      payload: {
        deliveryMember: records.vehicle,
        correctionAction: {
          argv: ["arc", "delivery", "review-fix", "continue", "-"],
          input: { repository: "owner/repo", remote: "origin" },
        },
      },
    });
  });

  it("binds an exact unowned local disposition to its admitted delivery member", async () => {
    const records = deliveryLocalFixture();
    const seedDeps = dependencies(records);
    const appended: ApprovedDispositionRecord[] = [];
    seedDeps.dispositionStore.appendDispositionRecord = async (record) => {
      appended.push(record);
      return { dispositionRecordRef: "git-common:review-gate/evidence/disposition.json" };
    };
    await respondToReviewCommand(localRequest(records), seedDeps);
    const bound = appended[0];
    if (bound === undefined) throw new Error("expected a bound disposition record");
    const unowned = ApprovedDispositionRecordSchema.parse({ ...bound, deliveryMember: null });
    const deps = dependencies(records);
    deps.dispositionStore.readDispositionRecord = async () => unowned;
    deps.dispositionStore.appendDispositionRecord = async () => ({
      dispositionRecordRef: "git-common:review-gate/evidence/disposition.json",
    });

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "delivery-correction-required",
      nextAction: "continue-delivery-correction",
      payload: { deliveryMember: records.vehicle },
    });
  });

  it("rejects an author proposal that omits the explicit verified judgment", async () => {
    const records = fixture();

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, dependencies(records))).rejects.toThrow();
  });

  it("rejects an author proposal that omits the approved verification scope", async () => {
    const records = fixture();

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "major",
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, dependencies(records))).rejects.toThrow("proposedVerification");
  });

  it("rejects an author proposal that omits the effective severity-gating policy", async () => {
    const records = fixture();

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "focused",
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "minor",
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, dependencies(records))).rejects.toThrow("severityGatingPolicy");
  });

  it("constructs a source-bound proposal from author-owned finding decisions", async () => {
    const records = fixture();
    const earlierFinding = {
      findingId: "finding-0",
      severity: "major" as const,
      locus: "src/earlier.ts:3",
      evidenceUrlOrId: "review:finding-0",
      sourceOrdinal: 2,
    };
    records.receipt.findings.push(earlierFinding);

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "major",
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }, {
          findingId: earlierFinding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/earlier.ts:3"],
          verifiedSeverity: "minor",
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, dependencies(records))).resolves.toMatchObject({
      state: "awaiting-approval",
      nextAction: "obtain-approval",
      payload: {
        operationId: records.operation.operationId,
        proposal: {
          state: "proposed",
          dispositionSet: {
            targetId: records.target.targetId,
            policyVersion: records.operation.policyVersion,
            rubricVersion: records.operation.requirement.rubricVersion,
            rubricDigest: records.operation.requirement.rubricDigest,
            proposedBy: records.authority.runtimeIdentity,
            proposedVerification: "focused",
            findings: [{
              findingId: earlierFinding.findingId,
              sourceIdentity: records.authority.evaluatorIdentity,
              locus: earlierFinding.locus,
              reportedSeverity: earlierFinding.severity,
              verifiedSeverity: "minor",
              gating: "record-only",
            }, {
              findingId: records.finding.findingId,
              sourceIdentity: records.authority.evaluatorIdentity,
              locus: records.finding.locus,
              reportedSeverity: records.finding.severity,
              verifiedSeverity: "major",
              gating: "blocking",
            }],
            dispositionSetId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          },
        },
        dispositionReportText: [
          "**Verification:** focused",
          "",
          "### Finding F1",
          "**Rationale:** The selected source supports this disposition\\.",
          "**Locus:** src/earlier\\.ts:3",
          "**Source:** source #2 · review:finding\\-0",
          "**Verified at:** source:src/earlier\\.ts:3",
          "**Assessment:** CONFIRMED · 🟡 minor (ARC) · 🟠 major (reviewer)",
          "**Recommendation:** FIX [record-only] — Apply the fix\\.",
          "",
          "---",
          "",
          "### Finding F2",
          "**Rationale:** The selected source supports this disposition\\.",
          "**Locus:** src/index\\.ts:7",
          "**Source:** source #1 · review:finding\\-1",
          "**Verified at:** source:src/index\\.ts:7",
          "**Assessment:** CONFIRMED · 🟠 major",
          "**Recommendation:** FIX [blocking] — Apply the fix\\.",
        ].join("\n"),
      },
    });
  });

  it.each([
    { logicalPass: 2, maxPasses: 2, severity: "major" as const,
      capPosition: "at-ceiling", stopReason: "cap-exhausted" },
    { logicalPass: 1, maxPasses: 3, severity: "major" as const,
      capPosition: "below-ceiling", stopReason: null },
    { logicalPass: 2, maxPasses: 2, severity: "minor" as const,
      capPosition: "at-ceiling", stopReason: null },
  ])("reports a provisional standard pass assessment at pass $logicalPass of $maxPasses", async ({
    logicalPass, maxPasses, severity, capPosition, stopReason,
  }) => {
    const records = fixture(workUnitVehicle, undefined, undefined, "whole-target", logicalPass);
    const deps = dependencies(records);
    deps.readConfiguredLanePolicy = async () => ({ sources: ["delegated-agent"], maxPasses });
    const response = await respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: severity,
          disposition: "fix",
          rationale: "The source supports a fix.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, deps);
    expect(response).toMatchObject({
      state: "awaiting-approval",
      nextAction: "obtain-approval",
      payload: {
        provisionalPassAssessment: {
          status: "provisional",
          lane: "standard",
          admittedLogicalPass: logicalPass,
          configuredMaxPasses: maxPasses,
          proposedSignal: { confirmedFindingCount: 1, maxConfirmedSeverity: severity },
          capPosition,
          potentialStopReason: stopReason,
          nextPassAuthority: "none",
        },
      },
    });
    if (response.state !== "awaiting-approval") throw new Error("expected proposal assessment");
    const assessment = response.payload.provisionalPassAssessment;
    expect(assessment.summaryText).toContain(`Pass ${logicalPass} of ${maxPasses}`);
    expect(assessment.summaryText).toContain(`highest proposed severity: ${severity}`);
    expect(assessment.summaryText).toContain("Approval and response are pending");
    expect(assessment.summaryText).toContain("does not establish coverage or convergence");
    expect(assessment.summaryText).toContain("grants no next-pass authority");
    if (stopReason === "cap-exhausted") {
      expect(assessment.summaryText).toContain("Potential stop: cap-exhausted");
    } else {
      expect(assessment.summaryText).not.toContain("Potential stop:");
    }
    expect(response.payload.dispositionReportText).toContain("### Finding F1");
    expect(response.payload.dispositionReportText).not.toContain("Provisional");
  });

  it("returns a contained canonical report with its native source label", async () => {
    const records = fixture(workUnitVehicle, "Native **title**");
    const injected = "First line\n---\n### Finding F2\n**Assessment:** FORGED";
    const proposal = await respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "major",
          disposition: "fix",
          rationale: injected,
          recommendation: injected,
          openQuestions: [injected],
        }],
      },
    }, dependencies(records));
    if (proposal.state !== "awaiting-approval") throw new Error("expected proposal report");

    const report = proposal.payload.dispositionReportText;
    expect(report).toContain("**Source:** Native \\*\\*title\\*\\* · source #1");
    expect(report).toContain("**Rationale:** First line \\-\\-\\- \\#\\#\\# Finding F2 \\*\\*Assessment:\\*\\* FORGED");
    expect(report.match(/^### Finding F\d+$/gmu)).toEqual(["### Finding F1"]);
    expect(report).not.toMatch(/^---$/gmu);
  });

  it("materializes a complete successor proposal beside only the expected authorized fix paths", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const original = localRequest(records);
    await respondToReviewCommand(original, deps);
    deps.confirmCorrectionTarget = async (target, expectedFixPaths) => ({
      state: "current",
      target,
      dirtyPaths: expectedFixPaths,
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      supersedes: {
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
        expectedFixPaths: ["src/index.ts"],
      },
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://focused-real-path"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "Focused verification disproved the approved finding before the fix landed.",
          recommendation: "Reject the unsupported finding.",
          openQuestions: [],
        }],
      },
    }, deps)).resolves.toMatchObject({
      state: "awaiting-approval",
      nextAction: "obtain-approval",
      payload: {
        supersession: {
          predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
          expectedFixPaths: ["src/index.ts"],
        },
      },
    });
  });

  it("serializes disposition publication with admission for the same lane owner", async () => {
    const records = fixture(workUnitVehicle, undefined, {
      kind: "head-bound",
      vehicleKind: "errand",
      vehicleIdentity: "repair-review-state",
      headSha: objectId("c"),
    });
    const deps = dependencies(records);
    const lockTails = new Map<string, Promise<void>>();
    deps.withOperationLock = async <T>(operationId: string, action: () => Promise<T>): Promise<T> => {
      const prior = lockTails.get(operationId) ?? Promise.resolve();
      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const tail = prior.then(() => held);
      lockTails.set(operationId, tail);
      await prior;
      try {
        return await action();
      } finally {
        release?.();
        if (lockTails.get(operationId) === tail) lockTails.delete(operationId);
      }
    };
    let responseEntered: (() => void) | undefined;
    let releaseResponse: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { responseEntered = resolve; });
    const held = new Promise<void>((resolve) => { releaseResponse = resolve; });
    deps.confirmTarget = async (target) => {
      responseEntered?.();
      await held;
      return { state: "current", target };
    };

    const response = respondToReviewCommand(localRequest(records, "defer"), deps);
    await entered;
    let admissionEntered = false;
    if (records.operation.lineage.kind !== "head-bound") {
      throw new Error("expected head-bound test lineage");
    }
    const admission = deps.withOperationLock(laneContinuationOperationId({
      lane: "standard",
      repositoryId: records.operation.repositoryId,
      headSha: objectId("e"),
      lineage: {
        ...records.operation.lineage,
        headSha: objectId("e"),
      },
    }), async () => {
      admissionEntered = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const overlappedPublication = admissionEntered;
    releaseResponse?.();
    await Promise.all([response, admission]);

    expect(overlappedPublication).toBe(false);
  });

  it("returns typed conditional-authority withdrawal and refusal results", async () => {
    const records = fixture();
    const authorizationId = digest("conditional-authorization");
    const dispositionSetId = digest("approved-disposition");
    const request = {
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      conditionalNextPassWithdrawal: {
        conditionalPassAuthorizationId: authorizationId,
        dispositionSetId,
        withdrawnBy: records.authority.authorIdentity,
      },
    } as const;
    const withdrawn = Object.assign(dependencies(records), {
      withdrawConditionalNextPass: async () => ({
        state: "withdrawn" as const,
        authorizationId,
        dispositionSetId,
      }),
    });

    await expect(respondToReviewCommand(request, withdrawn)).resolves.toMatchObject({
      state: "conditional-authority-withdrawn",
      nextAction: "stop",
      payload: {
        operationId: records.operation.operationId,
        authorizationId,
        dispositionSetId,
        replayed: false,
      },
    });
    const producedTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: records.target.kind,
      repositoryId: records.target.repositoryId,
      baseRef: records.target.baseRef,
      diffBaseSha: records.target.diffBaseSha,
      diffBaseTree: records.target.diffBaseTree,
      headSha: objectId("9"),
      headTree: objectId("8"),
    });
    const movedHead = Object.assign(dependencies(records), {
      confirmTarget: async () => ({
        state: "stale-target" as const,
        attemptedTarget: records.target,
        currentTarget: producedTarget,
      }),
      withdrawConditionalNextPass: withdrawn.withdrawConditionalNextPass,
    });
    await expect(respondToReviewCommand(request, movedHead)).resolves.toMatchObject({
      state: "conditional-authority-withdrawn",
      payload: { authorizationId, dispositionSetId },
    });
    const refused = Object.assign(dependencies(records), {
      withdrawConditionalNextPass: async () => ({
        state: "refused" as const,
        reason: "consumed" as const,
        detail: "consumed conditional pass authorization cannot be withdrawn",
      }),
    });
    await expect(respondToReviewCommand(request, refused)).resolves.toMatchObject({
      state: "conditional-authority-withdrawal-refused",
      nextAction: "stop",
      payload: { operationId: records.operation.operationId, reason: "consumed" },
    });
    await expect(respondToReviewCommand({
      ...request,
      conditionalNextPassWithdrawal: {
        ...request.conditionalNextPassWithdrawal,
        withdrawnBy: "another-approver",
      },
    }, withdrawn)).resolves.toMatchObject({
      state: "conditional-authority-withdrawal-refused",
      nextAction: "stop",
      payload: { operationId: records.operation.operationId, reason: "foreign-authority" },
    });
  });

  it("returns typed refusals when correction proposal target preconditions fail", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const original = localRequest(records);
    await respondToReviewCommand(original, deps);
    const currentHeadSha = objectId("f");
    const request = {
      schemaVersion: 1,
      source: original.source,
      supersedes: {
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
        expectedFixPaths: ["src/index.ts"],
      },
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://focused-real-path"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "Focused verification disproved the approved finding before the fix landed.",
          recommendation: "Reject the unsupported finding.",
          openQuestions: [],
        }],
      },
    } as const;
    deps.confirmCorrectionTarget = async (target) => ({
      state: "stale-head",
      attemptedTarget: target,
      currentHeadSha,
    });
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: {
        operationId: records.operation.operationId,
        reason: "head-moved",
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
        attemptedTarget: records.target,
        currentHeadSha,
      },
    });

    deps.confirmCorrectionTarget = async (target) => ({
      state: "unexpected-dirty-paths",
      target,
      unexpectedPaths: ["src/unrelated.ts"],
    });
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: {
        operationId: records.operation.operationId,
        reason: "unexpected-dirty-paths",
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
        unexpectedPaths: ["src/unrelated.ts"],
      },
    });
  });

  it("refuses disposition supersession after its Candidate fix authorization was consumed", async () => {
    const records = fixture();
    const current = { revision: objectId("e"), subject: candidateSubject("fixed") };
    const { deps, appends } = lineageDependencies(records, current);
    const original = localRequest(records);
    await respondToReviewCommand(original, deps);
    await respondToReviewCommand(verifiedFixRequest(records), deps);
    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("expected an advanced Candidate record");
    deps.readCandidateLineage = async () => ({
      ...candidateLineageBinding(records, advanced, current),
      recordVersion: canonicalDigest(advanced),
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      supersedes: {
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
        expectedFixPaths: [],
      },
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://post-consumption"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "The correction arrived after the approved fix was consumed.",
          recommendation: "Preserve the consumed response history.",
          openQuestions: [],
        }],
      },
    }, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: {
        reason: "fix-consumed",
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
      },
    });
  });

  it("permits a clean-worktree correction of a record-only predecessor", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const original = localRequest(records, "defer");
    await respondToReviewCommand(original, deps);

    const request = {
      schemaVersion: 1,
      source: original.source,
      supersedes: {
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
        expectedFixPaths: [],
      },
      proposal: {
        proposedVerification: "targeted",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://record-only-correction"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "New source evidence disproved the record-only judgment.",
          recommendation: "Replace the deferral with a rejection.",
          openQuestions: [],
        }],
      },
    } as const;
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "awaiting-approval",
      nextAction: "obtain-approval",
    });

    await expect(respondToReviewCommand({
      ...request,
      supersedes: { ...request.supersedes, expectedFixPaths: ["src/index.ts"] },
    }, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: { reason: "dirty-paths-without-fix-authorization" },
    });
  });

  it("corrects a pinned delivery-member record from a successor checkout", async () => {
    const records = deliveryLocalFixture();
    const deps = dependencies(records);
    const original = localRequest(records, "defer");
    await respondToReviewCommand(original, deps);
    deps.confirmCorrectionTarget = async (target) => ({
      state: "stale-head",
      attemptedTarget: target,
      currentHeadSha: objectId("e"),
    });
    deps.confirmPinnedDeliveryMemberTarget = async () => records.target;

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      supersedes: {
        predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
        expectedFixPaths: [],
      },
      proposal: {
        proposedVerification: "targeted",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://pinned-member-correction"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "Fresh evidence disproved the original deferral.",
          recommendation: "Record the corrected finding judgment.",
          openQuestions: [],
        }],
      },
    }, deps)).resolves.toMatchObject({ state: "awaiting-approval" });
  });

  it("publishes a freshly approved successor and returns its response plan", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const original = localRequest(records);
    await respondToReviewCommand(original, deps);
    const supersedes = {
      predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
      expectedFixPaths: ["src/index.ts"],
    };
    const proposed = await respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      supersedes,
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://focused-real-path"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "Focused verification disproved the approved finding before the fix landed.",
          recommendation: "Reject the unsupported finding.",
          openQuestions: [],
        }],
      },
    }, deps);
    if (proposed.state !== "awaiting-approval") throw new Error("expected successor proposal");
    const conflictingProposed = await respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      supersedes,
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["verification://conflicting-successor"],
          verifiedSeverity: "major",
          disposition: "defer",
          rationale: "A different successor conflicts with the already-published edge.",
          recommendation: "Do not replace the published successor.",
          openQuestions: [],
        }],
      },
    }, deps);
    if (conflictingProposed.state !== "awaiting-approval") throw new Error("expected conflicting proposal");
    const successor = approveDispositionState({
      proposed: proposed.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T22:00:00Z",
    });
    const conflictingSuccessor = approveDispositionState({
      proposed: conflictingProposed.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T22:01:00Z",
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      policyRequest: original.policyRequest,
      supersedes,
      dispositions: successor,
    }, deps)).resolves.toMatchObject({
      state: "settled",
      nextAction: "reduce",
      payload: {
        supersession: {
          status: "published",
          predecessorDispositionSetId: supersedes.predecessorDispositionSetId,
          successorDispositionSetId: successor.dispositionSet.dispositionSetId,
          carriedFindingIds: [],
          reopenedFindingIds: [],
        },
      },
    });
    const record = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
    expect(record).toMatchObject({
      currentDispositionSetId: successor.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        successorDispositionSetId: successor.dispositionSet.dispositionSetId,
      }, {
        predecessorDispositionSetId: supersedes.predecessorDispositionSetId,
        successorDispositionSetId: null,
        approvedDisposition: successor,
      }],
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      policyRequest: original.policyRequest,
      supersedes,
      dispositions: conflictingSuccessor,
    }, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: {
        reason: "predecessor-not-current",
        predecessorDispositionSetId: supersedes.predecessorDispositionSetId,
        currentDispositionSetId: successor.dispositionSet.dispositionSetId,
      },
    });
  });

  it("publishes and replays a two-finding successor when a correction reverses canonical order", async () => {
    const records = fixture();
    const earlierFinding = {
      findingId: "finding-0",
      severity: "major" as const,
      locus: "src/index.ts:8",
      evidenceUrlOrId: "review:finding-0",
      sourceOrdinal: 2,
    };
    records.receipt.findings.push(earlierFinding);
    const deps = dependencies(records);
    const original = localRequest(records);
    const source = original.source;
    const originalProposal = await respondToReviewCommand({
      schemaVersion: 1,
      source,
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [earlierFinding, records.finding].map((finding) => ({
          findingId: finding.findingId,
          sourceVerification: "verified" as const,
          verificationRefs: [`source:${finding.locus}`],
          verifiedSeverity: "major" as const,
          disposition: "fix" as const,
          rationale: "The selected source supports this finding.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        })),
      },
    }, deps);
    if (originalProposal.state !== "awaiting-approval") throw new Error("expected original proposal");
    const predecessor = approveDispositionState({
      proposed: originalProposal.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T21:00:00Z",
    });
    await respondToReviewCommand({
      schemaVersion: 1,
      source,
      policyRequest: original.policyRequest,
      dispositions: predecessor,
    }, deps);

    const supersedes = {
      predecessorDispositionSetId: predecessor.dispositionSet.dispositionSetId,
      expectedFixPaths: ["src/index.ts"],
    };
    const successorProposal = await respondToReviewCommand({
      schemaVersion: 1,
      source,
      supersedes,
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: earlierFinding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://earlier-finding-correction"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "Focused verification disproved this finding before the fix landed.",
          recommendation: "Reject the unsupported finding.",
          openQuestions: [],
        }, {
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "major",
          disposition: "fix",
          rationale: "The selected source still supports this finding.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, deps);
    if (successorProposal.state !== "awaiting-approval") throw new Error("expected successor proposal");
    const successor = approveDispositionState({
      proposed: successorProposal.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T22:00:00Z",
    });
    expect(predecessor.dispositionSet.findings.map(({ findingId }) => findingId)).toEqual([
      earlierFinding.findingId, records.finding.findingId,
    ]);
    expect(successor.dispositionSet.findings.map(({ findingId }) => findingId)).toEqual([
      records.finding.findingId, earlierFinding.findingId,
    ]);

    const request = {
      schemaVersion: 1,
      source,
      policyRequest: original.policyRequest,
      supersedes,
      dispositions: successor,
    } as const;
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: { supersession: { status: "published" } },
    });
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: { supersession: { status: "replayed" } },
    });
    const record = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
    expect(record?.approvedDispositionLineage).toHaveLength(2);
    expect(record?.currentDispositionSetId).toBe(successor.dispositionSet.dispositionSetId);
  });

  it("refuses a consumed conditional authorization before publishing its successor", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const original = localRequest(records);
    await respondToReviewCommand(original, deps);
    const supersedes = {
      predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
      expectedFixPaths: ["src/index.ts"],
    };
    const proposed = await respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      supersedes,
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://consumed-authorization"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "The conditional next pass already consumed this authorization.",
          recommendation: "Preserve the consumed admission and predecessor evidence.",
          openQuestions: [],
        }],
      },
    }, deps);
    if (proposed.state !== "awaiting-approval") throw new Error("expected successor proposal");
    const successor = approveDispositionState({
      proposed: proposed.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T22:00:00Z",
    });
    deps.preflightConditionalNextPassInvalidation = async () => ({
      state: "refused",
      reason: "fix-consumed",
      detail: "consumed conditional pass authorization cannot be superseded",
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      policyRequest: original.policyRequest,
      supersedes,
      dispositions: successor,
    }, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: { reason: "fix-consumed" },
    });
    await expect(deps.dispositionStore.readDispositionRecord(records.operation.operationId))
      .resolves.toMatchObject({
        currentDispositionSetId: supersedes.predecessorDispositionSetId,
        approvedDispositionLineage: [{ successorDispositionSetId: null }],
      });
  });

  it("repairs successor publication when predecessor authorization invalidation was interrupted", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const original = localRequest(records);
    await respondToReviewCommand(original, deps);
    const supersedes = {
      predecessorDispositionSetId: original.dispositions.dispositionSet.dispositionSetId,
      expectedFixPaths: ["src/index.ts"],
    };
    const proposed = await respondToReviewCommand({
      schemaVersion: 1,
      source: original.source,
      supersedes,
      proposal: {
        proposedVerification: "focused",
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["verification://focused-real-path"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "Focused verification disproved the approved finding before the fix landed.",
          recommendation: "Reject the unsupported finding.",
          openQuestions: [],
        }],
        severityGatingPolicy: { minorGating: "record-only" },
      },
    }, deps);
    if (proposed.state !== "awaiting-approval") throw new Error("expected successor proposal");
    const successor = approveDispositionState({
      proposed: proposed.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T22:00:00Z",
    });
    let invalidationAttempts = 0;
    deps.invalidateConditionalNextPass = async () => {
      invalidationAttempts += 1;
      if (invalidationAttempts === 1) throw new Error("invalidation write interrupted");
    };
    const request = {
      schemaVersion: 1,
      source: original.source,
      policyRequest: original.policyRequest,
      supersedes,
      dispositions: successor,
    } as const;

    await expect(respondToReviewCommand(request, deps)).rejects.toThrow("invalidation write interrupted");
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "already-settled",
      payload: {
        supersession: {
          status: "replayed",
          predecessorDispositionSetId: supersedes.predecessorDispositionSetId,
          successorDispositionSetId: successor.dispositionSet.dispositionSetId,
        },
      },
    });
    const record = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
    expect(record?.approvedDispositionLineage).toHaveLength(2);
  });

  it("returns the same canonical report for proposal, approval, and approved replay", async () => {
    const records = fixture(workUnitVehicle, "N-7");
    const deps = dependencies(records);
    const source = { kind: "attested-local", receiptRef: records.receiptRef } as const;
    const proposed = await respondToReviewCommand({
      schemaVersion: 1,
      source,
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "The reviewer alleges this branch enters a failing path, but source verification shows it "
            + "is unreachable, so no execution failure occurs.",
          recommendation: "Reject the finding without changing code.",
          openQuestions: ["Should the reviewer clarify the cited execution path?"],
        }],
      },
    }, deps);
    if (proposed.state !== "awaiting-approval") throw new Error("expected a proposed disposition set");
    const expectedReport = proposed.payload.dispositionReportText;
    expect(expectedReport).toContain(
      "**Assessment:** NOT SUPPORTED · no ARC severity (ARC) · 🟠 major (reviewer)",
    );
    const dispositions = approveDispositionState({
      proposed: proposed.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T20:00:00Z",
    });

    const approvedRequest = {
      schemaVersion: 1,
      source,
      policyRequest: policyRequest(records),
      dispositions,
    } as const;
    await expect(respondToReviewCommand(approvedRequest, deps)).resolves.toMatchObject({
      state: "settled",
      payload: { dispositionReportText: expectedReport },
    });
    await expect(respondToReviewCommand(approvedRequest, deps)).resolves.toMatchObject({
      state: "already-settled",
      payload: { dispositionReportText: expectedReport },
    });
    await expect(respondToReviewCommand({
      ...approvedRequest,
      settledFixTarget: records.target,
    }, deps)).resolves.toMatchObject({
      state: "already-settled",
      payload: { dispositionReportText: expectedReport },
    });
  });

  it("settles a hosted body finding through the durable attempt without Candidate authority", async () => {
    const hosted = hostedResponseFixture("review-body");
    const attempt = hosted.operation.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("missing hosted attempt fixture");
    const deps = dependencies(hosted.records);
    deps.resultReader.readResult = async () => hostedResult(hosted);
    deps.readCandidateLineage = async () => null;
    const bind = vi.fn(async () => undefined);
    deps.bindHostedDisposition = bind;
    const disposition = approved({
      targetId: hosted.records.target.targetId,
      producerId: attempt.attemptId,
      resultDigest: attempt.hosted.sealedResult!.hostedResultId,
      policyVersion: attempt.hosted.requirement.policyVersion,
      rubricVersion: attempt.hosted.requirement.rubricVersion,
      rubricDigest: attempt.hosted.requirement.rubricDigest,
      sourceIdentity: "codex-pr",
      finding: hosted.records.finding,
      proposedVerification: "focused",
      disposition: "defer",
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "hosted", attemptRef: hosted.attemptRef },
      policyRequest: policyRequest(hosted.records, {
        sourceId: "codex-pr",
        reviewOperationId: attempt.attemptId,
        pullRequest: 42,
      }),
      dispositions: disposition,
    }, deps)).resolves.toMatchObject({ state: "settled", nextAction: "reduce" });
    expect(bind).toHaveBeenCalledWith(expect.objectContaining({
      operationId: hosted.operation.operationId,
      attemptId: attempt.attemptId,
      findingDispositions: [{
        findingId: hosted.records.finding.findingId,
        disposition: "defer",
        channelAction: "record-only",
      }],
    }));
  });

  it("returns hosted settlement as the selected response before reducing a record-only thread", async () => {
    const hosted = hostedResponseFixture("review-thread");
    const attempt = hosted.operation.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("missing hosted attempt fixture");
    const deps = dependencies(hosted.records);
    deps.resultReader.readResult = async () => hostedResult(hosted);
    const disposition = approved({
      targetId: hosted.records.target.targetId,
      producerId: attempt.attemptId,
      resultDigest: attempt.hosted.sealedResult!.hostedResultId,
      policyVersion: attempt.hosted.requirement.policyVersion,
      rubricVersion: attempt.hosted.requirement.rubricVersion,
      rubricDigest: attempt.hosted.requirement.rubricDigest,
      sourceIdentity: "codex-pr",
      finding: hosted.records.finding,
      disposition: "defer",
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "hosted", attemptRef: hosted.attemptRef },
      policyRequest: policyRequest(hosted.records, {
        sourceId: "codex-pr",
        reviewOperationId: attempt.attemptId,
        pullRequest: 42,
      }),
      dispositions: disposition,
    }, deps)).resolves.toMatchObject({
      state: "ready-to-settle",
      nextAction: "settle-hosted",
      payload: {
        hostedSettlementPlan: {
          actorIdentity: "host-actor-1",
          beforeFixFindingIds: [hosted.records.finding.findingId],
          afterFixFindingIds: [],
        },
      },
    });
  });

  it("carries compatible hosted settlement and reopens only a changed successor action", async () => {
    const hosted = hostedResponseFixture("review-thread");
    const attempt = hosted.operation.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("missing hosted attempt fixture");
    const deps = dependencies(hosted.records);
    let settled = false;
    deps.resultReader.readResult = async () => ({ ...hostedResult(hosted), settled });
    const original = approved({
      targetId: hosted.records.target.targetId,
      producerId: attempt.attemptId,
      resultDigest: attempt.hosted.sealedResult!.hostedResultId,
      policyVersion: attempt.hosted.requirement.policyVersion,
      rubricVersion: attempt.hosted.requirement.rubricVersion,
      rubricDigest: attempt.hosted.requirement.rubricDigest,
      sourceIdentity: "codex-pr",
      finding: hosted.records.finding,
      disposition: "defer",
    });
    const source = { kind: "hosted" as const, attemptRef: hosted.attemptRef };
    const policy = policyRequest(hosted.records, {
      sourceId: "codex-pr",
      reviewOperationId: attempt.attemptId,
      pullRequest: 42,
    });
    await respondToReviewCommand({ schemaVersion: 1, source, policyRequest: policy, dispositions: original }, deps);
    settled = true;
    const supersedes = {
      predecessorDispositionSetId: original.dispositionSet.dispositionSetId,
      expectedFixPaths: [],
    };
    const proposed = await respondToReviewCommand({
      schemaVersion: 1,
      source,
      supersedes,
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: hosted.records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: hosted.records.finding.severity,
          disposition: "defer",
          rationale: "Fresh evidence preserves the approved deferral.",
          recommendation: "Retain the recorded deferral.",
          openQuestions: [],
        }],
      },
    }, deps);
    if (proposed.state !== "awaiting-approval") throw new Error("expected successor proposal");
    const successor = approveDispositionState({
      proposed: proposed.payload.proposal,
      approvedBy: hosted.records.authority.authorIdentity,
      approvedAt: "2026-07-23T22:00:00Z",
    });
    deps.supersedeHostedDisposition = async () => ({
      state: "advanced",
      carriedFindingIds: [hosted.records.finding.findingId],
      reopenedFindingIds: [],
    });

    const response = await respondToReviewCommand({
      schemaVersion: 1,
      source,
      policyRequest: policy,
      supersedes,
      dispositions: successor,
    }, deps);
    expect(response).toMatchObject({
      state: "settled",
      nextAction: "reduce",
      payload: {
        supersession: {
          carriedFindingIds: [hosted.records.finding.findingId],
          reopenedFindingIds: [],
        },
      },
    });
    expect("hostedSettlementPlan" in response.payload).toBe(false);

    const nextSupersedes = {
      predecessorDispositionSetId: successor.dispositionSet.dispositionSetId,
      expectedFixPaths: [],
    };
    const nextProposed = await respondToReviewCommand({
      schemaVersion: 1,
      source,
      supersedes: nextSupersedes,
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: hosted.records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: hosted.records.finding.severity,
          disposition: "reject",
          rationale: "Fresh evidence changes the approved channel action.",
          recommendation: "Reject the finding with a corrected response.",
          openQuestions: [],
        }],
      },
    }, deps);
    if (nextProposed.state !== "awaiting-approval") throw new Error("expected second successor proposal");
    const nextSuccessor = approveDispositionState({
      proposed: nextProposed.payload.proposal,
      approvedBy: hosted.records.authority.authorIdentity,
      approvedAt: "2026-07-23T23:00:00Z",
    });
    deps.supersedeHostedDisposition = async () => ({
      state: "advanced",
      carriedFindingIds: [],
      reopenedFindingIds: [hosted.records.finding.findingId],
    });

    const reopenedRequest = {
      schemaVersion: 1,
      source,
      policyRequest: policy,
      supersedes: nextSupersedes,
      dispositions: nextSuccessor,
    } as const;
    deps.preflightHostedDisposition = async () => ({
      state: "refused",
      reason: "hosted-settlement-conflict",
      detail: "hosted predecessor settlement cannot be attributed exactly",
    });
    await expect(respondToReviewCommand(reopenedRequest, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: {
        reason: "hosted-settlement-conflict",
        predecessorDispositionSetId: nextSupersedes.predecessorDispositionSetId,
      },
    });
    await expect(deps.dispositionStore.readDispositionRecord(hosted.records.operation.operationId))
      .resolves.toMatchObject({
        currentDispositionSetId: successor.dispositionSet.dispositionSetId,
      });
    deps.preflightHostedDisposition = async () => ({ state: "ready" });
    await expect(respondToReviewCommand(reopenedRequest, deps)).resolves.toMatchObject({
      state: "ready-to-settle",
      nextAction: "settle-hosted",
      payload: {
        supersession: {
          carriedFindingIds: [],
          reopenedFindingIds: [hosted.records.finding.findingId],
        },
        hostedSettlementPlan: {
          beforeFixFindingIds: [hosted.records.finding.findingId],
          afterFixFindingIds: [],
        },
      },
    });

    deps.supersedeHostedDisposition = async () => ({
      state: "refused",
      reason: "hosted-settlement-conflict",
      detail: "hosted predecessor settlement cannot be attributed exactly",
    });
    await expect(respondToReviewCommand(reopenedRequest, deps)).resolves.toMatchObject({
      state: "supersession-refused",
      nextAction: "stop",
      payload: {
        reason: "hosted-settlement-conflict",
        predecessorDispositionSetId: nextSupersedes.predecessorDispositionSetId,
      },
    });
  });

  it("returns hosted settlement re-entry for an approved thread fix", async () => {
    const hosted = hostedResponseFixture("review-thread");
    const attempt = hosted.operation.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("missing hosted attempt fixture");
    const deps = dependencies(hosted.records);
    deps.resultReader.readResult = async () => hostedResult(hosted);
    const disposition = approved({
      targetId: hosted.records.target.targetId,
      producerId: attempt.attemptId,
      resultDigest: attempt.hosted.sealedResult!.hostedResultId,
      policyVersion: attempt.hosted.requirement.policyVersion,
      rubricVersion: attempt.hosted.requirement.rubricVersion,
      rubricDigest: attempt.hosted.requirement.rubricDigest,
      sourceIdentity: "codex-pr",
      finding: hosted.records.finding,
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "hosted", attemptRef: hosted.attemptRef },
      policyRequest: policyRequest(hosted.records, {
        sourceId: "codex-pr",
        reviewOperationId: attempt.attemptId,
        pullRequest: 42,
      }),
      dispositions: disposition,
    }, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: {
        reentryCommand: "hosted-settle",
        hostedSettlementPlan: {
          beforeFixFindingIds: [],
          afterFixFindingIds: [hosted.records.finding.findingId],
        },
      },
    });
  });

  it("records a verified hosted delivery-member fix at the authoritative current member target", async () => {
    const hosted = hostedResponseFixture("review-thread", memberVehicle);
    const attempt = hosted.operation.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("missing hosted attempt fixture");
    const deps = dependencies(hosted.records);
    deps.resultReader.readResult = async () => hostedResult(hosted);
    deps.readCandidateLineage = async () => null;
    const currentTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: hosted.records.target.repositoryId,
      baseRef: hosted.records.target.baseRef,
      diffBaseSha: hosted.records.target.diffBaseSha,
      diffBaseTree: hosted.records.target.diffBaseTree,
      headSha: objectId("1"),
      headTree: objectId("2"),
    });
    const hostedFixTarget = {
      ...attempt.hosted.target,
      headSha: currentTarget.headSha,
    };
    const dispositions = approved({
      targetId: hosted.records.target.targetId,
      producerId: attempt.attemptId,
      resultDigest: attempt.hosted.sealedResult!.hostedResultId,
      policyVersion: attempt.hosted.requirement.policyVersion,
      rubricVersion: attempt.hosted.requirement.rubricVersion,
      rubricDigest: attempt.hosted.requirement.rubricDigest,
      sourceIdentity: "codex-pr",
      finding: hosted.records.finding,
      proposedVerification: "focused",
    });
    const request = {
      schemaVersion: 1 as const,
      source: { kind: "hosted" as const, attemptRef: hosted.attemptRef },
      policyRequest: policyRequest(hosted.records, {
        sourceId: "codex-pr",
        reviewOperationId: attempt.attemptId,
        pullRequest: 42,
      }),
      dispositions,
    };

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "delivery-correction-required",
      nextAction: "continue-delivery-correction",
      payload: {
        deliveryMember: attempt.hosted.vehicle,
        correctionAction: {
          argv: ["arc", "delivery", "review-fix", "continue", "-"],
          input: { repository: "owner/repo", remote: "origin" },
        },
      },
    });
    const verifiedRequest = {
      ...request,
      verifiedFix: {
        applicability: "focused" as const,
        verificationEvidenceRefs: ["verification://focused-fix"],
      },
    };
    await expect(respondToReviewCommand(verifiedRequest, deps))
      .rejects.toThrow("authoritative current delivery-member target is unavailable");
    const withCurrentMember = Object.assign(deps, {
      resolveDeliveryMemberFixTarget: async () => ({ currentTarget, hostedFixTarget }),
    });
    await expect(respondToReviewCommand(verifiedRequest, withCurrentMember)).resolves.toMatchObject({
      state: "delivery-member-advanced",
      nextAction: "continue-review",
      payload: {
        currentTarget,
        hostedFixTarget,
        hostedSettlementPlan: {
          beforeFixFindingIds: [],
          afterFixFindingIds: [hosted.records.finding.findingId],
        },
      },
    });
    const reboundDisposition = vi.fn(async () => undefined);
    withCurrentMember.bindHostedDisposition = reboundDisposition;
    await expect(respondToReviewCommand(verifiedRequest, withCurrentMember)).resolves.toMatchObject({
      state: "delivery-member-current",
      nextAction: "continue-review",
      payload: {
        currentTarget,
        hostedFixTarget,
        hostedSettlementPlan: {
          beforeFixFindingIds: [],
          afterFixFindingIds: [hosted.records.finding.findingId],
        },
      },
    });
    expect(reboundDisposition).toHaveBeenCalledWith(expect.objectContaining({
      operationId: hosted.operation.operationId,
      attemptId: attempt.attemptId,
      dispositionSetId: dispositions.dispositionSet.dispositionSetId,
      findingDispositions: [{
        findingId: hosted.records.finding.findingId,
        disposition: "fix",
        channelAction: "reply-and-resolve",
      }],
    }));
  });

  it("orders unchanged-head hosted settlements before fixes in a mixed approved set", async () => {
    const hosted = hostedResponseFixture("review-thread");
    const attempt = hosted.operation.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("missing hosted attempt fixture");
    const reviewedFinding = attempt.hosted.sealedResult?.findings[0];
    if (reviewedFinding?.origin !== "review-thread") throw new Error("missing hosted thread finding fixture");
    const deferredFinding = {
      ...reviewedFinding,
      findingId: "finding-deferred",
      commentId: "comment-2",
      threadId: "thread-2",
      locus: "src/deferred.ts:9",
      url: "https://example.test/thread-2",
      sourceOrdinal: 2,
    };
    attempt.hosted = createHostedTerminalAttemptFixture({
      admission: attempt.hosted.admission,
      artifact: attempt.hosted.handle!.artifact,
      outcome: "findings",
      findings: [reviewedFinding, deferredFinding],
    }).hosted;
    const deps = dependencies(hosted.records);
    deps.resultReader.readResult = async () => hostedResult(hosted);
    const disposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: hosted.records.target.targetId,
        producerId: attempt.attemptId,
        resultDigest: attempt.hosted.sealedResult!.hostedResultId,
        policyVersion: attempt.hosted.requirement.policyVersion,
        rubricVersion: attempt.hosted.requirement.rubricVersion,
        rubricDigest: attempt.hosted.requirement.rubricDigest,
        proposedBy: "arc-cli/0.1.0",
        proposedVerification: "full",
        findings: [{
          findingId: hosted.records.finding.findingId,
          sourceIdentity: "codex-pr",
          locus: hosted.records.finding.locus,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          reportedSeverity: hosted.records.finding.severity,
          verifiedSeverity: hosted.records.finding.severity,
          disposition: "fix",
          gating: "blocking",
          rationale: "The finding requires a code change.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }, {
          findingId: deferredFinding.findingId,
          sourceIdentity: "codex-pr",
          locus: deferredFinding.locus,
          sourceVerification: "verified",
          verificationRefs: ["source:src/deferred.ts:9"],
          reportedSeverity: deferredFinding.severity,
          verifiedSeverity: deferredFinding.severity,
          disposition: "defer",
          gating: "blocking",
          rationale: "The finding belongs to follow-up work.",
          recommendation: "Record the deferral.",
          openQuestions: [],
        }],
      })),
      approvedBy: "author-1",
      approvedAt: "2026-07-23T20:00:00Z",
    });
    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "hosted", attemptRef: hosted.attemptRef },
      policyRequest: policyRequest(hosted.records, {
        sourceId: "codex-pr",
        reviewOperationId: attempt.attemptId,
        pullRequest: 42,
      }),
      dispositions: disposition,
    }, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: {
        hostedSettlementPlan: {
          beforeFixFindingIds: [deferredFinding.findingId],
          afterFixFindingIds: [hosted.records.finding.findingId],
        },
      },
    });
  });

  it("preserves reported and verified grades without collapsing either judgment", async () => {
    const records = fixture();
    const proposal = async (
      sourceVerification: "verified" | "not-supported",
      verifiedSeverity: "critical" | null,
    ) =>
      respondToReviewCommand({
        schemaVersion: 1,
        source: { kind: "attested-local", receiptRef: records.receiptRef },
        proposal: {
          proposedVerification: "full",
          severityGatingPolicy: { minorGating: "record-only" },
          findings: [{
            findingId: records.finding.findingId,
            sourceVerification,
            verificationRefs: ["source:src/index.ts:7"],
            verifiedSeverity,
            disposition: sourceVerification === "verified" ? "fix" : "reject",
            rationale: "The selected source determines this disposition.",
            recommendation: sourceVerification === "verified" ? "Apply the fix." : "Reject the finding.",
            openQuestions: [],
          }],
        },
      }, dependencies(records));

    const regraded = await proposal("verified", "critical");
    if (regraded.state !== "awaiting-approval") throw new Error("regraded proposal was not materialized");
    const regradedFinding = regraded.payload.proposal.dispositionSet.findings[0];
    expect(regradedFinding).toMatchObject({ reportedSeverity: "major", verifiedSeverity: "critical" });

    const unsupported = await proposal("not-supported", null);
    if (unsupported.state !== "awaiting-approval") throw new Error("unsupported proposal was not materialized");
    const unsupportedFinding = unsupported.payload.proposal.dispositionSet.findings[0];
    expect(unsupportedFinding).toMatchObject({
      sourceVerification: "not-supported",
      reportedSeverity: "major",
      verifiedSeverity: null,
      disposition: "reject",
      gating: "record-only",
    });
  });

  it("rejects retired blocker severity in an author proposal", async () => {
    const records = fixture();

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "blocker",
          disposition: "fix",
          rationale: "The finding requires a code change.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, dependencies(records))).rejects.toThrow();
  });

  it("preserves a reported nit independently from a non-minor verified grade", async () => {
    const hosted = hostedResponseFixture("review-thread", workUnitVehicle, true);
    const deps = dependencies(hosted.records);
    deps.resultReader.readResult = async () => hostedResult(hosted);

    const proposal = await respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "hosted", attemptRef: hosted.attemptRef },
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: hosted.records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "major",
          disposition: "fix",
          rationale: "The source supports a non-minor primary grade.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, deps);
    if (proposal.state !== "awaiting-approval") throw new Error("hosted proposal was not materialized");

    expect(proposal).toMatchObject({
      state: "awaiting-approval",
      payload: {
        proposal: {
          dispositionSet: {
            findings: [{ reportedSeverity: "minor", reportedNit: true, verifiedSeverity: "major" }],
          },
        },
      },
    });
    expect(proposal.payload.dispositionReportText).toContain(
      "**Assessment:** CONFIRMED · 🟠 major (ARC) · 🟡 minor nit (reviewer)",
    );
  });

  it("preserves a verified nit independently from a non-nit reported grade", async () => {
    const records = fixture();

    const proposal = await respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "blocking" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "minor",
          verifiedNit: true,
          disposition: "defer",
          rationale: "The source supports a verified polish-only issue.",
          recommendation: "Record the non-blocking disposition.",
          openQuestions: [],
        }],
      },
    }, dependencies(records));

    expect(proposal).toMatchObject({
      state: "awaiting-approval",
      payload: {
        proposal: {
          dispositionSet: {
            findings: [{
              reportedSeverity: "major",
              verifiedSeverity: "minor",
              verifiedNit: true,
              gating: "record-only",
            }],
          },
        },
      },
    });
  });

  it("applies the proposal's effective policy to an ordinary verified minor", async () => {
    const records = fixture();

    const proposal = await respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "blocking" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: "minor",
          disposition: "fix",
          rationale: "The source supports an ordinary verified minor.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, dependencies(records));

    expect(proposal).toMatchObject({
      state: "awaiting-approval",
      payload: {
        proposal: {
          dispositionSet: {
            findings: [{ verifiedSeverity: "minor", gating: "blocking" }],
          },
        },
      },
    });
  });

  it("reloads local receipt and source authority and returns a validated fix authorization", async () => {
    const records = fixture();
    await expect(respondToReviewCommand(localRequest(records), dependencies(records))).resolves.toMatchObject({
      state: "ready-to-fix",
      nextAction: "apply-fix",
      payload: {
        operationId: records.operation.operationId,
        dispositionRecordRef: "git-common:review-gate/evidence/disposition.json",
        fixAuthorization: {
          oldTargetId: records.target.targetId,
          authorizedFindingIds: ["finding-1"],
        },
        reentryCommand: "local-prepare",
      },
    });
  });

  it("appends approval before resolving policy and returns the response-first continuation", async () => {
    const records = fixture();
    const deps = dependencies(records) as RespondCommandDependencies & {
      resolvePolicy(request: unknown): Promise<unknown>;
    };
    const policy = {
      schemaVersion: 1 as const,
      mode: "review-resolve" as const,
      diagnostics: [],
      state: "findings" as const,
      nextAction: "respond" as const,
      payload: {
        lane: "standard" as const,
        scope: "whole-target" as const,
        sourceId: "delegated-agent",
        pass: 1,
        completedPasses: 1,
        consumedPass: true as const,
        attemptedSources: policyRequest(records).attempts,
        verifiedTerminalSignal: {
          reviewOperationId: records.operation.operationId,
          confirmedFindingCount: 1,
          maxConfirmedSeverity: "major" as const,
          coverageAdequate: true,
        },
        postResponseAction: "resolve-next-pass" as const,
      },
    };
    deps.resolvePolicy = async () => {
      const appended = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
      if (appended === null) throw new Error("policy ran before approval append");
      return policy;
    };

    await expect(respondToReviewCommand({
      ...localRequest(records),
      policyRequest: policyRequest(records),
    }, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      nextAction: "apply-fix",
      payload: {
        policy,
        policyRequest: policyRequest(records),
      },
    });
  });

  it("serializes response publication through the source operation boundary", async () => {
    const records = fixture();
    const deps = dependencies(records) as RespondCommandDependencies & {
      withOperationLock<T>(operationId: string, action: () => Promise<T>): Promise<T>;
    };
    let operationLocked = false;
    const append = deps.dispositionStore.appendDispositionRecord.bind(deps.dispositionStore);
    deps.dispositionStore.appendDispositionRecord = async (record) => {
      if (!operationLocked) throw new Error("response publication escaped its operation lock");
      return append(record);
    };
    deps.withOperationLock = async (_operationId, action) => {
      operationLocked = true;
      try {
        return await action();
      } finally {
        operationLocked = false;
      }
    };

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      nextAction: "apply-fix",
    });
  });

  it("refuses approved response input that omits its governing policy continuation", async () => {
    const records = fixture();
    const request: Record<string, unknown> = { ...localRequest(records) };
    delete request.policyRequest;

    await expect(respondToReviewCommand(request, dependencies(records)))
      .rejects.toThrow("policyRequest");
  });

  it("refuses absent or foreign terminal policy producers before publishing approval", async () => {
    const records = fixture();
    const request = localRequest(records);
    for (const attempts of [[], [{
      sourceId: "delegated-agent",
      outcome: "findings" as const,
      reviewOperationId: "foreign-producer",
    }]]) {
      const deps = dependencies(records);
      await expect(respondToReviewCommand({
        ...request,
        policyRequest: { ...request.policyRequest, attempts },
      }, deps)).rejects.toThrow("exact findings producer");
      await expect(deps.dispositionStore.readDispositionRecord(records.operation.operationId))
        .resolves.toBeNull();
    }
  });

  it("repairs a pending approved policy projection before fix performance", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const request = localRequest(records);
    const originalResolvePolicy = deps.resolvePolicy;
    deps.resolvePolicy = async (policy, target) => {
      if (policy.standardReview.reasons.includes("project:review:stale-policy-context")) {
        throw new Error("policy context unavailable");
      }
      return originalResolvePolicy(policy, target);
    };
    const invalidPolicy = {
      ...request.policyRequest,
      standardReview: {
        ...request.policyRequest.standardReview,
        reasons: ["project:review:stale-policy-context"],
      },
    };
    await expect(respondToReviewCommand({ ...request, policyRequest: invalidPolicy }, deps))
      .rejects.toThrow("policy context unavailable");
    const pending = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
    expect(pending === null ? null : currentApprovedDispositionNode(pending).policyProjectionPending)
      .toBe(true);

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      nextAction: "apply-fix",
    });
    const resolved = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
    if (resolved === null) throw new Error("approved response disappeared");
    expect(currentApprovedDispositionNode(resolved).policyProjectionPending).toBeUndefined();
    expect(currentApprovedDispositionNode(resolved).responsePolicyRequest)
      .toEqual(request.policyRequest);
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      nextAction: "apply-fix",
    });
  });

  it("persists conditional next-pass consent after approval and dispatches nothing when capture fails", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const settle = vi.fn(async () => undefined);
    deps.settleLaneFindings = settle;
    deps.captureConditionalNextPass = async () => {
      const appended = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
      if (appended === null) throw new Error("capture ran before approval append");
      throw new Error("capture write failed");
    };
    const base = policyRequest(records);
    const request = localRequest(records, "defer");

    await expect(respondToReviewCommand({
      ...request,
      policyRequest: {
        ...base,
        ceilingOverride: {
          target: base.target,
          lane: base.lane,
          exhaustedPassCount: 1,
          nextPass: 2,
        },
      },
      conditionalNextPassAuthorization: {
        authorizedBy: records.authority.authorIdentity,
        exhaustedPassCount: 1,
        nextPass: 2,
      },
    }, deps)).rejects.toThrow("capture write failed");
    expect(settle).not.toHaveBeenCalled();
  });

  it("refuses a foreign conditional authorizer before appending the approved disposition", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const base = policyRequest(records);

    await expect(respondToReviewCommand({
      ...localRequest(records, "defer"),
      policyRequest: {
        ...base,
        ceilingOverride: {
          target: base.target,
          lane: base.lane,
          exhaustedPassCount: 1,
          nextPass: 2,
        },
      },
      conditionalNextPassAuthorization: {
        authorizedBy: "different-author",
        exhaustedPassCount: 1,
        nextPass: 2,
      },
    }, deps)).rejects.toThrow("authorizer is not the active local identity");
    await expect(deps.dispositionStore.readDispositionRecord(records.operation.operationId)).resolves.toBeNull();
  });

  it("returns the persisted conditional next-pass authorization with the response action", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const base = policyRequest(records);

    const result = await respondToReviewCommand({
      ...localRequest(records, "defer"),
      policyRequest: {
        ...base,
        ceilingOverride: {
          target: base.target,
          lane: base.lane,
          exhaustedPassCount: 1,
          nextPass: 2,
        },
      },
      conditionalNextPassAuthorization: {
        authorizedBy: records.authority.authorIdentity,
        exhaustedPassCount: 1,
        nextPass: 2,
      },
    }, deps);
    if (result.state !== "settled" || !("conditionalPassAuthorizationId" in result.payload)) {
      throw new Error("expected a settled response with conditional pass authorization");
    }
    const authorizationId = result.payload.conditionalPassAuthorizationId;
    expect(result).toMatchObject({
      state: "settled",
      nextAction: "reduce",
      payload: {
        conditionalPassAuthorizationId: authorizationId,
        policyRequest: {
          ceilingOverride: {
            conditionalPassAuthorizationId: authorizationId,
          },
        },
      },
    });
  });

  it("does not derive conditional next-pass consent from disposition approval alone", async () => {
    const records = fixture();
    const base = policyRequest(records);

    await expect(respondToReviewCommand({
      ...localRequest(records),
      policyRequest: {
        ...base,
        ceilingOverride: {
          target: base.target,
          lane: base.lane,
          exhaustedPassCount: 1,
          nextPass: 2,
        },
      },
    }, dependencies(records))).rejects.toThrow("explicit conditional next-pass authorization");
  });

  it("returns settled and then already-settled for an identical non-fix replay", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const request = localRequest(records, "defer");
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({ state: "settled" });
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({ state: "already-settled" });
  });

  it("returns stale-target before appending dispositions when the reviewed Candidate content moved", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const appendDispositionRecord = vi.fn();
    const currentTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: records.target.repositoryId,
      baseRef: records.target.baseRef,
      diffBaseSha: records.target.diffBaseSha,
      diffBaseTree: records.target.diffBaseTree,
      headSha: objectId("e"),
      headTree: objectId("f"),
    });
    deps.confirmTarget = async () => ({
      state: "stale-target",
      attemptedTarget: records.target,
      currentTarget,
    });
    const lineage = await deps.readCandidateLineage(records.target);
    if (lineage === null) throw new Error("expected a bound Candidate lineage");
    const current = { revision: currentTarget.headSha, subject: candidateSubject("changed") };
    deps.readCandidateLineage = async () => ({
      ...lineage,
      current,
      effective: effectiveChanged(lineage.record, current),
    });
    deps.dispositionStore.appendDispositionRecord = appendDispositionRecord;

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId: records.operation.operationId,
        attemptedTarget: records.target,
        currentTarget,
      },
    });
    expect(appendDispositionRecord).not.toHaveBeenCalled();
  });

  it("accepts an operational-only stale target when the managed Candidate subject is unchanged", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const currentTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: records.target.repositoryId,
      baseRef: records.target.baseRef,
      diffBaseSha: records.target.diffBaseSha,
      diffBaseTree: records.target.diffBaseTree,
      headSha: objectId("e"),
      headTree: objectId("f"),
    });
    deps.confirmTarget = async () => ({
      state: "stale-target",
      attemptedTarget: records.target,
      currentTarget,
    });
    const lineage = await deps.readCandidateLineage(records.target);
    if (lineage === null) throw new Error("expected a bound Candidate lineage");
    const current = { revision: currentTarget.headSha, subject: lineage.record.subject };
    deps.readCandidateLineage = async () => ({
      ...lineage,
      current,
      effective: effectiveCurrent(lineage.record, current),
    });

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      nextAction: "apply-fix",
      payload: { operationId: records.operation.operationId },
    });
  });

  it("refuses actor identities that do not come from the trusted boundary", async () => {
    const records = fixture();
    const result = localResult(records);
    const request = localRequest(records);
    request.dispositions = approved({
      targetId: records.target.targetId,
      producerId: result.producerId,
      resultDigest: result.resultDigest,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      sourceIdentity: records.authority.evaluatorIdentity,
      finding: records.finding,
      proposedBy: "other-runtime",
    });
    await expect(respondToReviewCommand(request, dependencies(records)))
      .rejects.toThrow("composing runtime");
  });

  it("refuses a divergent replay for the same operation", async () => {
    const records = fixture();
    const deps = dependencies(records);
    await respondToReviewCommand(localRequest(records, "defer"), deps);
    await expect(respondToReviewCommand(localRequest(records, "reject"), deps))
      .rejects.toThrow("conflicting approved disposition record");
  });

  it.each(["producer", "result digest"] as const)(
    "re-resolves an approved request and refuses a substituted %s",
    async (substitution) => {
      const records = fixture();
      const request = localRequest(records);
      const deps = dependencies(records);
      const result = localResult(records);
      deps.resultReader.readResult = async () => substitution === "producer"
        ? { ...result, producerId: "later-review-operation" }
        : { ...result, resultDigest: digest("later-review-result") };

      await expect(respondToReviewCommand(request, deps))
        .rejects.toThrow("approved dispositions do not match the selected review source");
    },
  );

  it("does not manufacture an empty disposition for a clean producer", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const result = localResult(records);
    deps.resultReader.readResult = async () => ({
      ...result,
      originalOutcome: "clean",
      findings: [],
      resultDigest: digest("clean-review-result"),
    });

    await expect(respondToReviewCommand(localRequest(records), deps))
      .rejects.toThrow("local response requires a findings receipt");
  });

  it("materializes and settles frontline dispositions from exact durable operation context", async () => {
    const records = fixture(errandVehicle);
    const source = {
      sourceId: "coderabbit-cli",
      kind: "command" as const,
      executable: "coderabbit",
      argv: ["review"],
    };
    const findingsOutcome = normalizeFrontlineOutcome({
      providerResult: { kind: "findings", findings: [records.finding] },
      source,
      target: records.target,
      pass: 1,
      maxPasses: 2,
    });
    const record = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: records.target.repositoryId,
      operationId: "frontline-operation",
      sourceIdentity: source.sourceId,
      executableIdentity: {
        digest: digest("coderabbit"),
        qualifiedVersion: "coderabbit/1.0.0",
      },
      outcome: findingsOutcome,
    });
    const durableRef = "git-common:review-gate/outcomes/frontline.json#1";
    const outcomeRef = bindReviewSourceReference({
      kind: "frontline",
      operationId: record.operationId,
      durableRef,
    });
    const deps = dependencies(records);
    const operation: FrontlineRunState = {
      schemaVersion: 1,
      semanticsVersion: "review-operation/v1",
      kind: "frontline-run",
      operationId: record.operationId,
      updatedAt: "2026-07-23T17:00:00Z",
      repositoryId: records.target.repositoryId,
      targetId: records.target.targetId,
      sourceIdentity: source.sourceId,
      lineage: {
        kind: "candidate",
        candidateId: digest("frontline-candidate"),
      },
      logicalPass: 1,
      retryGeneration: 0,
      outcome: "findings",
      policyVersion: digest("frontline-policy"),
      sourceBindingId: computeFrontlineSourceBindingId(source),
    };
    deps.resultReader.readResult = async () => frontlineResult({ operation, record, outcomeRef: durableRef });
    deps.readCandidateLineage = async () => null;
    const proposal = await respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "not-supported",
          verificationRefs: ["source:src/index.ts:7"],
          verifiedSeverity: null,
          disposition: "reject",
          rationale: "The source does not support the reported issue.",
          recommendation: "Reject the finding.",
          openQuestions: [],
        }],
      },
    }, deps);
    expect(proposal).toMatchObject({
      state: "awaiting-approval",
      payload: {
        operationId: record.operationId,
        proposal: {
          dispositionSet: {
            policyVersion: operation.policyVersion,
            frontlineBinding: {
              operationId: operation.operationId,
              sourceBindingId: operation.sourceBindingId,
              outcomeDigest: record.outcomeDigest,
            },
          },
        },
      },
    });
    if (proposal.state !== "awaiting-approval") throw new Error("frontline proposal was not materialized");
    expect(proposal.payload.provisionalPassAssessment).toMatchObject({
      status: "provisional",
      lane: "frontline",
      admittedLogicalPass: 1,
      configuredMaxPasses: 2,
      proposedSignal: { confirmedFindingCount: 0, maxConfirmedSeverity: null },
      capPosition: "below-ceiling",
      potentialStopReason: null,
      nextPassAuthority: "none",
    });
    expect(proposal.payload.provisionalPassAssessment.summaryText).toContain("Pass 1 of 2");
    expect(proposal.payload.provisionalPassAssessment.summaryText).toContain("source-verified findings are proposed");
    expect(proposal.payload.provisionalPassAssessment.summaryText).toContain("grants no next-pass authority");
    expect(proposal.payload.proposal.dispositionSet).not.toHaveProperty("rubricVersion");
    expect(proposal.payload.proposal.dispositionSet).not.toHaveProperty("rubricDigest");

    const dispositions = approveDispositionState({
      proposed: proposal.payload.proposal,
      approvedBy: records.authority.authorIdentity,
      approvedAt: "2026-07-23T20:00:00Z",
    });
    const frontlinePolicyRequest = policyRequest(records, {
      lane: "frontline",
      sourceId: source.sourceId,
      reviewOperationId: record.operationId,
    });
    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      policyRequest: frontlinePolicyRequest,
      dispositions,
    }, deps)).resolves.toMatchObject({
      state: "settled",
      nextAction: "reduce",
      payload: { operationId: record.operationId },
    });

    const changedOperation = {
      ...operation,
      sourceBindingId: digest("changed-frontline-source-binding"),
    };
    deps.resultReader.readResult = async () => frontlineResult({
      operation: changedOperation,
      record,
      outcomeRef: durableRef,
    });
    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      policyRequest: frontlinePolicyRequest,
      dispositions,
    }, deps)).rejects.toThrow("approved dispositions do not match the selected review source");

    const clean = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: record.repositoryId,
      operationId: record.operationId,
      sourceIdentity: record.sourceIdentity,
      executableIdentity: record.executableIdentity,
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "clean" },
        source,
        target: records.target,
        pass: 1,
        maxPasses: 2,
      }),
    });
    deps.resultReader.readResult = async () => frontlineResult({
      operation: { ...operation, outcome: "clean" },
      record: clean,
      outcomeRef: durableRef,
    });
    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      policyRequest: frontlinePolicyRequest,
      dispositions,
    }, deps)).rejects.toThrow("requires a findings outcome");

    deps.resultReader.readResult = async () => {
      throw new Error("frontline response operation is unavailable");
    };
    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      policyRequest: frontlinePolicyRequest,
      dispositions,
    }, deps)).rejects.toThrow("frontline response operation is unavailable");
  });

  it.each([
    ["delivery member", memberVehicle],
    ["work unit", workUnitVehicle],
    ["Errand", errandVehicle],
  ] as const)("resolves actors for a %s operation from its admitted identities", async (
    _label,
    vehicle,
  ) => {
    const records = fixture(vehicle);
    const deps = dependencies(records);
    const resolveLocalActors = vi.fn(deps.resolveLocalActors);
    deps.resolveLocalActors = resolveLocalActors;
    if (vehicle.kind === "errand") deps.resolveActiveErrand = async () => activeErrandBinding();

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: { operationId: records.operation.operationId },
    });
    // The vehicle never reaches actor resolution, so no member selector exists to
    // carry: the admitted author and evaluator are identical across all three operations.
    expect(resolveLocalActors).toHaveBeenCalledWith(
      records.authority.evaluatorIdentity,
      records.authority.authorIdentity,
    );
  });

  it.each([
    ["fix", "ready-to-fix"],
    ["reject", "settled"],
  ] as const)("records an Errand %s response without inventing Candidate authority", async (
    disposition,
    state,
  ) => {
    const records = fixture(errandVehicle);
    const deps = dependencies(records);
    const appendDispositionRecord = vi.fn(async () => ({
      dispositionRecordRef: "git-common:review-gate/evidence/disposition.json",
    }));
    deps.readCandidateLineage = async () => null;
    deps.resolveActiveErrand = async () => activeErrandBinding();
    deps.dispositionStore.appendDispositionRecord = appendDispositionRecord;

    await expect(respondToReviewCommand(localRequest(records, disposition), deps))
      .resolves.toMatchObject({ state });
    expect(appendDispositionRecord).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: null }),
    );
  });
});

describe("verified-fix Candidate settlement", () => {
  it("refuses verification narrower than the approved proposal", async () => {
    const records = fixture();
    const { deps } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    }, "full");
    await expect(respondToReviewCommand({
      ...localRequest(records, "fix", "full"),
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://focused-fix"],
      },
    }, deps)).rejects.toThrow("narrower than the approved scope");
  });

  it("accepts verification broader than the approved proposal", async () => {
    const records = fixture();
    const { deps } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    }, "targeted");

    await expect(respondToReviewCommand({
      ...localRequest(records, "fix", "targeted"),
      verifiedFix: {
        applicability: "full",
        verificationEvidenceRefs: ["verification://full-fix"],
      },
    }, deps)).resolves.toMatchObject({ state: "candidate-advanced" });
  });

  it("requires the durable Candidate response record before consuming fix authority", async () => {
    const records = fixture();
    const { deps } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });
    deps.dispositionStore.readDispositionRecord = async () => null;

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps)).rejects.toThrow(
      "a verified fix requires its exact approved response record",
    );
  });

  it("appends the approved response and its delta evidence to the Candidate record", async () => {
    const records = fixture();
    const { deps, record, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });
    const request = verifiedFixRequest(records);
    const recordResponsePerformance = vi.fn(async () => undefined);
    deps.recordResponsePerformance = recordResponsePerformance;

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-advanced",
      nextAction: "continue-review",
      payload: {
        operationId: records.operation.operationId,
        candidateId: record.attestation.candidateId,
        recordPath: CANDIDATE_RECORD_PATH,
        implementationChanged: true,
      },
    });

    expect(appends).toHaveLength(1);
    const [response] = appends[0] === undefined ? [] : candidateReviewResponses(appends[0].record);
    expect(response).toMatchObject({
      candidateId: record.attestation.candidateId,
      dispositionId: request.dispositions.dispositionSet.dispositionSetId,
      approvedBy: records.authority.authorIdentity,
      appliedBy: records.authority.runtimeIdentity,
      applicability: "focused",
      verificationEvidenceRefs: ["verification://focused-fix"],
      implementationChanged: true,
      oldTarget: { revision: records.target.headSha },
      newTarget: { revision: objectId("e") },
    });
    expect(recordResponsePerformance).toHaveBeenCalledWith({
      lane: "standard",
      repositoryId: records.target.repositoryId,
      headSha: records.target.headSha,
      lineage: records.operation.lineage,
      attemptId: records.operation.operationId,
      dispositionSetId: request.dispositions.dispositionSet.dispositionSetId,
      producedHeadSha: objectId("e"),
    });
  });

  it("keeps the durable captured pass through verified fix and exact replay despite fresh policy input", async () => {
    const records = fixture();
    const current = {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    };
    const { deps, appends } = lineageDependencies(records, current);
    const request = verifiedFixRequest(records);
    const authorizationId = digest("approved-next-pass");
    const durable = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
    if (durable === null) throw new Error("expected approved response fixture");
    const approvedPolicyRequest = {
      ...request.policyRequest,
      ceilingOverride: {
        target: request.policyRequest.target,
        lane: "standard" as const,
        exhaustedPassCount: 1,
        nextPass: 2,
        conditionalPassAuthorizationId: authorizationId,
      },
    };
    const approvedRecord = ApprovedDispositionRecordSchema.parse({
      ...durable,
      approvedDispositionLineage: durable.approvedDispositionLineage.map((node) => ({
        ...node,
        responsePolicyRequest: approvedPolicyRequest,
      })),
    });
    deps.dispositionStore.readDispositionRecord = async () => approvedRecord;

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-advanced",
      nextAction: "continue-review",
      payload: {
        conditionalPassAuthorizationId: authorizationId,
        policyRequest: approvedPolicyRequest,
      },
    });
    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("expected advanced Candidate fixture");
    deps.readCandidateLineage = async () => candidateLineageBinding(records, advanced, current);

    await expect(respondToReviewCommand({
      ...request,
      policyRequest: { ...request.policyRequest, frontlineActive: true },
    }, deps)).resolves.toMatchObject({
      state: "candidate-current",
      payload: {
        conditionalPassAuthorizationId: authorizationId,
        policyRequest: approvedPolicyRequest,
      },
    });
  });

  it("uses Candidate lineage when a Candidate-bound delivery-member target confirms unchanged", async () => {
    const records = fixture(memberVehicle);
    const { deps, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });
    deps.confirmTarget = async (target) => ({ state: "current", target });

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps)).resolves.toMatchObject({
      state: "candidate-advanced",
      nextAction: "continue-review",
    });
    expect(appends).toHaveLength(1);
    expect(candidateReviewResponses(appends[0]?.record ?? candidateRecord())[0]).toMatchObject({
      oldTarget: { revision: records.target.headSha },
      newTarget: { revision: objectId("e") },
      applicability: "focused",
      verificationEvidenceRefs: ["verification://focused-fix"],
    });
  });

  it("leaves the advanced lineage awaiting one converged focused attestation", async () => {
    const records = fixture();
    const current = { revision: objectId("e"), subject: candidateSubject("fixed") };
    const { deps, appends } = lineageDependencies(records, current);

    await respondToReviewCommand(verifiedFixRequest(records), deps);

    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("expected an appended Candidate record");
    expect(projectCandidateCurrentness({ record: advanced, current })).toMatchObject({
      status: "current",
      implementationChanged: true,
      convergenceVerification: "pending",
      convergenceScope: "focused",
    });
  });

  it("records operational-only approved evidence when the lineage subject is unchanged", async () => {
    const records = fixture();
    const { deps, record, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("root"),
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps)).resolves.toMatchObject({
      state: "candidate-advanced",
      nextAction: "continue-review",
      payload: {
        candidateId: record.attestation.candidateId,
        implementationChanged: false,
      },
    });
    expect(appends).toHaveLength(1);
    expect(appends[0]).toMatchObject({
      workUnit: "example",
      expectedRecordVersion: canonicalDigest(record),
      record: {
        subject: record.subject,
        transitions: [expect.objectContaining({ implementationChanged: false })],
      },
    });
  });

  it("returns the current Candidate when an identical verified response is replayed", async () => {
    const records = fixture();
    const current = {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    };
    const { deps, appends } = lineageDependencies(records, current);
    const request = verifiedFixRequest(records);

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-advanced",
    });
    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("expected an appended Candidate record");
    deps.readCandidateLineage = async () => candidateLineageBinding(records, advanced, current);

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-current",
      nextAction: "continue-review",
      payload: { candidateId: advanced.attestation.candidateId },
    });
    expect(appends).toHaveLength(1);
  });

  it.each([
    ["applicability", { applicability: "full" as const }],
    ["verification evidence", { verificationEvidenceRefs: ["verification://different"] }],
  ])("rejects a Candidate response replay with conflicting %s", async (_label, verifiedFixPatch) => {
    const records = fixture();
    const current = { revision: objectId("e"), subject: candidateSubject("fixed") };
    const { deps, appends } = lineageDependencies(records, current);
    const request = verifiedFixRequest(records);
    await respondToReviewCommand(request, deps);
    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("expected an appended Candidate record");
    deps.readCandidateLineage = async () => candidateLineageBinding(records, advanced, current);

    await expect(respondToReviewCommand({
      ...request,
      verifiedFix: { ...request.verifiedFix, ...verifiedFixPatch },
    }, deps)).rejects.toThrow("replay conflicts");
  });

  it("rejects a Candidate response replay whose recorded review target moved", async () => {
    const records = fixture();
    const current = { revision: objectId("e"), subject: candidateSubject("fixed") };
    const { deps, appends } = lineageDependencies(records, current);
    const request = verifiedFixRequest(records);
    await respondToReviewCommand(request, deps);
    const advanced = appends[0]?.record;
    const response = advanced === undefined ? undefined : candidateReviewResponses(advanced)[0];
    if (advanced === undefined || response === undefined) {
      throw new Error("expected an appended Candidate response");
    }
    const conflictingResponse = createCandidateReviewResponseEvidence({
      candidateId: response.candidateId,
      oldTarget: { ...response.oldTarget, revision: objectId("9") },
      newTarget: response.newTarget,
      dispositionId: response.dispositionId,
      approvedBy: response.approvedBy,
      appliedBy: response.appliedBy,
      applicability: response.applicability,
      verificationEvidenceRefs: response.verificationEvidenceRefs,
      implementationChanged: response.implementationChanged,
    });
    const conflicting = {
      ...advanced,
      transitions: [conflictingResponse],
    };
    deps.readCandidateLineage = async () => candidateLineageBinding(records, conflicting, current);

    await expect(respondToReviewCommand(request, deps)).rejects.toThrow("replay conflicts");
  });

  it("rejects an earlier response replay after a later response advances the Candidate again", async () => {
    const records = fixture();
    const firstCurrent = { revision: objectId("e"), subject: candidateSubject("fixed") };
    const { deps, appends } = lineageDependencies(records, firstCurrent);
    const request = verifiedFixRequest(records);
    await respondToReviewCommand(request, deps);
    const first = appends[0]?.record;
    const firstResponse = first === undefined ? undefined : candidateReviewResponses(first)[0];
    if (first === undefined || firstResponse === undefined) {
      throw new Error("expected the first Candidate response");
    }
    const laterCurrent = { revision: objectId("f"), subject: candidateSubject("later-fix") };
    const laterResponse = createCandidateReviewResponseEvidence({
      candidateId: firstResponse.candidateId,
      oldTarget: firstResponse.newTarget,
      newTarget: laterCurrent,
      dispositionId: digest("later-disposition"),
      approvedBy: firstResponse.approvedBy,
      appliedBy: firstResponse.appliedBy,
      applicability: "focused",
      verificationEvidenceRefs: ["verification://later-fix"],
      implementationChanged: true,
    });
    const advancedAgain = { ...first, transitions: [...first.transitions, laterResponse] };
    deps.readCandidateLineage = async () => candidateLineageBinding(records, advancedAgain, laterCurrent);

    await expect(respondToReviewCommand(request, deps)).rejects.toThrow("replay conflicts");
  });

  it("repairs staging when the Candidate record write succeeded before git add failed", async () => {
    const records = fixture();
    const current = { revision: objectId("e"), subject: candidateSubject("fixed") };
    const { deps, record } = lineageDependencies(records, current);
    let persisted = record;
    deps.readCandidateLineage = async () => candidateLineageBinding(records, persisted, current);
    deps.appendCandidateResponse = async ({ record: next }) => {
      persisted = next;
      throw new Error("git add failed after record write");
    };
    const stageCandidateResponse = vi.fn(async () => ({ recordPath: CANDIDATE_RECORD_PATH }));
    deps.stageCandidateResponse = stageCandidateResponse;
    const request = verifiedFixRequest(records);

    await expect(respondToReviewCommand(request, deps)).rejects.toThrow("git add failed");
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-current",
      payload: { recordPath: CANDIDATE_RECORD_PATH },
    });
    expect(stageCandidateResponse).toHaveBeenCalledWith("example");
  });

  it("refuses a verified fix whose exact target never changed", async () => {
    const records = fixture();
    const deps = dependencies(records);

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "ready-to-fix",
    });

    await expect(respondToReviewCommand(
      verifiedFixRequest(records),
      deps,
    )).rejects.toThrow("requires a changed exact target");
  });

  it.each(["proposal", "approval"] as const)(
    "refuses a local Errand %s after its live claim changes",
    async (stage) => {
      const records = fixture(errandVehicle);
      const deps = dependencies(records);
      deps.readCandidateLineage = async () => null;
      deps.resolveActiveErrand = async () => activeErrandBinding("claim-2");
      const request = stage === "proposal"
        ? {
            schemaVersion: 1,
            source: { kind: "attested-local", receiptRef: records.receiptRef },
            proposal: {
              proposedVerification: "focused",
              severityGatingPolicy: { minorGating: "record-only" },
              findings: [{
                findingId: records.finding.findingId,
                sourceVerification: "verified",
                verifiedSeverity: "major",
                verificationRefs: ["source:src/index.ts:7"],
                disposition: "fix",
                rationale: "The selected source supports this disposition.",
                recommendation: "Apply the fix.",
                openQuestions: [],
              }],
            },
          }
        : localRequest(records);

      await expect(respondToReviewCommand(request, deps))
        .rejects.toThrow("local review Errand claim does not match the active Errand");
    },
  );

  it("persists a verified fix for the exact active Errand without Candidate lineage", async () => {
    const records = fixture(errandVehicle);
    const { deps, moveTo } = movingCheckout(records);
    deps.readCandidateLineage = async () => null;
    Object.assign(deps, {
      resolveActiveErrand: async () => activeErrandBinding(),
    });

    await expect(respondToReviewCommand(localRequest(records), deps))
      .resolves.toMatchObject({ state: "ready-to-fix" });
    moveTo(settledHead(records.target.repositoryId, objectId("e"), objectId("f")));

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .resolves.toMatchObject({
        state: "errand-advanced",
        nextAction: "continue-review",
        payload: {
          operationId: records.operation.operationId,
          dispositionRecordRef: "git-common:review-gate/evidence/disposition.json",
        },
      });
  });

  it("retains the exact hosted change request on a verified Errand fix", async () => {
    const hosted = hostedResponseFixture("review-thread");
    const attempt = hosted.operation.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("missing hosted attempt fixture");
    const { deps, moveTo } = movingCheckout(hosted.records);
    deps.resultReader.readResult = async () => hostedResult(hosted);
    deps.readCandidateLineage = async () => null;
    deps.resolveActiveErrand = async () => activeErrandBinding();
    const appended: ApprovedDispositionRecord[] = [];
    const appendDispositionRecord = deps.dispositionStore.appendDispositionRecord;
    deps.dispositionStore.appendDispositionRecord = async (record) => {
      appended.push(record);
      return appendDispositionRecord(record);
    };
    const request = {
      schemaVersion: 1 as const,
      source: { kind: "hosted" as const, attemptRef: hosted.attemptRef },
      policyRequest: policyRequest(hosted.records, {
        sourceId: "codex-pr",
        reviewOperationId: attempt.attemptId,
        pullRequest: 42,
      }),
      dispositions: approved({
        targetId: hosted.records.target.targetId,
        producerId: attempt.attemptId,
        resultDigest: attempt.hosted.sealedResult!.hostedResultId,
        policyVersion: attempt.hosted.requirement.policyVersion,
        rubricVersion: attempt.hosted.requirement.rubricVersion,
        rubricDigest: attempt.hosted.requirement.rubricDigest,
        sourceIdentity: "codex-pr",
        finding: hosted.records.finding,
        proposedVerification: "focused",
      }),
    };
    await respondToReviewCommand(request, deps);
    const current = settledHead(hosted.records.target.repositoryId, objectId("e"), objectId("f"));
    moveTo(current);

    await expect(respondToReviewCommand({
      ...request,
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://focused-fix"],
      },
    }, deps)).resolves.toMatchObject({ state: "errand-advanced" });
    const appendedRecord = appended.at(-1);
    expect(appendedRecord === undefined
      ? null
      : currentApprovedDispositionNode(appendedRecord).errandFixResponse).toMatchObject({
      oldTarget: { targetId: hosted.records.target.targetId },
      newTarget: { targetId: current.targetId },
      hostedTarget: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: hosted.records.target.headSha,
      },
    });
  });

  it("replays the exact verified Errand response without consuming its authorization twice", async () => {
    const records = fixture(errandVehicle);
    const { deps, moveTo } = movingCheckout(records);
    deps.readCandidateLineage = async () => null;
    Object.assign(deps, {
      resolveActiveErrand: async () => activeErrandBinding(),
    });
    await respondToReviewCommand(localRequest(records), deps);
    moveTo(settledHead(records.target.repositoryId, objectId("e"), objectId("f")));

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .resolves.toMatchObject({ state: "errand-advanced" });
    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .resolves.toMatchObject({ state: "errand-current", nextAction: "continue-review" });
  });

  it("refuses a conflicting verified Errand response replay", async () => {
    const records = fixture(errandVehicle);
    const { deps, moveTo } = movingCheckout(records);
    deps.readCandidateLineage = async () => null;
    deps.resolveActiveErrand = async () => activeErrandBinding();
    await respondToReviewCommand(localRequest(records), deps);
    moveTo(settledHead(records.target.repositoryId, objectId("e"), objectId("f")));
    await respondToReviewCommand(verifiedFixRequest(records), deps);

    await expect(respondToReviewCommand({
      ...verifiedFixRequest(records),
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://different-fix"],
      },
    }, deps)).rejects.toThrow("Errand response replay conflicts");
  });

  it("refuses a verified fix after the active Errand claim changes", async () => {
    const records = fixture(errandVehicle);
    const { deps, moveTo } = movingCheckout(records);
    deps.readCandidateLineage = async () => null;
    let active = activeErrandBinding();
    Object.assign(deps, { resolveActiveErrand: async () => active });
    await respondToReviewCommand(localRequest(records), deps);
    active = { ...active, claimId: "claim-2" };
    moveTo(settledHead(records.target.repositoryId, objectId("e"), objectId("f")));

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .rejects.toThrow("local review Errand claim does not match the active Errand");
  });

  it("refuses a verified fix the index does not carry, rather than advancing a lineage without it", async () => {
    const records = fixture();
    const { deps, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });
    const lineage = await deps.readCandidateLineage(records.target);
    if (lineage === null) throw new Error("expected a bound Candidate lineage");
    deps.readCandidateLineage = async () => ({
      ...lineage,
      unstagedReviewablePaths: ["packages/arc-framework/src/fixed.ts"],
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .rejects.toThrow("packages/arc-framework/src/fixed.ts");
    expect(appends).toHaveLength(0);
  });

  it("refuses an unstaged fix the recorded subject already matches, rather than reporting it current", async () => {
    const records = fixture();
    const { deps, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("root"),
    });
    const lineage = await deps.readCandidateLineage(records.target);
    if (lineage === null) throw new Error("expected a bound Candidate lineage");
    deps.readCandidateLineage = async () => ({
      ...lineage,
      unstagedReviewablePaths: ["packages/arc-framework/src/fixed.ts"],
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .rejects.toThrow("must be staged");
    expect(appends).toHaveLength(0);
  });

  it("refuses a verified fix whose dispositions differ from the durable approval", async () => {
    const records = fixture();
    const { deps, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records, "defer"), deps))
      .rejects.toThrow("requires its exact approved response record");
    expect(appends).toHaveLength(0);
  });
});

/** The head an approved set's landed fixes settled at, which is what the replay pins. */
function settledHead(repositoryId: string, headSha: string, headTree: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId,
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha,
    headTree,
  });
}

/** Bind respond to a checkout whose current target the test moves between passes. */
function movingCheckout(records: ReturnType<typeof fixture>) {
  const deps = dependencies(records);
  let current: ReturnType<typeof settledHead> | null = null;
  return {
    deps: {
      ...deps,
      confirmTarget: async (target: typeof records.target) => (current === null
        ? { state: "current" as const, target }
        : { state: "stale-target" as const, attemptedTarget: target, currentTarget: current }),
    },
    moveTo: (target: ReturnType<typeof settledHead> | null) => {
      current = target;
    },
  };
}

describe("approved-settlement replay", () => {
  it("replays a durably approved conditional pass without approval-time consent fields", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const base = policyRequest(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    const request = {
      ...localRequest(records, "defer"),
      policyRequest: {
        ...base,
        ceilingOverride: {
          target: base.target,
          lane: base.lane,
          exhaustedPassCount: 1,
          nextPass: 2,
        },
      },
      conditionalNextPassAuthorization: {
        authorizedBy: records.authority.authorIdentity,
        exhaustedPassCount: 1,
        nextPass: 2,
      },
    };
    const approved = await respondToReviewCommand(request, deps);
    if (approved.state !== "settled") throw new Error("expected approved response");
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({
      ...localRequest(records, "defer"),
      policyRequest: approved.payload.policyRequest,
      settledFixTarget,
    }, deps)).resolves.toMatchObject({ state: "already-settled", nextAction: "reduce" });
  });

  it("does not settle a fix approval from head movement alone", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));

    await expect(respondToReviewCommand(localRequest(records), deps))
      .resolves.toMatchObject({ state: "ready-to-fix" });
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .resolves.toMatchObject({
        state: "fix-not-performed",
        nextAction: "complete-verified-fix",
        payload: { operationId: records.operation.operationId },
      });
  });

  it("settles a fix approval after its exact verified Errand response", async () => {
    const records = fixture(errandVehicle);
    const { deps, moveTo } = movingCheckout(records);
    deps.readCandidateLineage = async () => null;
    deps.resolveActiveErrand = async () => activeErrandBinding();
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    await respondToReviewCommand(localRequest(records), deps);
    moveTo(settledFixTarget);
    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .resolves.toMatchObject({ state: "errand-advanced" });
    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .resolves.toMatchObject({ state: "already-settled", nextAction: "reduce" });
  });

  it("repeats without deciding anything a second time", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    await respondToReviewCommand(localRequest(records, "defer"), deps);
    moveTo(settledFixTarget);

    const replay = { ...localRequest(records, "defer"), settledFixTarget };
    const first = await respondToReviewCommand(replay, deps);
    await expect(respondToReviewCommand(replay, deps)).resolves.toEqual(first);
  });

  it("refuses when the checkout no longer carries the settled head", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    await respondToReviewCommand(localRequest(records), deps);
    moveTo(settledHead(records.target.repositoryId, objectId("9"), objectId("8")));

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .resolves.toMatchObject({
        state: "stale-target",
        nextAction: "prepare-current-target",
        payload: { attemptedTarget: { targetId: settledFixTarget.targetId } },
      });
  });

  it("refuses a replay no durable approved record backs, under its own typed state", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .resolves.toMatchObject({ state: "missing-record", nextAction: "respond-again" });
  });

  it("returns a replay's actor mismatch as typed state rather than throwing", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({
      ...localRequest(records),
      dispositions: foreignApproval(records),
      settledFixTarget,
    }, deps)).resolves.toMatchObject({
      state: "actor-mismatch",
      nextAction: "respond-again",
      payload: { actor: "approver" },
    });
  });

  it("still throws the same mismatch on the attended response path", async () => {
    // Only the unattended replay needs typed state; an attended caller reads the exception.
    const records = fixture();
    const { deps } = movingCheckout(records);

    await expect(respondToReviewCommand({
      ...localRequest(records),
      dispositions: foreignApproval(records),
    }, deps)).rejects.toThrow("approver is not the active local identity");
  });

  it("refuses a replay whose dispositions disagree with the durable record", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    await expect(respondToReviewCommand(localRequest(records, "defer"), deps))
      .resolves.toMatchObject({ state: "settled" });
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .rejects.toThrow("conflicting approved disposition record");
  });

  it("refuses a replay that also submits a verified fix", async () => {
    const records = fixture();
    const { deps } = movingCheckout(records);

    await expect(respondToReviewCommand({
      ...verifiedFixRequest(records),
      settledFixTarget: settledHead(records.target.repositoryId, objectId("e"), objectId("f")),
    }, deps)).rejects.toThrow();
  });
});
