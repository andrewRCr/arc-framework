import { describe, expect, it } from "vitest";
import { storedLocalApproval } from "../../../../../fixtures/review-family-access.js";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createProjectIdentityReader, ProjectIdentityError } from "../../../../../../src/lib/store/project-identity.js";
import { reviewOutcomeKey } from "../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { StoredReviewResultReader } from "../../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { validateApprovedDispositionRecordForResult } from "../../../../../../src/scripts/review-gate/core/review-result-disposition.js";

describe("stored review result reader", () => {
  it("reproduces a local result and its approval using only portable facts", async () => {
    const h = await storedLocalApproval();
    const original = await h.fixture.resultReader.readResult(h.outcome.attemptId);
    const reader = new StoredReviewResultReader({ outcomes: createReviewOutcomePort(h.harness.store, h.owner),
      evidence: h.evidence, readProjectId: createProjectIdentityReader(h.harness.store) });
    const result = await reader.readResult(h.outcome.attemptId);
    expect(result).toEqual({ ...original, workItem: h.owner, receiptRef: reviewOutcomeKey(h.outcome),
      localSourceRef: h.outcome.local!.sourceDigest });
    const approval = await h.evidence.readDispositionRecord(h.outcome.attemptId);
    expect(approval).not.toBeNull();
    expect(() => validateApprovedDispositionRecordForResult(approval!, result)).not.toThrow();
  });

  it("keeps an unreadable outcome listing actionable and resumes after repair", async () => {
    const h = await storedLocalApproval();
    const reader = new StoredReviewResultReader({ outcomes: createReviewOutcomePort(h.harness.store, h.owner),
      evidence: h.evidence, readProjectId: createProjectIdentityReader(h.harness.store) });
    h.harness.store.state.unreadable.add("review");
    await expect(reader.readResult(h.outcome.attemptId)).rejects.toMatchObject({ code: "corrupt-result",
      message: "The family index cannot be read. Restore the family index from a saved state." });
    h.harness.store.state.unreadable.delete("review");
    expect(await reader.readResult(h.outcome.attemptId)).toMatchObject({ producerId: h.outcome.attemptId });
  });

  it("preserves the project identity refusal and permits a fresh read after repair", async () => {
    const h = await storedLocalApproval();
    const reader = () => new StoredReviewResultReader({ outcomes: createReviewOutcomePort(h.harness.store, h.owner),
      evidence: h.evidence, readProjectId: createProjectIdentityReader(h.harness.store) });
    h.harness.store.state.unreadable.add("project-registry");
    await expect(reader().readResult(h.outcome.attemptId)).rejects.toBeInstanceOf(ProjectIdentityError);
    h.harness.store.state.unreadable.delete("project-registry");
    expect(await reader().readResult(h.outcome.attemptId)).toMatchObject({ producerId: h.outcome.attemptId });
  });
});
