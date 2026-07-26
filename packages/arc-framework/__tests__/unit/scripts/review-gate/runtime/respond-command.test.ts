import { describe, expect, it, vi } from "vitest";

import { canonicalDigest, canonicalize } from "../../../../../src/lib/kernel/index.js";
import {
  createFrontlineOutcomeRecord,
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
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import {
  respondToReviewCommand,
  type RespondCommandDependencies,
} from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

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
    attestationRuntimeKind: authority.attestationRuntimeKind,
    sourceRef: "source.json",
    sourceDigest: source.sourceDigest,
    guidanceDigest: digest("guidance"),
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

function approved(input: {
  targetId: string;
  policyVersion: string;
  rubricVersion: string;
  rubricDigest: string;
  sourceIdentity: string;
  finding: ReturnType<typeof fixture>["finding"];
  disposition?: "fix" | "defer" | "reject";
  proposedBy?: string;
  approvedBy?: string;
}) {
  const disposition = input.disposition ?? "fix";
  return approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: input.targetId,
      policyVersion: input.policyVersion,
      rubricVersion: input.rubricVersion,
      rubricDigest: input.rubricDigest,
      proposedBy: input.proposedBy ?? "arc-cli/0.1.0",
      findings: [{
        findingId: input.finding.findingId,
        sourceIdentity: input.sourceIdentity,
        locus: input.finding.locus,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        severity: input.finding.severity,
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

function dependencies(records: ReturnType<typeof fixture>) {
  let disposition: ApprovedDispositionRecord | null = null;
  const deps: RespondCommandDependencies = {
    operationStore: {
      readOperation: async () => ({ version: 1, state: records.operation }),
      publishOperation: vi.fn(),
    },
    sourceStore: {
      readSource: async () => records.source,
      appendSource: vi.fn(),
    },
    outcomeStore: {
      readOutcome: vi.fn(),
      appendOutcome: vi.fn(),
    },
    dispositionStore: {
      readDispositionRecord: async () => disposition,
      appendDispositionRecord: async (record) => {
        if (disposition !== null && canonicalize(disposition) !== canonicalize(record)) {
          throw new Error("conflict");
        }
        disposition = record;
        return { dispositionRecordRef: "git-common:review-gate/evidence/disposition.json" };
      },
    },
    readReceipt: async () => records.receipt,
    confirmTarget: async (target) => ({ state: "current", target }),
    resolveLocalActors: async () => ({
      approverIdentity: records.authority.authorIdentity,
      proposerIdentity: records.authority.runtimeIdentity,
    }),
    resolveFrontlineActors: async () => ({
      approverIdentity: records.authority.authorIdentity,
      proposerIdentity: records.authority.runtimeIdentity,
    }),
  };
  return deps;
}

function localRequest(
  records: ReturnType<typeof fixture>,
  disposition: "fix" | "defer" | "reject" = "fix",
) {
  return {
    schemaVersion: 1,
    source: { kind: "attested-local", receiptRef: records.receiptRef },
    dispositions: approved({
      targetId: records.target.targetId,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      sourceIdentity: records.authority.evaluatorIdentity,
      finding: records.finding,
      disposition,
    }),
  };
}

describe("review response command", () => {
  it("constructs a source-bound proposal from author-owned finding decisions", async () => {
    const records = fixture();
    const earlierFinding = {
      findingId: "finding-0",
      severity: "major" as const,
      locus: "src/earlier.ts:3",
      evidenceUrlOrId: "review:finding-0",
    };
    records.receipt.findings.push(earlierFinding);

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }, {
          findingId: earlierFinding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/earlier.ts:3"],
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
            findings: [{
              findingId: earlierFinding.findingId,
              sourceIdentity: records.authority.evaluatorIdentity,
              locus: earlierFinding.locus,
              severity: earlierFinding.severity,
              gating: "blocking",
            }, {
              findingId: records.finding.findingId,
              sourceIdentity: records.authority.evaluatorIdentity,
              locus: records.finding.locus,
              severity: records.finding.severity,
              gating: "blocking",
            }],
            dispositionSetId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
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

  it("returns settled and then already-settled for an identical non-fix replay", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const request = localRequest(records, "defer");
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({ state: "settled" });
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({ state: "already-settled" });
  });

  it("returns stale-target before appending dispositions when the reviewed target moved", async () => {
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

  it("refuses actor identities that do not come from the trusted boundary", async () => {
    const records = fixture();
    const request = localRequest(records);
    request.dispositions = approved({
      targetId: records.target.targetId,
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

  it("loads frontline findings from the exact durable outcome and rejects non-findings", async () => {
    const records = fixture();
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
    deps.outcomeStore.readOutcome = async () => ({ version: 1, record, outcomeRef: durableRef });
    const dispositions = approved({
      targetId: records.target.targetId,
      policyVersion: digest("frontline-policy"),
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("frontline-rubric"),
      sourceIdentity: source.sourceId,
      finding: records.finding,
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      dispositions,
    }, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: {
        operationId: record.operationId,
        reentryCommand: "frontline-resolve",
        frontlineFollowUp: {
          action: "follow-up-after-fix",
          pass: 2,
          maxPasses: 2,
          nextCommand: "frontline-resolve",
        },
      },
    });

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
    deps.outcomeStore.readOutcome = async () => ({ version: 1, record: clean, outcomeRef: durableRef });
    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      dispositions,
    }, deps)).rejects.toThrow("requires a findings outcome");
  });
});
