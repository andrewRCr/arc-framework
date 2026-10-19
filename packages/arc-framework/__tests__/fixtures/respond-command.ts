/** Response command fixtures share exact producers and dependency boundaries across focused suites. */
import { provisionalPassFactsFixture } from "./provisional-pass-facts.js";

import { createHostedTerminalAttemptFixture } from "./hosted-review.js";

import {
  canonicalDigest,
  canonicalize,
  CanonicalDigestSchema,
  type CanonicalDigest,
} from "../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import {
  candidateReviewResponses,
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  ApprovedDispositionRecordSchema,
  currentApprovedDispositionNode,
  createFrontlineOutcomeRecord,
  ErrandReviewBindingSchema,
  type ApprovedDispositionRecord,
} from "../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../src/scripts/review-gate/core/dispositions.js";
import { createReviewRequirement, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  LaneSubjectLineageSchema,
  type LaneSubjectLineage,
} from "../../src/scripts/review-gate/core/lane-admission.js";
import { createFixAuthorization } from "../../src/scripts/review-gate/core/fix-authorization.js";
import { createLocalReviewAdmission } from "../../src/scripts/review-gate/core/local-operation.js";
import type { LocalReviewAuthority } from "../../src/scripts/review-gate/core/local-review-authority.js";
import { createLocalReviewSource } from "../../src/scripts/review-gate/core/local-review-source.js";
import {
  computeConditionalPassAuthorizationId,
  type FrontlineRunState,
  type LocalReviewState,
} from "../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";
import type { ReviewResult } from "../../src/scripts/review-gate/core/review-result.js";
import { projectHostedFinding } from "../../src/scripts/review-gate/hosted/await.js";
import { createHostedAdmission } from "../../src/scripts/review-gate/hosted/request.js";

import { projectLocalReviewGuidance } from "../../src/scripts/review-gate/policy/local-review-guidance.js";
import { CandidateBoundMemberFixAuthoringSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { normalizeFrontlineOutcome } from "../../src/scripts/review-gate/policy/frontline-outcome.js";
import { computeFrontlineSourceBindingId } from "../../src/scripts/review-gate/policy/frontline-operation.js";
import { type RespondCommandDependencies } from "../../src/scripts/review-gate/runtime/respond-command.js";
import { createLocalReviewReceipt } from "../../src/scripts/review-gate/runtime/local-attestation.js";

export const digest = (value: string) => canonicalDigest({ value });
export const objectId = (character: string): string => character.repeat(40);

export const DELIVERABLE_ID = CanonicalDigestSchema.parse(`sha256:${"a".repeat(64)}`);
export const memberVehicle = { kind: "delivery-member", identity: DELIVERABLE_ID } as const;
export const workUnitVehicle = { kind: "work-unit", identity: "review-surface-binding" } as const;
export const errandVehicle = { kind: "errand", identity: "repair-review-state", claimId: "claim-1" } as const;

export function activeErrandBinding(claimId = "claim-1") {
  return ErrandReviewBindingSchema.parse({
    key: "repair-review-state",
    claimId,
    branch: "chore/repair-review-state",
  });
}

export function fixture(
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

export function deliveryLocalFixture() {
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

export function approved(input: {
  targetId: CanonicalDigest;
  producerId: string;
  resultDigest: CanonicalDigest;
  policyVersion: CanonicalDigest;
  rubricVersion: string;
  rubricDigest: CanonicalDigest;
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

export function localResult(records: ReturnType<typeof fixture>): ReviewResult {
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

export function dependencies(records: ReturnType<typeof fixture>) {
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
    readCandidateResponseTarget: () => Promise.reject(new Error("unexpected historical Candidate read")),
    appendCandidateResponse: () => Promise.reject(new Error("unexpected Candidate append")),
    stageCandidateResponse: () => Promise.reject(new Error("unexpected Candidate stage")),
    rebindSingletonPublicationResponse: () => Promise.reject(new Error("unexpected publication rebind")),
    settleLaneFindings: async () => undefined,
    recordResponsePerformance: async (performance) => {
      responsePerformance = {
        schemaVersion: 1,
        producerId: performance.attemptId,
        dispositionSetId: performance.dispositionSetId,
        originatingHeadSha: performance.headSha,
        producedHeadSha: performance.producedHeadSha,
        ...(performance.candidateResponseId === undefined ? {} : { candidateResponseId: performance.candidateResponseId }),
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
            materialFix: true,
            coverageAdequate: true,
          },
          postResponseAction: "resolve-next-pass",
        },
      };
    },
    readConfiguredLanePolicy: async lane => ({ sources: lane === "frontline" ? ["coderabbit-cli"] : ["delegated-agent"], maxPasses: 2 }),
    readProvisionalPassFacts: async ({ result, configuredMaxPasses, configuredSources }) => provisionalPassFactsFixture({ completePasses: result.admission.logicalPass - Number(result.admission.effectiveCoverage !== "complete"),
      ceiling: configuredMaxPasses, chainAdequate: result.admission.effectiveCoverage === "complete", delegatedAgentSelectable: configuredSources.includes("delegated-agent") }),
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

export const CANDIDATE_RECORD_PATH = ".arc/system/.internal/candidates/example.json";

export function candidateSubject(source: string) {
  return createCandidateSubjectSnapshot([
    { path: "src/index.ts", mode: "100644", digest: canonicalDigest({ source }), treatment: "reviewable" },
  ]);
}

export function candidateRecord(): CandidateManagedRecordV1 {
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

export function effectiveCurrent(
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

export function effectiveChanged(
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

export function candidateLineageBinding(
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
    reviewed: effectiveCurrent(record, { revision: records.target.headSha,
      subject: candidateReviewResponses(record).find(({ oldTarget }) => oldTarget.revision === records.target.headSha)
        ?.oldTarget.subject ?? baseline.target.subject }),
    effective: effectiveCurrent(record, current),
    current,
    candidateFixTarget,
    unstagedReviewablePaths: [],
  };
}

/** Bind respond to a Candidate lineage and the head movement a landed fix produces. */
export function lineageDependencies(
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
  const rebinds: Parameters<RespondCommandDependencies["rebindSingletonPublicationResponse"]>[0][] = [];
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
    readCandidateResponseTarget: async () => current,
    appendCandidateResponse: async (input) => {
      appends.push(input);
      return { recordPath: CANDIDATE_RECORD_PATH };
    },
    stageCandidateResponse: async () => ({ recordPath: CANDIDATE_RECORD_PATH }),
    rebindSingletonPublicationResponse: async (input) => { rebinds.push(input); },
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
  return { deps, record, appends, rebinds };
}

export function verifiedFixRequest(records: ReturnType<typeof fixture>, disposition: "fix" | "defer" = "fix") {
  return {
    ...localRequest(records, disposition),
    verifiedFix: {
      applicability: "focused" as const,
      verificationEvidenceRefs: ["verification://focused-fix"],
    },
  };
}

export function localRequest(
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

export function policyRequest(
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

export function hostedResponseFixture(
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

export function hostedResult(input: ReturnType<typeof hostedResponseFixture>): ReviewResult {
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

/** A frontline findings outcome for one fixture's finding, with the operation that produced it. */
export function frontlineFixture(records: ReturnType<typeof fixture>, maxPasses = 2) {
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
    maxPasses,
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
  return { source, record, durableRef, outcomeRef, operation };
}

/** The same approved set, approved by an identity that is not the active local one. */
export function foreignApproval(records: ReturnType<typeof fixture>) {
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

export function frontlineResult(input: {
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
