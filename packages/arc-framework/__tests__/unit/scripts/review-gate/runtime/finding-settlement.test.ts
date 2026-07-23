import { describe, expect, it, vi } from "vitest";

import type { Evidence } from "../../../../../src/scripts/review-gate/core/evidence.js";
import type { ReviewReceipt, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  consumeFixAuthorization,
  createFixAuthorization,
} from "../../../../../src/scripts/review-gate/core/fix-authorization.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  recordProviderClosure,
  settleFixedFinding,
  settleNonFixFinding,
} from "../../../../../src/scripts/review-gate/runtime/finding-settlement.js";

const OLD = "a".repeat(40);
const FIX = "b".repeat(40);
const oldTarget = createReviewTarget({
  schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set", repositoryId: "repo-1",
  baseRef: "main", diffBaseSha: "0".repeat(40), diffBaseTree: "1".repeat(40),
  headSha: OLD, headTree: "2".repeat(40),
});
const fixTarget = createReviewTarget({
  schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set", repositoryId: "repo-1",
  baseRef: "main", diffBaseSha: "0".repeat(40), diffBaseTree: "1".repeat(40),
  headSha: FIX, headTree: "3".repeat(40),
});
const request: ReviewRequest = {
  schemaVersion: 1, repositoryId: "1", changeRequestId: "7", changeSetId: "c".repeat(64),
  policyVersion: "d".repeat(64), semanticsVersion: "review-gate/v1", rubricVersion: "standard-review/v1",
  requirementId: "analysis", sourceIdentity: "coderabbit-pr", coverage: "full", coverageFromSha: "0".repeat(40),
  coverageThroughSha: OLD, generation: 0, actorIdentity: "302312524", requestMechanism: "automatic",
  requiredActorIdentity: "302312524", requestCommand: null,
};

function evidence(findings: Evidence["findings"] = []): Evidence {
  return {
    schemaVersion: 1, requirementId: "analysis", sourceKind: "agent", sourceIdentity: "coderabbit-pr",
    result: findings.length === 0 ? "clean" : "findings", evidenceUrlOrId: "review:fix",
    policyVersion: request.policyVersion, rubricVersion: request.rubricVersion, coverage: "full",
    coverageFromSha: OLD, coverageThroughSha: FIX, baseRef: "main", diffBaseSha: request.coverageFromSha,
    changeSetId: "e".repeat(64), headSha: FIX, findings, closures: [], observedAt: "2026-07-12T22:00:00Z",
  };
}

const dispositionState = approveDispositionState({
  proposed: proposeDispositionSet(createDispositionSet({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", targetId: oldTarget.targetId,
    policyVersion: canonicalDigest({ policy: "review" }), rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: "implementation-audit" }), proposedBy: "author-1",
    findings: [{
      findingId: "f-1", sourceIdentity: "coderabbit-pr", locus: "src/a.ts:1",
      sourceVerification: "verified", verificationRefs: ["source:src/a.ts:1"], severity: "major",
      disposition: "fix", gating: "blocking", rationale: "The source confirms the reported defect.",
      recommendation: "Apply the bounded fix.", openQuestions: [],
    }],
  })),
  approvedBy: "maintainer-1",
  approvedAt: "2026-07-12T21:00:00Z",
});

function proof() {
  const authorization = createFixAuthorization({ dispositionState, oldTarget });
  const consumption = consumeFixAuthorization({
    authorization,
    oldTarget,
    newTarget: fixTarget,
    appliedBy: "44",
    consumedAt: "2026-07-12T21:05:00Z",
    verificationRefs: ["ci:fix"],
    priorConsumptions: [],
  });
  return { authorization, consumption };
}

describe("coordinator-owned FIX settlement", () => {
  it("records accurate reply and authority before resolution, then confirms resolution", async () => {
    const appended: string[] = [];
    const appendAndConfirm = vi.fn(async (receipt) => { appended.push(receipt.action); return receipt; });
    const result = await settleFixedFinding({
      request, findingId: "f-1", commentId: "41", threadId: "PRRT_1", oldHeadSha: OLD, fixHeadSha: FIX,
      oldTargetId: oldTarget.targetId, fixTargetId: fixTarget.targetId, dispositionState,
      actorIdentity: "44", ciState: "success", followUpEvidence: evidence(), verificationRefs: ["ci:fix"],
      headUpdateProof: proof(), expectedLedgerVersion: 5, settledAt: "2026-07-12T22:01:00Z",
    }, {
      ensureReply: async (body) => {
        expect(body).toContain("Addressed and verified");
        expect(body).not.toMatch(/CodeRabbit verified|provider verified/iu);
        return { commentId: "81", actorIdentity: "44", body, createdAt: "2026-07-12T22:01:00Z" };
      },
      ensureResolution: async () => ({ threadId: "PRRT_1", isResolved: true, resolvedByActorIdentity: "44" }),
      appendAndConfirm,
    });
    expect(appended).toEqual(["fixed", "conversation-resolved"]);
    expect(result.fixed.payload).toMatchObject({ kind: "finding-disposition", followUpEvidenceRef: "review:fix" });
  });

  it("allows other findings but rejects source-confirmed recurrence and incomplete head proof", async () => {
    const otherFinding = { findingId: "f-2", severity: "low" as const, locus: "src/b.ts:2", evidenceUrlOrId: "finding:2" };
    const deps = { ensureReply: vi.fn(), ensureResolution: vi.fn(), appendAndConfirm: vi.fn() };
    await expect(settleFixedFinding({
      request, findingId: "f-1", commentId: "41", threadId: "PRRT_1", oldHeadSha: OLD, fixHeadSha: FIX,
      oldTargetId: oldTarget.targetId, fixTargetId: fixTarget.targetId, dispositionState,
      actorIdentity: "44", ciState: "success", followUpEvidence: evidence([{ ...otherFinding, recursFindingId: "f-1" }]),
      verificationRefs: ["ci:fix"], headUpdateProof: proof(), expectedLedgerVersion: 5,
      settledAt: "2026-07-12T22:01:00Z",
    }, deps)).rejects.toThrow("finding-recurred");
    const invalid = proof();
    invalid.consumption = {
      ...invalid.consumption,
      appliedBy: "other-actor",
    };
    await expect(settleFixedFinding({
      request, findingId: "f-1", commentId: "41", threadId: "PRRT_1", oldHeadSha: OLD, fixHeadSha: FIX,
      oldTargetId: oldTarget.targetId, fixTargetId: fixTarget.targetId, dispositionState,
      actorIdentity: "44", ciState: "success", followUpEvidence: evidence([otherFinding]), verificationRefs: ["ci:fix"],
      headUpdateProof: invalid, expectedLedgerVersion: 5, settledAt: "2026-07-12T22:01:00Z",
    }, deps)).rejects.toThrow("invalid-head-update-proof");
  });
});

describe("non-fix and provider-owned settlement", () => {
  it.each(["deferred", "rejected"] as const)("records %s reply authority before resolution", async (disposition) => {
    const actions: string[] = [];
    const result = await settleNonFixFinding({
      request, disposition, findingId: "f-1", commentId: "41", threadId: "PRRT_1", headSha: OLD,
      currentHeadSha: OLD, actorIdentity: "44", rationale: "Outside this change's supported contract.",
      expectedLedgerVersion: 5, settledAt: "2026-07-12T22:01:00Z",
    }, {
      ensureReply: async (body) => ({ commentId: "81", actorIdentity: "44", body, createdAt: "2026-07-12T22:01:00Z" }),
      ensureResolution: async () => ({ threadId: "PRRT_1", isResolved: true, resolvedByActorIdentity: "44" }),
      appendAndConfirm: async (receipt) => { actions.push(receipt.action); return receipt; },
    });
    expect(actions).toEqual([disposition, "conversation-resolved"]);
    expect(result.disposition.reason).toBe("Outside this change's supported contract.");
  });

  it("rejects empty or over-limit non-fix rationale before replying", async () => {
    const deps = {
      ensureReply: async (body: string) => ({ commentId: "81", actorIdentity: "44", body, createdAt: "now" }),
      ensureResolution: async () => ({ threadId: "PRRT_1", isResolved: true, resolvedByActorIdentity: "44" }),
      appendAndConfirm: async (receipt: ReviewReceipt) => receipt,
    };
    for (const rationale of ["   ", "é".repeat(513)]) {
      await expect(settleNonFixFinding({
        request,
        disposition: "deferred",
        findingId: "f-1",
        commentId: "41",
        threadId: "PRRT_1",
        headSha: OLD,
        currentHeadSha: OLD,
        actorIdentity: "44",
        rationale,
        expectedLedgerVersion: 5,
        settledAt: "2026-07-12T22:01:00Z",
      }, deps)).rejects.toThrow("invalid-settlement-rationale");
    }
  });

  it("records provider closure only from the qualified source's explicit relation", async () => {
    const sourceEvidence = evidence();
    sourceEvidence.closures = [{
      findingId: "f-1", authorityKind: "source-confirmed", authorityIdentity: "coderabbit-pr",
      evidenceUrlOrId: "closure:1",
    }];
    await expect(recordProviderClosure({
      request, findingId: "f-1", findingHeadSha: OLD, evidence: sourceEvidence,
      qualifiedClosureSources: ["coderabbit-pr"], expectedLedgerVersion: 5, settledAt: "2026-07-12T22:01:00Z",
    }, { appendAndConfirm: async (receipt) => receipt })).resolves.toMatchObject({
      action: "provider-closed",
      payload: { oldHeadSha: OLD, followUpEvidenceRef: "closure:1" },
    });
    await expect(recordProviderClosure({
      request, findingId: "f-1", findingHeadSha: OLD, evidence: sourceEvidence,
      qualifiedClosureSources: [], expectedLedgerVersion: 5, settledAt: "2026-07-12T22:01:00Z",
    }, { appendAndConfirm: async (receipt) => receipt })).rejects.toThrow("unqualified-provider-closure");
  });
});
