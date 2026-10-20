/** Actual pending local review over checked portable facts and clone-local execution storage. */
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { createReviewCheckout } from "../helpers/store/review-checkout.js";
import { createLocalReviewPreparationFixture } from "./local-review-preparation.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";
import { NativeReviewInFlightStateStore } from "../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { RepositoryLocalReviewSourceStore } from "../../src/scripts/review-gate/hosts/local/source-store.js";

import type { DeliveryLocalReviewAdmission } from "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";

export async function nativeLocalReview(deliveryAdmission?: DeliveryLocalReviewAdmission) {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta(deliveryAdmission?.vehicle.workUnitId ?? "example"), checkout = await createReviewCheckout(h);
  try {
    const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
    const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
    const evidence = createReviewEvidencePort(h.store, primary.reference.owner);
    const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
    const operations = new NativeReviewInFlightStateStore({ publisher, workItem: primary.reference.owner,
      outcomes, evidence, decisions, projectId: h.projectId });
    const prepared = createLocalReviewPreparationFixture({ repositoryId: projectId });
    prepared.dependencies.operationStore = operations;
    prepared.dependencies.sourceStore = new RepositoryLocalReviewSourceStore(publisher);
    const result = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
      routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
        ownership: "self", surfaceAuthority: "ordinary" }, ...(deliveryAdmission === undefined
        ? { policyJudgment: { scopeMode: "whole-target" } } : { deliveryAdmission, memberHeadObjectId: deliveryAdmission.vehicle.head }) }, prepared.dependencies);
    const snapshot = await operations.readOperationSnapshot();
    if (result.state !== "ready" || snapshot.status !== "complete") throw new Error(JSON.stringify(result));
    const state = snapshot.records.find(record => record.state.kind === "local-review")?.state;
    if (state?.kind !== "local-review") throw new Error("Expected actual pending local producer");
    return { ...checkout, primary, publisher, outcomes, evidence, operations, prepared, state, result };
  } catch (error) { await checkout.cleanup(); throw error; }
}
