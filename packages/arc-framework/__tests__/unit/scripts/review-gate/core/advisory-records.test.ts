import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  FrontlineOutcomeRecordSchema,
  ReviewReductionProjectionSchema,
  createFrontlineOutcomeRecord,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";

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
    policyVersion: canonicalDigest({ policy: "review" }),
    rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: "standard" }),
    proposedBy: "agent-1",
    findings: [{
      findingId: "finding-1",
      sourceIdentity: "delegated-agent",
      locus: "src/review.ts:42",
      sourceVerification: "verified",
      verificationRefs: ["review:finding-1"],
      severity: "major",
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
  it("requires exactly one rubric or frontline disposition binding", () => {
    const dispositionSet = approvedDisposition.dispositionSet;
    const fields = {
      schemaVersion: dispositionSet.schemaVersion,
      semanticsVersion: dispositionSet.semanticsVersion,
      targetId: dispositionSet.targetId,
      policyVersion: dispositionSet.policyVersion,
      proposedBy: dispositionSet.proposedBy,
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
      source,
      approvedDisposition,
      fixAuthorization: null,
      errandFixResponse: null,
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
