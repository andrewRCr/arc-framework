import { describe, expect, it, vi } from "vitest";

import { ensureDirectReply, ensureThreadResolution } from "../../../../../src/scripts/review-gate/runtime/settlement-runtime.js";

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
});
