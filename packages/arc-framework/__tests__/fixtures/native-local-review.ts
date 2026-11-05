/** Actual pending local review over checked portable facts and clone-local execution storage. */
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { createReviewCheckout } from "../helpers/store/review-checkout.js";
import { createLocalReviewPreparationFixture } from "./local-review-preparation.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";
import { createReviewResponsePort } from "../../src/lib/store/kinds/review/evidence-root-selection/responses.js";
import { NativeReviewInFlightStateStore } from "../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { RepositoryLocalReviewSourceStore } from "../../src/scripts/review-gate/hosts/local/source-store.js";

import type { DeliveryLocalReviewAdmission } from "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import type { TransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import type { CandidateManagedRecordV1 } from "../../src/lib/work-unit/candidate-attestation.js";

export async function nativeLocalReview(deliveryAdmission?: DeliveryLocalReviewAdmission, candidate?: CandidateManagedRecordV1,
  errand?: Extract<TransientIdentityRecord, { kind: "errand" }>) {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = errand === undefined ? await h.seedMeta(deliveryAdmission?.vehicle.workUnitId ?? "example")
    : await h.seedErrand(errand);
  const checkout = await createReviewCheckout(h);
  try {
    const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
    const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
    const evidence = createReviewEvidencePort(h.store, primary.reference.owner);
    const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
    const responses = createReviewResponsePort(h.store, primary.reference.owner);
    const operations = new NativeReviewInFlightStateStore({ publisher, workItem: primary.reference.owner,
      outcomes, evidence, decisions, responses, projectId: h.projectId });
    const prepared = createLocalReviewPreparationFixture({ repositoryId: projectId });
    if (candidate !== undefined) {
      await h.seedCandidate(primary.reference.owner, candidate);
      const vehicle = { kind: "work-unit" as const, identity: "example" };
      const resolveAuthority = prepared.dependencies.resolveAuthority;
      prepared.dependencies.resolveAuthority = async (...args) => {
        const resolved = await resolveAuthority(...args);
        return { ...resolved, authority: { ...resolved.authority, vehicle } };
      };
      prepared.dependencies.resolveVehicle = async () => ({ vehicle, authorIdentity: "author-1", member: null });
      prepared.dependencies.resolveLineage = async () => ({ kind: "candidate", candidateId: candidate.attestation.candidateId });
    }
    if (errand !== undefined) {
      await checkout.occupy(errand.branch, { kind: "errand", slug: errand.slug, claimId: errand.claimId });
      const vehicle = { kind: "errand" as const, identity: errand.slug, claimId: errand.claimId };
      const resolveAuthority = prepared.dependencies.resolveAuthority;
      prepared.dependencies.resolveAuthority = async (...args) => {
        const resolved = await resolveAuthority(...args);
        return { ...resolved, authority: { ...resolved.authority, vehicle } };
      };
      prepared.dependencies.resolveVehicle = async () => ({ vehicle, authorIdentity: "author-1", member: null });
      prepared.dependencies.resolveLineage = async (_vehicle, headSha) => ({ kind: "head-bound", vehicleKind: "errand",
        vehicleIdentity: errand.claimId, headSha });
      prepared.dependencies.composeAssurance = async () => ({ ...await prepared.composeAssurance(),
        assurance: { workContext: "errand", workClass: "none" } });
    }
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
    return { ...checkout, primary, publisher, outcomes, evidence, responses, operations, prepared, state, result };
  } catch (error) { await checkout.cleanup(); throw error; }
}
