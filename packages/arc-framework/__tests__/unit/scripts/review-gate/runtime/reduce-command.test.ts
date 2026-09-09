import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  createFrontlineOutcomeRecord,
  type ApprovedDispositionRecord,
  type FrontlineOutcomeRecord,
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
import type {
  ReviewReceiptV2,
  ReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type {
  FrontlineRunState,
  LocalReviewState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { ReduceEnvelopeSchema } from "../../../../../src/scripts/review-gate/core/review-command-envelope.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { projectLocalReviewGuidance } from
  "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import {
  DurableReviewReductionPort,
  reduceReviewCommand,
  type ReduceCommandDependencies,
  type ReviewReductionAdapterDependencies,
} from "../../../../../src/scripts/review-gate/runtime/reduce-command.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";

const digest = (value: string): `sha256:${string}` => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);
const durableReceiptRef = "git-common:review-gate/evidence/receipts-v2.json#1";
const durableOutcomeRef = "git-common:review-gate/outcomes/frontline.json#1";

function localFixture(result: "clean" | "findings" | "failed" | "unavailable" = "clean") {
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
  if (requirement === null) throw new Error("expected requirement");
  const authority = {
    vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
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
    lineage: { kind: "candidate" as const, candidateId: "sha256:7777777777777777777777777777777777777777777777777777777777777777" },
    logicalPass: 1,
    retryGeneration: 0,
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
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
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
  };
  const terminal = result === "findings" ? "findings" : "clean";
  const cleanOrFindings = createLocalReviewReceipt({
    target,
    requirement,
    carrier: admission.carrier,
    result: {
      status: "complete",
      result: terminal,
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
      findings: terminal === "findings" ? [finding] : [],
    },
    runtimeIdentity: authority.runtimeIdentity,
    attestationMechanism: authority.attestationMechanism,
    sourceDigest: source.sourceDigest,
    guidanceDigest: operation.guidanceDigest,
  });
  const receipt: ReviewReceiptV2 = result === "failed" || result === "unavailable"
    ? { ...cleanOrFindings, result }
    : cleanOrFindings;
  return { target, operation, source, receipt, finding, authority };
}

function localResult(records: ReturnType<typeof localFixture>): ReviewResult {
  if (records.receipt.result !== "clean" && records.receipt.result !== "findings") {
    throw new Error("local result fixture must be terminal");
  }
  return {
    kind: "attested-local",
    producerId: records.operation.operationId,
    repositoryId: records.operation.repositoryId,
    target: records.target,
    sourceIdentity: records.operation.request.evaluatorIdentity,
    originalOutcome: records.receipt.result,
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
      policyVersion: records.operation.policyVersion,
    },
    receiptRef: durableReceiptRef,
    localSourceRef: records.operation.sourceRef,
    requirement: records.operation.requirement,
    request: records.operation.request,
  };
}

function approvedLocal(records: ReturnType<typeof localFixture>): ApprovedDispositionRecord {
  const result = localResult(records);
  const disposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: records.operation.targetId,
      producerId: result.producerId,
      resultDigest: result.resultDigest,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      proposedBy: records.operation.attestation.runtimeIdentity,
      findings: [{
        findingId: records.finding.findingId,
        sourceIdentity: records.operation.request.evaluatorIdentity,
        locus: records.finding.locus,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        reportedSeverity: records.finding.severity,
        verifiedSeverity: records.finding.severity,
        disposition: "reject",
        gating: "blocking",
        rationale: "The source supports this disposition.",
        recommendation: "Record the disposition.",
        openQuestions: [],
      }],
    })),
    approvedBy: records.authority.authorIdentity,
    approvedAt: "2026-07-23T20:00:00Z",
  });
  return ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: records.operation.repositoryId,
    operationId: records.operation.operationId,
    candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` },
    errand: null,
    deliveryMember: null,
    source: {
      kind: "attested-local",
      receiptRef: bindReviewSourceReference({
        kind: "attested-local",
        operationId: records.operation.operationId,
        durableRef: durableReceiptRef,
      }),
      localSourceRef: records.operation.sourceRef,
    },
    approvedDisposition: disposition,
    fixAuthorization: null,
    errandFixResponse: null,
    deliveryMemberFixResponse: null,
  });
}

function localDependencies(
  records: ReturnType<typeof localFixture>,
  disposition: ApprovedDispositionRecord | null = null,
) {
  const publishOperation = vi.fn();
  const appendOutcome = vi.fn();
  const appendDispositionRecord = vi.fn();
  const adapterDependencies: ReviewReductionAdapterDependencies = {
    operationStore: {
      readOperation: async () => ({ version: 1, state: records.operation }),
      publishOperation,
    },
    sourceStore: {
      readSource: async () => records.source,
      appendSource: vi.fn(),
    },
    outcomeStore: {
      readOutcome: vi.fn(),
      appendOutcome,
    },
    resultReader: { readResult: async () => localResult(records) },
    dispositionStore: {
      readDispositionRecord: async () => disposition,
      appendDispositionRecord,
    },
    readReceiptEntries: async () => [{
      receipt: records.receipt,
      durableEvidenceRef: durableReceiptRef,
    }],
    confirmTarget: async (target) => ({ state: "current", target }),
  };
  const dependencies = {
    reductionPort: new DurableReviewReductionPort(adapterDependencies),
  };
  return {
    dependencies,
    adapterDependencies,
    publishOperation,
    appendOutcome,
    appendDispositionRecord,
  };
}

function changedTarget(target: ReviewTarget): ReviewTarget {
  return createReviewTarget({
    schemaVersion: target.schemaVersion,
    semanticsVersion: target.semanticsVersion,
    kind: target.kind,
    repositoryId: target.repositoryId,
    baseRef: target.baseRef,
    diffBaseSha: target.diffBaseSha,
    diffBaseTree: target.diffBaseTree,
    headSha: objectId("e"),
    headTree: objectId("f"),
  });
}

describe("review reduction command boundary", () => {
  it("dispatches a validated operation through the reduction port", async () => {
    const records = localFixture();
    const projected = {
      schemaVersion: 1 as const,
      semanticsVersion: "review-advisory/v1" as const,
      operationId: records.operation.operationId,
      persistedVersion: 1,
      currentTarget: records.target,
      state: "advisory-complete" as const,
      nextAction: "none" as const,
    };
    const expected = ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "advisory-complete",
      nextAction: "none",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        currentTarget: records.target,
        projection: projected,
      },
    });
    const dependencies: ReduceCommandDependencies = {
      reductionPort: { reduce: async () => expected },
    };

    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, dependencies)).resolves.toEqual(expected);
  });
});

describe("review reduction command: attested local", () => {
  it("maps clean, undispositioned findings, and completely dispositioned findings", async () => {
    const clean = localFixture("clean");
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: clean.operation.operationId,
    }, localDependencies(clean).dependencies)).resolves.toMatchObject({
      state: "advisory-complete",
      nextAction: "none",
      payload: { projection: { state: "advisory-complete" } },
    });

    const findings = localFixture("findings");
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: findings.operation.operationId,
    }, localDependencies(findings).dependencies)).resolves.toMatchObject({
      state: "findings",
      nextAction: "respond",
      payload: {
        projection: { state: "findings" },
        responseSource: { kind: "attested-local" },
      },
    });

    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: findings.operation.operationId,
    }, localDependencies(findings, approvedLocal(findings)).dependencies)).resolves.toMatchObject({
      state: "settled",
      nextAction: "none",
      payload: { projection: { state: "settled" } },
    });
  });

  it.each(["failed", "unavailable"] as const)("maps an imported %s receipt to local attest retry", async (result) => {
    const records = localFixture(result);
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, localDependencies(records).dependencies)).resolves.toMatchObject({
      state: "retryable",
      payload: {
        retryCommand: "local-attest",
        requestRef: records.operation.requestId,
      },
    });
  });

  it("rejects multiple terminal receipts for one local operation", async () => {
    const records = localFixture();
    const setup = localDependencies(records);
    setup.adapterDependencies.readReceiptEntries = async () => [
      {
        receipt: records.receipt,
        durableEvidenceRef: durableReceiptRef,
      },
      {
        receipt: records.receipt,
        durableEvidenceRef: "git-common:review-gate/evidence/receipts-v2.json#2",
      },
    ];

    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, setup.dependencies)).rejects.toThrow("local review operation has multiple terminal receipts");
  });

  it("returns stale-target before reading advisory records", async () => {
    const records = localFixture();
    const setup = localDependencies(records);
    const readReceiptEntries = vi.fn();
    setup.adapterDependencies.readReceiptEntries = readReceiptEntries;
    setup.adapterDependencies.confirmTarget = async () => ({
      state: "stale-target",
      attemptedTarget: records.target,
      currentTarget: changedTarget(records.target),
    });
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, setup.dependencies)).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
    });
    expect(readReceiptEntries).not.toHaveBeenCalled();
  });

  it("rejects source and disposition reference mismatches as corrupt state", async () => {
    const records = localFixture("findings");
    const sourceMismatch = localDependencies(records);
    sourceMismatch.adapterDependencies.sourceStore.readSource = async () => ({
      ...records.source,
      sourceDigest: digest("tampered-source"),
    });
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, sourceMismatch.dependencies)).rejects.toThrow("source snapshot mismatch");

    const disposition = approvedLocal(records);
    const dispositionMismatch = localDependencies(records, {
      ...disposition,
      source: {
        kind: "attested-local",
        receiptRef: bindReviewSourceReference({
          kind: "attested-local",
          operationId: records.operation.operationId,
          durableRef: "git-common:review-gate/evidence/receipts-v2.json#99",
        }),
        localSourceRef: records.operation.sourceRef,
      },
    });
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, dispositionMismatch.dependencies)).rejects.toThrow("disposition snapshot mismatch");
  });

  it.each(["producer", "result digest"] as const)(
    "refuses an approved local disposition bound to a substituted %s",
    async (substitution) => {
      const records = localFixture("findings");
      const setup = localDependencies(records, approvedLocal(records));
      const result = localResult(records);
      setup.adapterDependencies.resultReader.readResult = async () => substitution === "producer"
        ? { ...result, producerId: "later-review-operation" }
        : { ...result, resultDigest: digest("later-review-result") };

      await expect(reduceReviewCommand({
        schemaVersion: 1,
        operationId: records.operation.operationId,
      }, setup.dependencies)).rejects.toThrow("disposition snapshot mismatch");
    },
  );

  it("reduces an approved regraded reviewer nit without treating it as stale", async () => {
    const records = localFixture("findings");
    const sourceFinding = records.receipt.findings[0];
    if (sourceFinding === undefined) throw new Error("expected a source finding");
    Object.assign(sourceFinding, { severity: "minor", nit: true });

    const approvedDisposition = approvedLocal(records);
    const dispositionSet = createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: records.operation.targetId,
      producerId: localResult(records).producerId,
      resultDigest: localResult(records).resultDigest,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      proposedBy: records.operation.attestation.runtimeIdentity,
      findings: [{
        findingId: records.finding.findingId,
        sourceIdentity: records.operation.request.evaluatorIdentity,
        locus: records.finding.locus,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        reportedSeverity: "minor",
        reportedNit: true,
        verifiedSeverity: "major",
        disposition: "reject",
        rationale: "The source supports this disposition.",
        recommendation: "Record the disposition.",
        openQuestions: [],
      }],
    });
    const disposition = ApprovedDispositionRecordSchema.parse({
      ...approvedDisposition,
      approvedDisposition: approveDispositionState({
        proposed: proposeDispositionSet(dispositionSet),
        approvedBy: records.authority.authorIdentity,
        approvedAt: "2026-07-23T20:00:00Z",
      }),
    });

    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
    }, localDependencies(records, disposition).dependencies)).resolves.toMatchObject({
      state: "settled",
      nextAction: "none",
    });
  });
});

function frontlineFixture(outcomeKind: "clean" | "findings" | "unavailable" | "pass-cap-exhausted") {
  const local = localFixture();
  const source = {
    sourceId: "coderabbit-cli",
    kind: "command" as const,
    executable: "coderabbit",
    argv: ["review"],
  };
  const providerResult = outcomeKind === "findings"
    ? { kind: "findings" as const, findings: [local.finding] }
    : outcomeKind === "pass-cap-exhausted"
      ? { kind: "pass-cap-exhausted" as const }
      : outcomeKind === "unavailable"
        ? { kind: "unavailable" as const, reason: "not available" }
        : { kind: "clean" as const };
  const outcome = normalizeFrontlineOutcome({
    providerResult,
    source,
    target: local.target,
    pass: 1,
    maxPasses: 2,
  });
  const record = createFrontlineOutcomeRecord({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: local.target.repositoryId,
    operationId: "frontline-operation",
    sourceIdentity: source.sourceId,
    executableIdentity: outcomeKind === "pass-cap-exhausted"
      ? null
      : {
          digest: digest("coderabbit"),
          qualifiedVersion: "coderabbit/1.0.0",
        },
    outcome,
  });
  const state: FrontlineRunState = {
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: record.operationId,
    updatedAt: "2026-07-23T20:00:00Z",
    kind: "frontline-run",
    repositoryId: local.target.repositoryId,
    targetId: local.target.targetId,
    sourceIdentity: source.sourceId,
    lineage: {
      kind: "candidate",
      candidateId: digest("frontline-candidate"),
    },
    logicalPass: record.outcome.pass,
    retryGeneration: 0,
    outcome: record.outcome.outcome,
    policyVersion: digest("frontline-policy"),
    sourceBindingId: digest("source-binding"),
  };
  return { ...local, source, record, state };
}

function approvedFrontline(records: ReturnType<typeof frontlineFixture>): ApprovedDispositionRecord {
  const disposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: records.target.targetId,
      producerId: records.state.operationId,
      resultDigest: records.record.outcomeDigest,
      policyVersion: records.state.policyVersion,
      frontlineBinding: {
        operationId: records.state.operationId,
        sourceBindingId: records.state.sourceBindingId,
        outcomeDigest: records.record.outcomeDigest,
      },
      proposedBy: "arc-cli/0.1.0",
      findings: [{
        findingId: records.finding.findingId,
        sourceIdentity: records.source.sourceId,
        locus: records.finding.locus,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        reportedSeverity: records.finding.severity,
        verifiedSeverity: records.finding.severity,
        disposition: "fix",
        gating: "blocking",
        rationale: "The source supports this disposition.",
        recommendation: "Apply the fix.",
        openQuestions: [],
      }],
    })),
    approvedBy: "author-1",
    approvedAt: "2026-07-23T20:00:00Z",
  });
  return ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: records.target.repositoryId,
    operationId: records.state.operationId,
    candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` },
    errand: null,
    deliveryMember: null,
    source: {
      kind: "frontline",
      outcomeRef: bindReviewSourceReference({
        kind: "frontline",
        operationId: records.state.operationId,
        durableRef: durableOutcomeRef,
      }),
    },
    approvedDisposition: disposition,
    fixAuthorization: null,
    errandFixResponse: null,
    deliveryMemberFixResponse: null,
  });
}

function frontlineResult(
  records: ReturnType<typeof frontlineFixture>,
  record: FrontlineOutcomeRecord,
): ReviewResult {
  if (record.outcome.outcome !== "clean" && record.outcome.outcome !== "findings") {
    throw new Error("frontline result fixture must be terminal");
  }
  return {
    kind: "frontline",
    producerId: records.state.operationId,
    repositoryId: record.repositoryId,
    target: record.outcome.target,
    sourceIdentity: record.sourceIdentity,
    originalOutcome: record.outcome.outcome,
    findings: record.outcome.findings,
    resultDigest: record.outcomeDigest,
    admission: {
      lineage: records.state.lineage,
      logicalPass: records.state.logicalPass,
      retryGeneration: records.state.retryGeneration,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      policyVersion: records.state.policyVersion,
    },
    outcomeRef: durableOutcomeRef,
    sourceBindingId: records.state.sourceBindingId,
    executableIdentity: record.executableIdentity,
    outcome: record.outcome,
  };
}

function frontlineDependencies(
  records: ReturnType<typeof frontlineFixture>,
  disposition: ApprovedDispositionRecord | null = null,
  record: FrontlineOutcomeRecord = records.record,
) {
  const publishOperation = vi.fn();
  const appendOutcome = vi.fn();
  const appendDispositionRecord = vi.fn();
  const adapterDependencies: ReviewReductionAdapterDependencies = {
    operationStore: {
      readOperation: async () => ({ version: 2, state: records.state }),
      publishOperation,
    },
    sourceStore: {
      readSource: vi.fn(),
      appendSource: vi.fn(),
    },
    outcomeStore: {
      readOutcome: async () => ({ version: 1, record, outcomeRef: durableOutcomeRef }),
      appendOutcome,
    },
    resultReader: { readResult: async () => frontlineResult(records, record) },
    dispositionStore: {
      readDispositionRecord: async () => disposition,
      appendDispositionRecord,
    },
    readReceiptEntries: vi.fn(),
    confirmTarget: async (target) => ({ state: "current", target }),
  };
  const dependencies = {
    reductionPort: new DurableReviewReductionPort(adapterDependencies),
  };
  return {
    dependencies,
    adapterDependencies,
    publishOperation,
    appendOutcome,
    appendDispositionRecord,
  };
}

describe("review reduction command: frontline", () => {
  it("maps findings, dispositions, clean, pass cap, and non-review outcomes totally", async () => {
    const findings = frontlineFixture("findings");
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: findings.state.operationId,
    }, frontlineDependencies(findings).dependencies)).resolves.toMatchObject({
      state: "findings",
      payload: { responseSource: { kind: "frontline" } },
    });
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: findings.state.operationId,
    }, frontlineDependencies(findings, approvedFrontline(findings)).dependencies)).resolves.toMatchObject({
      state: "advisory-complete",
      payload: {
        frontlineFollowUp: {
          action: "follow-up-after-fix",
          pass: 2,
          maxPasses: 2,
          nextCommand: "frontline-resolve",
        },
      },
    });

    for (const kind of ["clean", "pass-cap-exhausted"] as const) {
      const records = frontlineFixture(kind);
      await expect(reduceReviewCommand({
        schemaVersion: 1,
        operationId: records.state.operationId,
      }, frontlineDependencies(records).dependencies)).resolves.toMatchObject({
        state: "advisory-complete",
        payload: { frontlineFollowUp: { action: "stop" } },
      });
    }

    const unavailable = frontlineFixture("unavailable");
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: unavailable.state.operationId,
    }, frontlineDependencies(unavailable).dependencies)).resolves.toMatchObject({
      state: "retryable",
      payload: { retryCommand: "frontline-run" },
    });
  });

  it("returns stale-target and performs no writes", async () => {
    const records = frontlineFixture("clean");
    const setup = frontlineDependencies(records);
    setup.adapterDependencies.confirmTarget = async () => ({
      state: "stale-target",
      attemptedTarget: records.target,
      currentTarget: changedTarget(records.target),
    });
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.state.operationId,
    }, setup.dependencies)).resolves.toMatchObject({ state: "stale-target" });
    expect(setup.publishOperation).not.toHaveBeenCalled();
    expect(setup.appendOutcome).not.toHaveBeenCalled();
    expect(setup.appendDispositionRecord).not.toHaveBeenCalled();
  });

  it("rejects a missing or digest-mismatched outcome behind a terminal claim", async () => {
    const records = frontlineFixture("clean");
    const missing = frontlineDependencies(records);
    missing.adapterDependencies.outcomeStore.readOutcome = async () => ({
      version: 0,
      record: null,
      outcomeRef: null,
    });
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.state.operationId,
    }, missing.dependencies)).rejects.toThrow("lacks its durable outcome");

    const mismatched = {
      ...records.record,
      outcomeDigest: digest("tampered-outcome"),
    };
    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.state.operationId,
    }, frontlineDependencies(records, null, mismatched).dependencies)).rejects.toThrow("outcome mismatch");
  });

  it("rejects a disposition whose frontline operation binding has moved", async () => {
    const records = frontlineFixture("findings");
    const disposition = approvedFrontline(records);
    records.state.sourceBindingId = digest("changed-source-binding");

    await expect(reduceReviewCommand({
      schemaVersion: 1,
      operationId: records.state.operationId,
    }, frontlineDependencies(records, disposition).dependencies)).rejects.toThrow(
      "approved disposition snapshot mismatch",
    );
  });
});
