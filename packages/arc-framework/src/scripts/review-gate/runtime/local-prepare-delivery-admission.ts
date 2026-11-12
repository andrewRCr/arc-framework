/** Validate the retained reservation and exact local delivery admission before fresh preparation. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { readSubmissionBoundaryVersioned } from "../../../lib/store/kinds/review/integration-boundary/access.js";
import { resolveReviewStatus } from "../status.js";
import { createReviewStatusPort } from "../status-composition.js";
import { projectDeliveryLocalReviewAdmissionIdentity, type DeliveryLocalReviewAdmission } from "../policy/delivery-local-review-admission.js";
import type { StandardReviewObligationProjection } from "../policy/standard-review-projection-schema.js";
import type { LocalReviewInvocationInput } from "./local-review-invocation.js";

/** Require the exact driver admission and retain its reservation version across the observation. */
export async function validateLocalDeliveryAdmission(input: LocalReviewInvocationInput,
  admission: DeliveryLocalReviewAdmission): Promise<StandardReviewObligationProjection> {
  const before = await readSubmissionBoundaryVersioned(input.cwd, admission.vehicle.workUnitId, { store: input.store, owner: input.workItem });
  const reservation = before.boundary?.reservation;
  if (reservation === null || reservation === undefined
    || reservation.target.kind !== "delivery"
    || reservation.target.workUnitId !== admission.vehicle.workUnitId
    || reservation.target.planId !== admission.vehicle.planId
    || !reservation.sources.includes(admission.sourceId)) {
    throw new Error("Local delivery-member review has no matching standard-review reservation.");
  }
  const current = await resolveReviewStatus({
    target: admission.statusTarget,
    ...(admission.ceilingOverride === undefined
      ? {}
      : { ceilingOverride: admission.ceilingOverride }),
    ...(admission.additionalPassAuthorization === undefined ? {}
      : { additionalPassAuthorization: admission.additionalPassAuthorization }),
    coverage: admission.requestedCoverage,
    sourceId: admission.sourceId,
  }, createReviewStatusPort(input));
  if (current.nextAction !== "review-local-prepare"
    || canonicalize(projectDeliveryLocalReviewAdmissionIdentity(current.action))
      !== canonicalize(projectDeliveryLocalReviewAdmissionIdentity(admission))) {
    throw new Error("Local delivery-member review no longer has exact driver admission.");
  }
  const after = await readSubmissionBoundaryVersioned(input.cwd, admission.vehicle.workUnitId, { store: input.store, owner: input.workItem });
  if (after.version !== before.version) {
    throw new Error("Local delivery-member review authority changed during admission validation.");
  }
  return reservation.obligation;
}
