import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  FrontlineOutcomeRecordSchema,
  ReviewReductionProjectionSchema,
  createFrontlineOutcomeRecord,
  currentApprovedDispositionNode,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createFixAuthorization } from
  "../../../../../src/scripts/review-gate/core/fix-authorization.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";

const target = {
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: "a".repeat(40),
  diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40),
  headTree: "d".repeat(40),
  targetId: canonicalDigest({ target: "review" }),
} as const;

const approvedDisposition = approveDispositionState({
  proposed: proposeDispositionSet(createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: target.targetId,
    producerId: "local-producer-1",
    resultDigest: canonicalDigest({ result: "first" }),
    policyVersion: canonicalDigest({ policy: "review" }),
    rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: "standard" }),
    proposedBy: "agent-1",
    proposedVerification: "full",
    findings: [{
      findingId: "finding-1",
      sourceIdentity: "delegated-agent",
      locus: "src/review.ts:42",
      sourceVerification: "verified",
      verificationRefs: ["review:finding-1"],
      reportedSeverity: "major",
      verifiedSeverity: "major",
      disposition: "defer",
      gating: "blocking",
      rationale: "The source confirms the boundary issue.",
      recommendation: "Track the correction as follow-up work.",
      openQuestions: [],
    }],
  })),
  approvedBy: "maintainer-1",
  approvedAt: "2026-07-23T15:00:00Z",
});

const outcome = normalizeFrontlineOutcome({
  providerResult: { kind: "clean" },
  source: {
    sourceId: "review-cli",
    kind: "command",
    executable: "reviewer",
    argv: ["--plain"],
  },
  target,
  pass: 1,
  maxPasses: 2,
});

describe("advisory review records", () => {
  it("binds canonical disposition identity to the exact producer content", () => {
    const { dispositionSetId, ...fields } = approvedDisposition.dispositionSet;
    const first = createDispositionSet({
      ...fields,
      producerId: "local-producer-1",
      resultDigest: canonicalDigest({ result: "first" }),
    });
    const second = createDispositionSet({
      ...fields,
      producerId: "local-producer-2",
      resultDigest: canonicalDigest({ result: "second" }),
    });

    expect(first).toMatchObject({
      producerId: "local-producer-1",
      resultDigest: canonicalDigest({ result: "first" }),
    });
    expect(second.dispositionSetId).not.toBe(dispositionSetId);
    expect(second.dispositionSetId).not.toBe(first.dispositionSetId);
  });

  it("refuses non-NFC finding identities in approval-bearing disposition content", () => {
    const { dispositionSetId, ...fields } = approvedDisposition.dispositionSet;
    void dispositionSetId;

    expect(() => createDispositionSet({
      ...fields,
      findings: fields.findings.map((finding) => ({
        ...finding,
        findingId: "finding-e\u0301",
      })),
    })).toThrow(/NFC-normalized/u);
  });

  it("requires exactly one rubric or frontline disposition binding", () => {
    const dispositionSet = approvedDisposition.dispositionSet;
    const fields = {
      schemaVersion: dispositionSet.schemaVersion,
      semanticsVersion: dispositionSet.semanticsVersion,
      targetId: dispositionSet.targetId,
      producerId: dispositionSet.producerId,
      resultDigest: dispositionSet.resultDigest,
      policyVersion: dispositionSet.policyVersion,
      proposedBy: dispositionSet.proposedBy,
      proposedVerification: dispositionSet.proposedVerification,
      findings: dispositionSet.findings,
    };
    const frontlineBinding = {
      operationId: "frontline-operation",
      sourceBindingId: canonicalDigest({ source: "frontline" }),
      outcomeDigest: canonicalDigest({ outcome: "findings" }),
    };

    expect(createDispositionSet({ ...fields, frontlineBinding })).toMatchObject({ frontlineBinding });
    expect(() => createDispositionSet(fields)).toThrow(
      "disposition set must bind exactly one rubric or frontline source context",
    );
    expect(() => createDispositionSet({
      ...fields,
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "standard" }),
      frontlineBinding,
    })).toThrow("disposition set must bind exactly one rubric or frontline source context");
  });

  it.each([
    {
      kind: "attested-local",
      receiptRef: "receipt:1",
      localSourceRef: "source:1",
    },
    {
      kind: "frontline",
      outcomeRef: "outcome:1",
    },
  ] as const)("accepts a complete approved disposition from $kind authority", (source) => {
    const record = {
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: "repo-1",
      operationId: "operation-1",
      candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` },
      errand: null,
      deliveryMember: null,
      source,
      currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({ headSha: target.headSha }),
        fixAuthorization: null,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    };
    expect(ApprovedDispositionRecordSchema.parse(record)).toEqual(record);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      source: source.kind === "attested-local"
        ? { ...source, outcomeRef: "forged" }
        : { ...source, receiptRef: "forged" },
    }).success).toBe(false);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      errand: {
        key: "repair-review-state",
        claimId: "claim-1",
        branch: "chore/repair-review-state",
      },
    }).success).toBe(false);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      deliveryMember: {
        kind: "delivery-member",
        planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: `sha256:${"d".repeat(64)}`,
        workUnitId: "example",
        head: "a".repeat(40),
      },
    }).success).toBe(source.kind === "frontline");
  });

  it("binds a Candidate-owned private member to the fix authorization head", () => {
    const { dispositionSetId: _unused, ...fields } = approvedDisposition.dispositionSet;
    expect(_unused).toMatch(/^sha256:[0-9a-f]{64}$/u);
    const finding = fields.findings[0];
    if (finding?.sourceVerification !== "verified") throw new Error("expected a verified finding");
    const fixDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        ...fields,
        findings: [{
          ...finding,
          disposition: "fix" as const,
          recommendation: "Apply the correction.",
        }],
      })),
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-23T15:00:00Z",
    });
    const fixAuthorization = createFixAuthorization({
      dispositionState: fixDisposition,
      oldTarget: target,
    });
    const record = {
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: target.repositoryId,
      operationId: "operation-1",
      candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` },
      errand: null,
      deliveryMember: {
        kind: "delivery-member",
        planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: `sha256:${"d".repeat(64)}`,
        workUnitId: "example",
        head: target.headSha,
      },
      source: { kind: "frontline", outcomeRef: "outcome:1" },
      currentDispositionSetId: fixDisposition.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition: fixDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({ headSha: target.headSha }),
        fixAuthorization,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    } as const;

    expect(ApprovedDispositionRecordSchema.parse(record)).toEqual(record);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      deliveryMember: { ...record.deliveryMember, head: "e".repeat(40) },
    }).success).toBe(false);
  });

  it("accepts one immutable approved-set lineage with an explicit current pointer", () => {
    const dispositionSetId = approvedDisposition.dispositionSet.dispositionSetId;
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "review-advisory/v1" as const,
      repositoryId: "repo-1",
      operationId: "operation-1",
      candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` },
      errand: null,
      deliveryMember: null,
      source: { kind: "attested-local" as const, receiptRef: "receipt:1", localSourceRef: "source:1" },
      currentDispositionSetId: dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({ headSha: target.headSha }),
        fixAuthorization: null,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    };

    expect(ApprovedDispositionRecordSchema.parse(record)).toEqual(record);
  });

  it("requires an ordered, source-stable lineage whose current pointer identifies the tail", () => {
    const firstId = approvedDisposition.dispositionSet.dispositionSetId;
    const { dispositionSetId: _ignored, ...fields } = approvedDisposition.dispositionSet;
    void _ignored;
    const successor = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        ...fields,
        proposedBy: "agent-2",
        findings: fields.findings.map((finding) => ({
          ...finding,
          sourceVerification: "not-supported" as const,
          verificationRefs: ["verification://finding-1-refuted"],
          verifiedSeverity: null,
          disposition: "reject" as const,
          rationale: "Focused verification disproved the reported issue.",
          recommendation: "Take no action.",
        })),
      })),
      approvedBy: "maintainer-2",
      approvedAt: "2026-07-23T16:00:00Z",
    });
    const successorId = successor.dispositionSet.dispositionSetId;
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "review-advisory/v1" as const,
      repositoryId: "repo-1",
      operationId: "operation-1",
      candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` },
      errand: null,
      deliveryMember: null,
      source: { kind: "attested-local" as const, receiptRef: "receipt:1", localSourceRef: "source:1" },
      currentDispositionSetId: successorId,
      approvedDispositionLineage: [{
        approvedDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({ headSha: target.headSha }),
        fixAuthorization: null,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: successorId,
      }, {
        approvedDisposition: successor,
        responsePolicyRequest: responsePolicyRequestFixture({ headSha: target.headSha }),
        fixAuthorization: null,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: firstId,
        successorDispositionSetId: null,
      }],
    };

    const parsed = ApprovedDispositionRecordSchema.parse(record);
    expect(currentApprovedDispositionNode(parsed).approvedDisposition).toEqual(successor);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      currentDispositionSetId: firstId,
    }).success).toBe(false);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      approvedDispositionLineage: record.approvedDispositionLineage.map((node, index) =>
        index === 1 ? { ...node, predecessorDispositionSetId: null } : node),
    }).success).toBe(false);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      approvedDispositionLineage: record.approvedDispositionLineage.map((node, index) =>
        index === 1
          ? {
              ...node,
              approvedDisposition: {
                ...successor,
                dispositionSet: { ...successor.dispositionSet, producerId: "other-producer" },
              },
            }
          : node),
    }).success).toBe(false);
    const { dispositionSetId: _successorId, ...successorFields } = successor.dispositionSet;
    void _successorId;
    const wrongFindingSuccessor = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        ...successorFields,
        proposedBy: "agent-3",
        findings: successorFields.findings.map((finding) => ({
          ...finding,
          findingId: "finding-other",
        })),
      })),
      approvedBy: "maintainer-3",
      approvedAt: "2026-07-23T16:30:00Z",
    });
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      currentDispositionSetId: wrongFindingSuccessor.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        ...record.approvedDispositionLineage[0]!,
        successorDispositionSetId: wrongFindingSuccessor.dispositionSet.dispositionSetId,
      }, {
        ...record.approvedDispositionLineage[1]!,
        approvedDisposition: wrongFindingSuccessor,
      }],
    }).success).toBe(false);
  });

  it("binds the fix authorization to the disposition set's approved verification scope", () => {
    const { dispositionSetId: originalDispositionSetId, ...dispositionFields } = approvedDisposition.dispositionSet;
    const approvedFix = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        ...dispositionFields,
        findings: dispositionFields.findings.map((finding) => {
          if (finding.sourceVerification !== "verified") {
            throw new Error("fix-authorization fixture requires a verified finding");
          }
          return {
            ...finding,
            disposition: "fix" as const,
            recommendation: "Apply the bounded fix.",
          };
        }),
      })),
      approvedBy: approvedDisposition.approval.approvedBy,
      approvedAt: approvedDisposition.approval.approvedAt,
    });
    expect(approvedFix.dispositionSet.dispositionSetId).not.toBe(originalDispositionSetId);
    const fixAuthorization = createFixAuthorization({ dispositionState: approvedFix, oldTarget: target });
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "review-advisory/v1" as const,
      repositoryId: "repo-1",
      operationId: "operation-1",
      candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` },
      errand: null,
      deliveryMember: null,
      source: { kind: "attested-local" as const, receiptRef: "receipt:1", localSourceRef: "source:1" },
      currentDispositionSetId: approvedFix.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition: approvedFix,
        responsePolicyRequest: responsePolicyRequestFixture({ headSha: target.headSha }),
        fixAuthorization,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    };

    expect(ApprovedDispositionRecordSchema.parse(record)).toEqual(record);
    expect(ApprovedDispositionRecordSchema.safeParse({
      ...record,
      approvedDispositionLineage: record.approvedDispositionLineage.map((node) => ({
        ...node,
        fixAuthorization: { ...fixAuthorization, approvedVerification: "targeted" as const },
      })),
    }).success).toBe(false);
  });

  it("binds a frontline outcome to its canonical digest and launched executable", () => {
    const record = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: "repo-1",
      operationId: "operation-1",
      sourceIdentity: "review-cli",
      executableIdentity: {
        digest: canonicalDigest({ executable: "reviewer" }),
        qualifiedVersion: "reviewer/v1",
      },
      outcome,
    });

    expect(FrontlineOutcomeRecordSchema.parse(record)).toEqual(record);
    expect(FrontlineOutcomeRecordSchema.safeParse({
      ...record,
      outcomeDigest: canonicalDigest({ outcome: "tampered" }),
    }).success).toBe(false);
    expect(FrontlineOutcomeRecordSchema.safeParse({
      ...record,
      executableIdentity: null,
    }).success).toBe(false);
    expect(FrontlineOutcomeRecordSchema.safeParse({
      ...record,
      sourceIdentity: "other-source",
    }).success).toBe(false);
  });

  it("includes frontline finding navigation in the immutable outcome digest", () => {
    const normalized = (sourceLabel: string) => normalizeFrontlineOutcome({
      providerResult: {
        kind: "findings" as const,
        findings: [{
          findingId: "finding-1",
          severity: "major" as const,
          locus: "src/review.ts:42",
          evidenceUrlOrId: "review:finding-1",
          sourceOrdinal: 1,
          sourceLabel,
        }],
      },
      source: outcome.source,
      target,
      pass: 1,
      maxPasses: 2,
    });
    const recordFor = (sourceLabel: string) => createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: "repo-1",
      operationId: "operation-1",
      sourceIdentity: "review-cli",
      executableIdentity: {
        digest: canonicalDigest({ executable: "reviewer" }),
        qualifiedVersion: "reviewer/v1",
      },
      outcome: normalized(sourceLabel),
    });

    expect(recordFor("First native label").outcomeDigest)
      .not.toBe(recordFor("Changed native label").outcomeDigest);
  });

  it("requires no executable identity for a never-launched terminal", () => {
    const unbound = normalizeFrontlineOutcome({
      providerResult: { kind: "unavailable", reason: "unbound" },
      source: outcome.source,
      target,
      pass: 1,
      maxPasses: 2,
    });
    if (unbound.outcome !== "unavailable") throw new Error("expected unavailable outcome");
    const record = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: "repo-1",
      operationId: "operation-2",
      sourceIdentity: "review-cli",
      executableIdentity: null,
      outcome: {
        ...unbound,
        reason: { class: "source-unbound" },
      },
    });

    expect(FrontlineOutcomeRecordSchema.parse(record)).toEqual(record);
    expect(FrontlineOutcomeRecordSchema.safeParse({
      ...record,
      executableIdentity: {
        digest: canonicalDigest({ executable: "reviewer" }),
        qualifiedVersion: "reviewer/v1",
      },
    }).success).toBe(false);
  });

  it("retains executable identity when a launched carrier reports an unsupported capability", () => {
    const unsupported = normalizeFrontlineOutcome({
      providerResult: { kind: "capability-unsupported" },
      source: outcome.source,
      target,
      pass: 1,
      maxPasses: 2,
    });
    const record = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: "repo-1",
      operationId: "operation-3",
      sourceIdentity: "review-cli",
      executableIdentity: {
        digest: canonicalDigest({ executable: "reviewer" }),
        qualifiedVersion: "reviewer/v1",
      },
      outcome: unsupported,
    });

    expect(FrontlineOutcomeRecordSchema.parse(record)).toEqual(record);
    expect(FrontlineOutcomeRecordSchema.safeParse({
      ...record,
      executableIdentity: null,
    }).success).toBe(true);
  });

  it("registers strict reduction state and action pairings", () => {
    const projection = {
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      operationId: "operation-1",
      persistedVersion: 2,
      currentTarget: target,
      state: "findings",
      nextAction: "respond",
      sourceRefs: ["outcome:1"],
    };
    expect(ReviewReductionProjectionSchema.parse(projection)).toEqual(projection);
    expect(ReviewReductionProjectionSchema.safeParse({
      ...projection,
      nextAction: "none",
    }).success).toBe(false);
    expect(ReviewReductionProjectionSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      operationId: "operation-1",
      persistedVersion: 2,
      currentTarget: target,
      state: "retryable",
      nextAction: "retry",
      retryCommand: "local-attest",
    })).toMatchObject({ retryCommand: "local-attest" });
  });
});
