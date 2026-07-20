import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  approveDispositionSet,
  createDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createFindingSettlementV2 } from "../../../../../src/scripts/review-gate/runtime/finding-settlement.js";
import {
  ensureDirectReply,
  ensureFindingConversationClosureV2,
  ensureThreadResolution,
} from "../../../../../src/scripts/review-gate/runtime/settlement-runtime.js";

const base = {
  repositoryRef: "o/r", pullRequestNumber: 7, expectedActorIdentity: "44", expectedHeadSha: "a".repeat(40),
};

describe("settlement mutation adoption", () => {
  it("canonically confirms created and ambiguous replies without blind replay", async () => {
    const postInlineReply = vi.fn(async () => ({ kind: "ambiguous" as const }));
    const findReplies = vi.fn(async () => [{ commentId: "81", actorIdentity: "44", body: "Fixed", createdAt: "2026-07-12T21:00:00Z" }]);
    await expect(ensureDirectReply({
      ...base, commentId: "41", body: "Fixed", notBefore: "2026-07-12T20:59:00Z",
    }, { developer: { postInlineReply }, canonical: { findReplies } })).resolves.toMatchObject({ commentId: "81" });
    expect(postInlineReply).toHaveBeenCalledOnce();
    expect(findReplies).toHaveBeenCalledOnce();
  });

  it("adopts exact resolved state and keeps mismatch blocking", async () => {
    const resolveReviewThread = vi.fn(async () => ({ kind: "resolved" as const, threadId: "PRRT_1" }));
    const readThread = vi.fn()
      .mockResolvedValueOnce({ threadId: "PRRT_1", isResolved: false, resolvedByActorIdentity: null })
      .mockResolvedValueOnce({ threadId: "PRRT_1", isResolved: true, resolvedByActorIdentity: "44" });
    await expect(ensureThreadResolution({ ...base, threadId: "PRRT_1" }, {
      developer: { resolveReviewThread }, canonical: { readThread },
    })).resolves.toMatchObject({ isResolved: true });
    expect(resolveReviewThread).toHaveBeenCalledOnce();
    readThread.mockResolvedValueOnce({ threadId: "PRRT_1", isResolved: true, resolvedByActorIdentity: "99" });
    await expect(ensureThreadResolution({ ...base, threadId: "PRRT_1" }, {
      developer: { resolveReviewThread }, canonical: { readThread },
    })).rejects.toThrow("canonical-thread-resolution-mismatch");
  });

  it("records canonical host closure separately from the approved disposition", async () => {
    const targetId = canonicalDigest({ target: "old" });
    const dispositionSet = createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId,
      policyVersion: canonicalDigest({ policy: "review" }),
      rubricVersion: "independent-analysis/v1",
      rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
      proposedBy: "author-1",
      findings: [{
        findingId: "finding-1",
        sourceIdentity: "codex-pr",
        locus: "src/index.ts:7",
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        severity: "minor",
        disposition: "reject",
        gating: "record-only",
        rationale: "The source does not support the reported behavior.",
        recommendation: "Reject the finding and leave the target unchanged.",
        openQuestions: [],
      }],
    });
    const settlement = createFindingSettlementV2({
      dispositionSet,
      approval: approveDispositionSet({
        dispositionSet,
        approvedBy: "maintainer-1",
        approvedAt: "2026-07-20T19:59:00Z",
      }),
      finding: {
        findingId: "finding-1",
        severity: "minor",
        locus: "src/index.ts:7",
        evidenceUrlOrId: "review:finding-1",
      },
      settledBy: "44",
      settledAt: "2026-07-20T20:00:00Z",
      fixTargetId: null,
      verificationRefs: [],
    });
    const readThread = vi.fn(async () => ({
      threadId: "PRRT_1",
      isResolved: true,
      resolvedByActorIdentity: "44",
    }));
    const closure = await ensureFindingConversationClosureV2({
      ...base,
      threadId: "PRRT_1",
      settlement,
      authorityIdentity: "44",
      closedAt: "2026-07-20T20:01:00Z",
    }, {
      developer: { resolveReviewThread: vi.fn() },
      canonical: { readThread },
    });
    expect(closure).toMatchObject({
      findingId: "finding-1",
      hostEvidenceRef: "github-review-thread:PRRT_1:resolved",
    });
    expect(closure).not.toHaveProperty("disposition");
  });
});
