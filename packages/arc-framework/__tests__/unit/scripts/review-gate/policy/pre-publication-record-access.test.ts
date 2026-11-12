/** Pre-publication's lazy record view on a native store exposes every member that selects the native arm. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createLocalReviewPreparationFixture } from "../../../../fixtures/local-review-preparation.js";
import { localOutcome } from "../../../../fixtures/review-outcome.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { createPrePublicationRecordAccess } from "../../../../../src/scripts/review-gate/policy/pre-publication-record-access.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

it("exposes the native result writer and retained source locator on a native store", async () => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example");
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const prepared = createLocalReviewPreparationFixture({ repositoryId: projectId });
  const result = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, prepared.dependencies);
  const local = prepared.published();
  if (result.state !== "ready" || local?.kind !== "local-review") throw new Error("Expected a pending local admission");
  const { operationStore } = createPrePublicationRecordAccess({ ...checkout, workItem: primary.reference.owner });
  await operationStore.publishOperation(local, 0);
  expect(await operationStore.readLocalSourceReference?.(local.operationId)).toBe(local.sourceRef);

  const outcome = ReviewOutcomeSchema.parse(JSON.parse(JSON.stringify(localOutcome({}))));
  await createReviewOutcomePort(h.store, primary.reference.owner).create(outcome);
  expect((await operationStore.outcomeWriter?.read(reviewOutcomeKey(outcome)))?.value).toEqual(outcome);
});
