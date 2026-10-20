/** Actual admitted frontline execution over portable facts and checkout-local pending storage. */
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { createReviewCheckout } from "../helpers/store/review-checkout.js";
import { createFrontlineMappingFixture } from "./review-mapping.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";
import { NativeReviewInFlightStateStore } from "../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { recordLaneAttempt } from "../../src/scripts/review-gate/lane-progress.js";

export async function nativeFrontlineReview(result: "clean" | "findings" = "findings") {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), checkout = await createReviewCheckout(h);
  try {
    const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
    const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
    const evidence = createReviewEvidencePort(h.store, primary.reference.owner);
    const operations = new NativeReviewInFlightStateStore({ publisher, workItem: primary.reference.owner,
      outcomes, evidence, projectId: h.projectId });
    const { fixture } = await createFrontlineMappingFixture(projectId, result);
    const { admission } = fixture;
    await recordLaneAttempt(operations, { lane: "frontline", repositoryId: projectId, changeRequestId: null,
      headSha: admission.target.headSha, lineage: admission.lineage, logicalPass: admission.logicalPass,
      retryGeneration: admission.retryGeneration, attemptId: admission.operationId,
      sourceId: fixture.outcomeRecord.sourceIdentity, outcome: "pending", consumedPass: false,
      frontline: { admission, effectiveCoverage: null }, now: "2026-10-20T12:00:00Z" });
    return { ...checkout, primary, publisher, outcomes, operations, fixture };
  } catch (error) { await checkout.cleanup(); throw error; }
}

