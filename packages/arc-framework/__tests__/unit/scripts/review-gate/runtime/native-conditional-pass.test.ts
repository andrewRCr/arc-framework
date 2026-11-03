/** Approved-fix captures retain the existing authority identity over checked native producer facts. */
import { expect, it } from "vitest";
import { createNativeConditionalPassFixture as conditionalCapture } from "../../../../fixtures/native-conditional-pass.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { computeConditionalPassAuthorizationId } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeConditionalPass } from "../../../../../src/scripts/review-gate/runtime/native-conditional-pass.js";


it.each(["local", "frontline", "hosted"] as const)("captures a %s approved-fix decision once under its existing authorization ID", async kind => {
  const { h, primary, outcome, approval, input } = await conditionalCapture(kind);
  if (approval === null) throw new Error("Expected a recorded approval");
  const stored = await publishNativeConditionalPass(input);
  const { capture } = input;
  expect(stored.reference.owner).toEqual(primary.reference.owner);
  expect(stored.reference.key).toBe(computeConditionalPassAuthorizationId({ ...capture, originatingHeadSha: capture.headSha }));
  expect(stored.value).toEqual({ schemaVersion: 1, subject: { lineage: outcome.lineage, headSha: outcome.target.headSha, subjectDigest: null },
    lane: outcome.lane, choice: { kind: "extra-pass", passCount: outcome.logicalPass, precondition: { kind: "approved-fix",
      repositoryId: outcome.target.repositoryId, producerId: outcome.attemptId, dispositionSetId: approval.value.dispositionSet.dispositionSetId,
      originatingHeadSha: outcome.target.headSha, exhaustedPassCount: outcome.logicalPass } },
    decidedBy: approval.value.approval.approvedBy, decidedAt: capture.now, basis: null });
  expect(stored.value).not.toHaveProperty("status");
  expect(await publishNativeConditionalPass({ ...input, capture: { ...capture, now: "2026-10-20T14:00:00Z" } })).toEqual(stored);
  expect(lifecycleSuccess(await h.store.history({ reference: stored.reference }))).toHaveLength(1);
  expect(await input.evidence.read(capture.dispositionSetId)).toEqual(approval);
});

it("refuses a foreign authorizer and continues with the recorded disposition approver", async () => {
  const { input } = await conditionalCapture("frontline");
  await expect(publishNativeConditionalPass({ ...input, capture: { ...input.capture,
    authorizedBy: "another-authorizer" } })).rejects.toThrow("recorded disposition approver");
  expect(await input.decisions.list()).toEqual({ status: "complete", records: [] });
  expect((await publishNativeConditionalPass(input)).value.decidedBy).toBe(input.capture.authorizedBy);
});

it("refuses capture before approval and continues after that approval is recorded", async () => {
  const { input, approvalInput } = await conditionalCapture("local", false);
  await expect(publishNativeConditionalPass(input)).rejects.toThrow("Approve the fix response");
  expect(await input.decisions.list()).toEqual({ status: "complete", records: [] });
  await publishNativeReviewApproval(approvalInput);
  expect((await publishNativeConditionalPass(input)).value.decidedBy).toBe(input.capture.authorizedBy);
});
