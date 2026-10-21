/** Resolve exact native member decisions and prepare their existing Owner acceptance. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import type { NativeReviewFactPorts, ReviewInFlightPort } from "../core/ports.js";
import type { DeliveryReviewTerminusAcceptanceDependencies } from "../policy/delivery-review-terminus.js";
import { DeliveryReviewMemberTerminusSchema, ResolvedDeliveryReviewMemberTerminusSchema, type ResolvedDeliveryReviewMemberTerminus } from "../policy/review-terminus.js";
import type { PublishedIntegrationBoundaryLocus } from "../policy/integration-boundary-locus.js";
import { createReviewCompositionContext } from "./composition-context.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveNativeReviewTerminus } from "./native-terminus.js";
import { prepareNativeReviewTerminus } from "./native-terminus-write.js";

function memberSubject(vehicle: DeliveryReviewMemberVehicle) {
  const { head, ...lineage } = vehicle;
  return { lineage, headSha: head, subjectDigest: null };
}

/** Resolve an exact boundary entry without changing its author, pass-count basis, or member reach. */
export async function resolveNativeMemberTerminus(facts: Pick<NativeReviewFactPorts, "decisions">,
  entry: { vehicle: DeliveryReviewMemberVehicle; terminus: CanonicalDigest }): Promise<ResolvedDeliveryReviewMemberTerminus> {
  const terminus = await resolveNativeReviewTerminus({ facts, subject: memberSubject(entry.vehicle), decisionKey: entry.terminus });
  if (terminus === undefined) throw new Error("Restore the retained native member terminus and re-run review status.");
  return ResolvedDeliveryReviewMemberTerminusSchema.parse({ vehicle: entry.vehicle, terminus });
}

/** Open member fact ports lazily after the default acceptance handler binds its named owner. */
export function createNativeMemberTerminusBindings(invocation: () => ReviewInvocationInput): Pick<
  DeliveryReviewTerminusAcceptanceDependencies, "readNativeMemberTerminus" | "prepareNativeMemberTerminus"
> {
  const facts = () => {
    const native = createReviewCompositionContext(invocation()).family.ports.inFlight.nativeFacts;
    if (native === undefined) throw new Error("Restore the selected native review facts and re-run member review status.");
    return native;
  };
  return { readNativeMemberTerminus: entry => resolveNativeMemberTerminus(facts(), entry),
    prepareNativeMemberTerminus: record => prepareNativeReviewTerminus({ facts: facts(), subject: memberSubject(record.vehicle),
      acceptedBy: record.terminus.acceptedBy, completedPasses: record.terminus.completedPasses, now: new Date().toISOString() }) };
}

/** Resolve a boundary's member authorities through its selected backend before pure discharge policy. */
export async function readStoredDeliveryReviewMemberTermini(boundary: PublishedIntegrationBoundaryLocus,
  store: ReviewInFlightPort): Promise<readonly ResolvedDeliveryReviewMemberTerminus[]> {
  if (boundary.schemaVersion === 1) return DeliveryReviewMemberTerminusSchema.array().parse(boundary.deliveryReviewTermini);
  if (boundary.deliveryReviewTermini.length === 0) return [];
  if (store.stateOffBranch !== true || store.nativeFacts === undefined) {
    throw new Error("Restore the selected native review facts and re-run member review status.");
  }
  const facts = store.nativeFacts;
  return Promise.all(boundary.deliveryReviewTermini.map(entry => resolveNativeMemberTerminus(facts, entry)));
}
