import { describe, expect, it } from "vitest";

import {
  createHostedHandleFixture,
  createHostedTerminalAttemptFixture,
} from "../../../../../fixtures/hosted-review.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { createFrontlineOutcomeRecord } from
  "../../../../../../src/scripts/review-gate/core/advisory-records.js";
import { createFrontlineAdmission } from
  "../../../../../../src/scripts/review-gate/core/frontline-admission.js";
import {
  createReviewReceipt,
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from
  "../../../../../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from
  "../../../../../../src/scripts/review-gate/core/local-review-source.js";
import {
  LaneProgressStateSchema,
  LocalReviewStateSchema,
  FrontlineRunStateSchema,
} from "../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type {
  ForwardReviewReceiptIndex,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewOperationStateSnapshotIndex,
} from "../../../../../../src/scripts/review-gate/core/ports.js";
import {
  LocalReviewResultReader,
} from "../../../../../../src/scripts/review-gate/hosts/local/review-result-reader.js";
import { projectLocalReviewGuidance } from
  "../../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import { normalizeFrontlineOutcome } from
  "../../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { reduceReviewRouting } from
  "../../../../../../src/scripts/review-gate/policy/routing.js";

const oid = (character: string): string => character.repeat(40);
const digest = (value: string): `sha256:${string}` => canonicalDigest({ value });

function localFixture() {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("a"),
    diffBaseTree: oid("b"),
    headSha: oid("c"),
    headTree: oid("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("rubric"),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected local review requirement");
  const lineage = { kind: "candidate" as const, candidateId: digest("candidate") };
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority: {
      vehicle: { kind: "work-unit", identity: "review-result-reader" },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
    laneSourceId: "delegated-agent",
    policyBindingDigest: digest("policy-binding"),
    requestMechanism: "local-attestation",
    lineage,
    logicalPass: 1,
    retryGeneration: 0,
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
    reachabilityRef: "refs/arc/review/local-result",
    materializationRef: "local-result-source",
  });
  const guidance = projectLocalReviewGuidance();
  const state = LocalReviewStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: admission.operationId,
    updatedAt: "2026-09-09T12:00:00Z",
    kind: "local-review",
    vehicle: admission.authority.vehicle,
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requestId: admission.carrier.request.requestId,
    laneSourceId: admission.laneSourceId,
    lineage,
    logicalPass: 1,
    retryGeneration: 0,
    policyVersion: requirement.policyVersion,
    policyBindingDigest: admission.policyBindingDigest,
    attestationRuntimeKind: admission.authority.attestationRuntimeKind,
    sourceRef: "git-common:review-gate/sources/local-result",
    sourceDigest: source.sourceDigest,
    guidance: guidance.projection,
    guidanceDigest: guidance.guidanceDigest,
    reviewerInstructions: guidance.reviewerInstructions,
    target,
    requirement,
    request: admission.carrier.request,
    attestation: admission.carrier.attestation,
    cleanupTtlMs: 86_400_000,
  });
  const receipt = createReviewReceipt({
    target,
    requirement,
    request: admission.carrier.request,
    applicabilityId: null,
    reviewRunId: "run-1",
    evaluatorIdentity: "evaluator-1",
    attestingRuntimeIdentity: "arc-cli/0.1.0",
    attestationMechanism: "local-attestation",
    providerEventIdentity: null,
    result: "findings",
    findings: [{
      findingId: "finding-1",
      severity: "major",
      locus: "src/index.ts:10",
      evidenceUrlOrId: "local:finding-1",
    }],
  });
  const lane = LaneProgressStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: "lane-progress-standard",
    updatedAt: "2026-09-09T12:01:00Z",
    kind: "lane-progress",
    lane: "standard",
    repositoryId: target.repositoryId,
    lineage,
    completedPasses: 1,
    attempts: [{
      attemptId: admission.operationId,
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: null,
      headSha: target.headSha,
      terminalProducer: true,
      sourceId: "delegated-agent",
      outcome: "findings",
      local: {
        operationId: admission.operationId,
        requestId: admission.carrier.request.requestId,
        vehicle: admission.authority.vehicle,
        target,
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
      },
    }],
  });
  return { target, requirement, source, state, receipt, lane };
}

function readerForLocalFixture(options: { exactReceiptMissing?: boolean } = {}) {
  const fixture = localFixture();
  const operationIndex: ReviewOperationStateSnapshotIndex = {
    readOperationSnapshot: async () => ({
      status: "complete",
      records: [
        { version: 1, state: fixture.state },
        { version: 2, state: fixture.lane },
      ],
    }),
  };
  const receiptIndex: ForwardReviewReceiptIndex = {
    readReceiptEntries: async () => [{
      receipt: fixture.receipt,
      durableEvidenceRef: "git-common:review-gate/evidence/receipts-v2.json#1",
    }],
    readReceiptReference: async () => options.exactReceiptMissing ? null : fixture.receipt,
  };
  const sourceStore: LocalReviewSourceStore = {
    readSource: async () => fixture.source,
    appendSource: async () => ({ sourceRef: fixture.state.sourceRef }),
  };
  const outcomeStore: FrontlineOutcomeStore = {
    readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
    appendOutcome: async () => { throw new Error("not used"); },
  };
  return {
    fixture,
    reader: new LocalReviewResultReader({ operationIndex, receiptIndex, sourceStore, outcomeStore }),
  };
}

function readerForFrontlineFixture() {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("a"),
    diffBaseTree: oid("b"),
    headSha: oid("c"),
    headTree: oid("d"),
  });
  const source = {
    sourceId: "review-cli",
    kind: "command" as const,
    executable: "reviewer",
    argv: ["--plain"],
  };
  const lineage = { kind: "candidate" as const, candidateId: digest("candidate") };
  const routingFacts = {
    schemaVersion: 1,
    changeSetState: "known",
    contentKind: "code-bearing",
    reviewRisk: "routine",
    changeDeterminacy: "ordinary",
    ownership: "self",
    surfaceAuthority: "ordinary",
    assurance: { workContext: "work-unit", workClass: "Light" },
    activity: { selfReview: true, frontlineReview: true },
  } as const;
  const admission = createFrontlineAdmission({
    lineage,
    target,
    routing: { facts: routingFacts, decision: reduceReviewRouting(routingFacts) },
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code"],
      source,
      maxPasses: 2,
      promptText: "Review the aggregate candidate.",
    },
    logicalPass: 1,
    retryGeneration: 0,
    maxPasses: 2,
  });
  const outcome = normalizeFrontlineOutcome({
    providerResult: { kind: "findings", findings: [{
      findingId: "frontline-finding",
      severity: "minor",
      locus: "src/frontline.ts:20",
      evidenceUrlOrId: "frontline:finding",
    }] },
    source,
    target,
    pass: 1,
    maxPasses: 2,
  });
  const outcomeRecord = createFrontlineOutcomeRecord({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: target.repositoryId,
    operationId: admission.operationId,
    sourceIdentity: source.sourceId,
    executableIdentity: { digest: digest("executable"), qualifiedVersion: "reviewer/1.0.0" },
    outcome,
  });
  const sourceBindingId = canonicalDigest({
    domain: "arc.review-gate.frontline-source-binding/v1",
    source,
  });
  const run = FrontlineRunStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: admission.operationId,
    updatedAt: "2026-09-09T12:00:00Z",
    kind: "frontline-run",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    sourceIdentity: source.sourceId,
    lineage,
    logicalPass: 1,
    retryGeneration: 0,
    outcome: "findings",
    policyVersion: admission.policyVersion,
    sourceBindingId,
  });
  const lane = LaneProgressStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: "lane-progress-frontline",
    updatedAt: "2026-09-09T12:01:00Z",
    kind: "lane-progress",
    lane: "frontline",
    repositoryId: target.repositoryId,
    lineage,
    completedPasses: 1,
    attempts: [{
      attemptId: admission.operationId,
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: null,
      headSha: target.headSha,
      terminalProducer: true,
      sourceId: source.sourceId,
      outcome: "findings",
      frontline: { admission, effectiveCoverage: "complete" },
    }],
  });
  const operationIndex: ReviewOperationStateSnapshotIndex = {
    readOperationSnapshot: async () => ({
      status: "complete",
      records: [{ version: 1, state: run }, { version: 2, state: lane }],
    }),
  };
  const outcomeStore: FrontlineOutcomeStore = {
    readOutcome: async () => ({
      version: 1,
      record: outcomeRecord,
      outcomeRef: "git-common:review-gate/outcomes/frontline.json#1",
    }),
    appendOutcome: async () => { throw new Error("not used"); },
  };
  const receiptIndex: ForwardReviewReceiptIndex = {
    readReceiptEntries: async () => [],
    readReceiptReference: async () => null,
  };
  const sourceStore: LocalReviewSourceStore = {
    readSource: async () => null,
    appendSource: async () => { throw new Error("not used"); },
  };
  return {
    admission,
    outcome,
    outcomeRecord,
    run,
    reader: new LocalReviewResultReader({ operationIndex, receiptIndex, sourceStore, outcomeStore }),
  };
}

function readerForHostedFixture() {
  const handle = createHostedHandleFixture();
  const terminal = createHostedTerminalAttemptFixture({
    admission: handle.admission,
    outcome: "findings",
    findings: [
      {
        findingId: "hosted-thread",
        origin: "review-thread",
        commentId: "comment-1",
        threadId: "thread-1",
        settlement: "reply-and-resolve",
        severity: "major",
        locus: "src/hosted.ts:10",
        url: "https://example.invalid/thread-1",
      },
      {
        findingId: "hosted-body",
        origin: "review-body",
        reviewId: "review-1",
        fingerprint: "body-1",
        settlement: "not-applicable",
        severity: "minor",
        locus: "src/hosted.ts:20",
        url: "https://example.invalid/review-1",
        body: "Consider simplifying this branch.",
      },
    ],
  });
  const lane = LaneProgressStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: "lane-progress-hosted",
    updatedAt: "2026-09-09T12:01:00Z",
    kind: "lane-progress",
    lane: "standard",
    repositoryId: handle.admission.repositoryId,
    lineage: handle.admission.lineage,
    completedPasses: 1,
    attempts: [{
      attemptId: terminal.attemptId,
      logicalPass: handle.admission.logicalPass,
      retryGeneration: 0,
      changeRequestId: `pull/${handle.target.pullRequest}`,
      headSha: handle.target.headSha,
      terminalProducer: true,
      sourceId: handle.provider,
      outcome: "findings",
      hosted: terminal.hosted,
    }],
  });
  const operationIndex: ReviewOperationStateSnapshotIndex = {
    readOperationSnapshot: async () => ({
      status: "complete",
      records: [{ version: 3, state: lane }],
    }),
  };
  const receiptIndex: ForwardReviewReceiptIndex = {
    readReceiptEntries: async () => [],
    readReceiptReference: async () => null,
  };
  const sourceStore: LocalReviewSourceStore = {
    readSource: async () => null,
    appendSource: async () => { throw new Error("not used"); },
  };
  const outcomeStore: FrontlineOutcomeStore = {
    readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
    appendOutcome: async () => { throw new Error("not used"); },
  };
  return {
    handle,
    terminal,
    lane,
    reader: new LocalReviewResultReader({ operationIndex, receiptIndex, sourceStore, outcomeStore }),
  };
}

describe("local review result reader", () => {
  it("resolves one exact local receipt with its immutable admission and content identity", async () => {
    const { fixture, reader } = readerForLocalFixture();

    await expect(reader.readResult(fixture.state.operationId)).resolves.toMatchObject({
      kind: "attested-local",
      producerId: fixture.state.operationId,
      repositoryId: fixture.target.repositoryId,
      target: fixture.target,
      sourceIdentity: fixture.state.request.evaluatorIdentity,
      originalOutcome: "findings",
      findings: fixture.receipt.findings,
      resultDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      receiptRef: "git-common:review-gate/evidence/receipts-v2.json#1",
      localSourceRef: fixture.state.sourceRef,
      admission: {
        lineage: fixture.state.lineage,
        logicalPass: 1,
        retryGeneration: 0,
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        policyVersion: fixture.requirement.policyVersion,
      },
    });
  });

  it("rejects a local ledger entry whose store-issued exact reference no longer resolves", async () => {
    const { fixture, reader } = readerForLocalFixture({ exactReceiptMissing: true });

    await expect(reader.readResult(fixture.state.operationId)).rejects.toMatchObject({
      code: "corrupt-result",
    });
  });

  it("resolves one exact frontline outcome with its admitted executable context", async () => {
    const fixture = readerForFrontlineFixture();

    await expect(fixture.reader.readResult(fixture.admission.operationId)).resolves.toMatchObject({
      kind: "frontline",
      producerId: fixture.admission.operationId,
      target: fixture.outcome.target,
      sourceIdentity: fixture.outcome.source.sourceId,
      originalOutcome: "findings",
      findings: fixture.outcome.findings,
      resultDigest: fixture.outcomeRecord.outcomeDigest,
      outcomeRef: "git-common:review-gate/outcomes/frontline.json#1",
      sourceBindingId: fixture.run.sourceBindingId,
      admission: {
        lineage: fixture.admission.lineage,
        logicalPass: 1,
        retryGeneration: 0,
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        policyVersion: fixture.admission.policyVersion,
      },
    });
  });

  it("resolves one unique hosted attempt from its sealed result snapshot", async () => {
    const fixture = readerForHostedFixture();

    await expect(fixture.reader.readResult(fixture.terminal.attemptId)).resolves.toMatchObject({
      kind: "hosted",
      producerId: fixture.terminal.attemptId,
      laneOperationId: fixture.lane.operationId,
      target: fixture.handle.admission.reviewTarget,
      sourceIdentity: fixture.handle.provider,
      originalOutcome: "findings",
      resultDigest: fixture.terminal.hosted.sealedResult?.hostedResultId,
      findings: [
        {
          findingId: "hosted-thread",
          severity: "major",
          locus: "src/hosted.ts:10",
          evidenceUrlOrId: "https://example.invalid/thread-1",
        },
        {
          findingId: "hosted-body",
          severity: "minor",
          locus: "src/hosted.ts:20",
          evidenceUrlOrId: "https://example.invalid/review-1",
        },
      ],
      admission: {
        lineage: fixture.handle.admission.lineage,
        logicalPass: fixture.handle.admission.logicalPass,
        retryGeneration: 0,
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        policyVersion: fixture.handle.admission.requirement.policyVersion,
      },
      hostSettlementFindingIds: ["hosted-thread"],
      noHostSettlementFindingIds: ["hosted-body"],
      settled: false,
    });
  });

  it("distinguishes a missing producer from corrupt stored content", async () => {
    const fixture = readerForHostedFixture();

    await expect(fixture.reader.readResult("hosted/missing")).rejects.toMatchObject({
      code: "missing-result",
    });
  });

  it("rejects a producer identity admitted by more than one native record", async () => {
    const fixture = readerForHostedFixture();
    const duplicateLane = LaneProgressStateSchema.parse({
      ...fixture.lane,
      operationId: "lane-progress-hosted-duplicate",
    });
    const operationIndex: ReviewOperationStateSnapshotIndex = {
      readOperationSnapshot: async () => ({
        status: "complete",
        records: [
          { version: 3, state: fixture.lane },
          { version: 1, state: duplicateLane },
        ],
      }),
    };
    const reader = new LocalReviewResultReader({
      operationIndex,
      receiptIndex: {
        readReceiptEntries: async () => [],
        readReceiptReference: async () => null,
      },
      sourceStore: {
        readSource: async () => null,
        appendSource: async () => { throw new Error("not used"); },
      },
      outcomeStore: {
        readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
        appendOutcome: async () => { throw new Error("not used"); },
      },
    });

    await expect(reader.readResult(fixture.terminal.attemptId)).rejects.toMatchObject({
      code: "ambiguous-result",
    });
  });
});
