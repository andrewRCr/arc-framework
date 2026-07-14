import { describe, expect, it, vi } from "vitest";

import type { Evidence } from "../../../../../src/scripts/review-gate/core/evidence.js";
import type { ReviewReceipt, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import {
  recordProviderClosure,
  settleFixedFinding,
  settleNonFixFinding,
} from "../../../../../src/scripts/review-gate/runtime/finding-settlement.js";

const OLD = "a".repeat(40);
const FIX = "b".repeat(40);
const request: ReviewRequest = {
  schemaVersion: 1, repositoryId: "1", changeRequestId: "7", changeSetId: "c".repeat(64),
  policyVersion: "d".repeat(64), semanticsVersion: "review-gate/v1", rubricVersion: "independent-analysis/v1",
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

function proof() {
  const authorization = createReceipt({
    eventId: "begin-fix", previousLedgerVersion: 3, action: "begin-fix", request, result: null,
    evidenceUrlOrId: null, findingIds: ["f-1"], payload: {
      kind: "head-update-authorization", authorizedAt: "2026-07-12T21:00:00Z", terminalRequestKey: "f".repeat(64),
      oldHeadSha: OLD, targetHeadSha: FIX, actorIdentity: "44", findingIds: ["f-1"],
    },
  });
  const consumption = createReceipt({
    eventId: "consume-fix", previousLedgerVersion: 4, action: "head-update-consumed", request, result: null,
    evidenceUrlOrId: null, findingIds: ["f-1"], payload: {
      kind: "head-update-consumption", consumedAt: "2026-07-12T21:05:00Z",
      authorizationReceiptHash: authorization.receiptHash, oldHeadSha: OLD, newHeadSha: FIX, findingIds: ["f-1"],
    },
  });
  return { authorization, consumption };
}

describe("coordinator-owned FIX settlement", () => {
  it("records accurate reply and authority before resolution, then confirms resolution", async () => {
    const appended: string[] = [];
    const appendAndConfirm = vi.fn(async (receipt) => { appended.push(receipt.action); return receipt; });
    const result = await settleFixedFinding({
      request, findingId: "f-1", commentId: "41", threadId: "PRRT_1", oldHeadSha: OLD, fixHeadSha: FIX,
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
      actorIdentity: "44", ciState: "success", followUpEvidence: evidence([{ ...otherFinding, recursFindingId: "f-1" }]),
      verificationRefs: ["ci:fix"], headUpdateProof: proof(), expectedLedgerVersion: 5,
      settledAt: "2026-07-12T22:01:00Z",
    }, deps)).rejects.toThrow("finding-recurred");
    const invalid = proof();
    if (invalid.consumption.payload.kind !== "head-update-consumption") throw new Error("fixture mismatch");
    invalid.consumption = {
      ...invalid.consumption,
      payload: { ...invalid.consumption.payload, authorizationReceiptHash: "0".repeat(64) },
    };
    await expect(settleFixedFinding({
      request, findingId: "f-1", commentId: "41", threadId: "PRRT_1", oldHeadSha: OLD, fixHeadSha: FIX,
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
