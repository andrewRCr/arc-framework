import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { ApprovedDispositionRecordSchema } from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { resumeLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-resume-command.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);
const receiptRef = (operationId: string, durableRef: string) => bindReviewSourceReference({
  kind: "attested-local",
  operationId,
  durableRef,
});
const withSourceLock = async <T>(action: () => Promise<T>): Promise<T> => action();

function fixture() {
  const target = createReviewTarget({
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
  if (requirement === null) throw new Error("expected local requirement");
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority: {
      vehicle: { kind: "work-unit", identity: "review-surface-binding" },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
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
    vehicle: admission.authority.vehicle,
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requestId: admission.carrier.request.requestId,
    policyVersion: requirement.policyVersion,
    policyBindingDigest: admission.policyBindingDigest,
    attestationRuntimeKind: admission.authority.attestationRuntimeKind,
    sourceRef: "source.json",
    sourceDigest: source.sourceDigest,
    guidanceDigest: digest("guidance"),
    target,
    requirement,
    request: admission.carrier.request,
    attestation: admission.carrier.attestation,
    cleanupTtlMs: 60_000,
  };
  const receipt = createLocalReviewReceipt({
    target,
    requirement,
    carrier: admission.carrier,
    result: {
      status: "complete",
      result: "clean",
      targetId: target.targetId,
      headSha: target.headSha,
      headTree: target.headTree,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      sourceDigest: source.sourceDigest,
      guidanceDigest: operation.guidanceDigest,
      evaluatorIdentity: admission.authority.evaluatorIdentity,
      reviewRunId: "run-1",
      applicabilityId: null,
      findings: [],
    },
    runtimeIdentity: admission.authority.runtimeIdentity,
    attestationMechanism: admission.authority.attestationMechanism,
    sourceDigest: source.sourceDigest,
    guidanceDigest: operation.guidanceDigest,
  });
  return { operation, receipt, source };
}

describe("local resume command", () => {
  it("repairs a live receipt-less source and returns suspended", async () => {
    const records = fixture();
    const materialize = vi.fn(async () => ({ reviewRoot: records.source.materializationRef }));

    await expect(resumeLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, {
      sweep: vi.fn(),
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        appendReceipt: vi.fn(),
      },
      dispositionStore: {
        readDispositionRecord: vi.fn(),
        appendDispositionRecord: vi.fn(),
      },
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      materialize,
      now: () => "2026-07-23T17:00:30Z",
    })).resolves.toMatchObject({
      state: "suspended",
      nextAction: "wait",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        currentTarget: records.operation.target,
      },
    });
    expect(materialize).toHaveBeenCalledWith(records.source);
  });

  it("returns expired without restoring a receipt-less source after its cleanup bound", async () => {
    const records = fixture();
    const materialize = vi.fn();

    await expect(resumeLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, {
      sweep: vi.fn(),
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        appendReceipt: vi.fn(),
      },
      dispositionStore: {
        readDispositionRecord: vi.fn(),
        appendDispositionRecord: vi.fn(),
      },
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      materialize,
      now: () => "2026-07-23T17:01:00Z",
    })).resolves.toMatchObject({
      state: "expired",
      nextAction: "rerun-review",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        currentTarget: records.operation.target,
      },
    });
    expect(materialize).not.toHaveBeenCalled();
  });

  it("returns stale-target before reading source-side publications", async () => {
    const records = fixture();
    const currentTarget = createReviewTarget({
      schemaVersion: records.operation.target.schemaVersion,
      semanticsVersion: records.operation.target.semanticsVersion,
      kind: records.operation.target.kind,
      repositoryId: records.operation.target.repositoryId,
      baseRef: records.operation.target.baseRef,
      diffBaseSha: records.operation.target.diffBaseSha,
      diffBaseTree: records.operation.target.diffBaseTree,
      headSha: objectId("e"),
      headTree: objectId("f"),
    });
    const readSource = vi.fn();
    const readReceipts = vi.fn();

    await expect(resumeLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, {
      sweep: vi.fn(),
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: { readSource, appendSource: vi.fn() },
      receiptStore: { readReceipts, appendReceipt: vi.fn() },
      dispositionStore: {
        readDispositionRecord: vi.fn(),
        appendDispositionRecord: vi.fn(),
      },
      confirmTarget: async () => ({
        state: "stale-target",
        attemptedTarget: records.operation.target,
        currentTarget,
      }),
      materialize: vi.fn(),
      now: () => "2026-07-23T17:00:30Z",
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        attemptedTarget: records.operation.target,
        currentTarget,
      },
    });
    expect(readSource).not.toHaveBeenCalled();
    expect(readReceipts).not.toHaveBeenCalled();
  });

  it("replays a clean receipt reference and returns review-complete", async () => {
    const records = fixture();
    const appendReceipt = vi.fn(async () => ({
      ledgerVersion: 1,
      durableEvidenceRef: "receipts-v2.json#1",
    }));

    await expect(resumeLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, {
      sweep: vi.fn(),
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 1, receipts: [records.receipt] }),
        appendReceipt,
      },
      dispositionStore: {
        readDispositionRecord: vi.fn(),
        appendDispositionRecord: vi.fn(),
      },
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      materialize: vi.fn(),
      now: () => "2026-07-23T18:00:00Z",
    })).resolves.toMatchObject({
      state: "review-complete",
      nextAction: "reduce",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        currentTarget: records.operation.target,
        receiptRef: receiptRef(records.operation.operationId, "receipts-v2.json#1"),
      },
    });
    expect(appendReceipt).toHaveBeenCalledWith(records.receipt, 1);
  });

  it("rejects multiple terminal receipts for one local operation", async () => {
    const records = fixture();
    const appendReceipt = vi.fn();

    await expect(resumeLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, {
      sweep: vi.fn(),
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({
          ledgerVersion: 2,
          receipts: [records.receipt, records.receipt],
        }),
        appendReceipt,
      },
      dispositionStore: {
        readDispositionRecord: vi.fn(),
        appendDispositionRecord: vi.fn(),
      },
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      materialize: vi.fn(),
      now: () => "2026-07-23T18:00:00Z",
    })).rejects.toMatchObject({
      code: "corrupt-state",
      message: "local review operation has multiple terminal receipts",
    });
    expect(appendReceipt).not.toHaveBeenCalled();
  });

  it("returns the exact local response plan for undispositioned findings", async () => {
    const records = fixture();
    const finding = {
      findingId: "finding-1",
      severity: "major" as const,
      locus: "src/index.ts:7",
      evidenceUrlOrId: "review:finding-1",
    };
    const receipt = createLocalReviewReceipt({
      target: records.operation.target,
      requirement: records.operation.requirement,
      carrier: {
        target: records.operation.target,
        request: records.operation.request,
        attestation: records.operation.attestation,
      },
      result: {
        status: "complete",
        result: "findings",
        targetId: records.operation.targetId,
        headSha: records.operation.target.headSha,
        headTree: records.operation.target.headTree,
        rubricVersion: records.operation.requirement.rubricVersion,
        rubricDigest: records.operation.requirement.rubricDigest,
        sourceDigest: records.operation.sourceDigest,
        guidanceDigest: records.operation.guidanceDigest,
        evaluatorIdentity: records.operation.request.evaluatorIdentity,
        reviewRunId: "run-findings",
        applicabilityId: null,
        findings: [finding],
      },
      runtimeIdentity: records.operation.attestation.runtimeIdentity,
      attestationMechanism: records.operation.attestation.mechanism,
      sourceDigest: records.operation.sourceDigest,
      guidanceDigest: records.operation.guidanceDigest,
    });

    await expect(resumeLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, {
      sweep: vi.fn(),
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 1, receipts: [receipt] }),
        appendReceipt: async () => ({
          ledgerVersion: 1,
          durableEvidenceRef: "receipts-v2.json#1",
        }),
      },
      dispositionStore: {
        readDispositionRecord: async () => null,
        appendDispositionRecord: vi.fn(),
      },
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      materialize: vi.fn(),
      now: () => "2026-07-23T18:00:00Z",
    })).resolves.toMatchObject({
      state: "respond-to-findings",
      nextAction: "respond",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        currentTarget: records.operation.target,
        receiptRef: receiptRef(records.operation.operationId, "receipts-v2.json#1"),
        responsePlan: {
          schemaVersion: 1,
          target: records.operation.target,
          source: {
            kind: "attested-local",
            receiptRef: receiptRef(records.operation.operationId, "receipts-v2.json#1"),
          },
          findings: [finding],
        },
      },
    });
  });

  it("returns review-complete when findings have an exact approved disposition record", async () => {
    const records = fixture();
    const finding = {
      findingId: "finding-1",
      severity: "major" as const,
      locus: "src/index.ts:7",
      evidenceUrlOrId: "review:finding-1",
    };
    const receipt = createLocalReviewReceipt({
      target: records.operation.target,
      requirement: records.operation.requirement,
      carrier: {
        target: records.operation.target,
        request: records.operation.request,
        attestation: records.operation.attestation,
      },
      result: {
        status: "complete",
        result: "findings",
        targetId: records.operation.targetId,
        headSha: records.operation.target.headSha,
        headTree: records.operation.target.headTree,
        rubricVersion: records.operation.requirement.rubricVersion,
        rubricDigest: records.operation.requirement.rubricDigest,
        sourceDigest: records.operation.sourceDigest,
        guidanceDigest: records.operation.guidanceDigest,
        evaluatorIdentity: records.operation.request.evaluatorIdentity,
        reviewRunId: "run-findings",
        applicabilityId: null,
        findings: [finding],
      },
      runtimeIdentity: records.operation.attestation.runtimeIdentity,
      attestationMechanism: records.operation.attestation.mechanism,
      sourceDigest: records.operation.sourceDigest,
      guidanceDigest: records.operation.guidanceDigest,
    });
    const dispositionSet = createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: records.operation.targetId,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      proposedBy: records.operation.attestation.runtimeIdentity,
      findings: [{
        findingId: finding.findingId,
        severity: finding.severity,
        locus: finding.locus,
        sourceIdentity: records.operation.request.evaluatorIdentity,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        disposition: "reject",
        rationale: "The proposed disposition matches the reviewed source.",
        recommendation: "Retain the target and record the rejection.",
        openQuestions: [],
      }],
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(dispositionSet),
      approvedBy: "author-1",
      approvedAt: "2026-07-23T17:30:00Z",
    });
    const disposition = ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: records.operation.repositoryId,
      operationId: records.operation.operationId,
      source: {
        kind: "attested-local",
        receiptRef: receiptRef(records.operation.operationId, "receipts-v2.json#1"),
        localSourceRef: records.operation.sourceRef,
      },
      approvedDisposition,
      fixAuthorization: null,
    });

    await expect(resumeLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, {
      sweep: vi.fn(),
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 1, receipts: [receipt] }),
        appendReceipt: async () => ({
          ledgerVersion: 1,
          durableEvidenceRef: "receipts-v2.json#1",
        }),
      },
      dispositionStore: {
        readDispositionRecord: async () => disposition,
        appendDispositionRecord: vi.fn(),
      },
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      materialize: vi.fn(),
      now: () => "2026-07-23T18:00:00Z",
    })).resolves.toMatchObject({
      state: "review-complete",
      nextAction: "reduce",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        currentTarget: records.operation.target,
        receiptRef: receiptRef(records.operation.operationId, "receipts-v2.json#1"),
      },
    });
  });
});
