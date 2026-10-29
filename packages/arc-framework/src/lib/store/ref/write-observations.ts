/** Preserve native reference admission before interpreting observation reads as absence. */
import type { Store } from "../contract.js";
import type { RecordObservation } from "../write.js";
import type { StoreRefusal } from "../refusal.js";
import { checkRecordObservations } from "../record-observations.js";
import type { RefBackendContext } from "./context.js";
import { checkRefKey } from "./path-admission.js";
import { resolveReadReference } from "./read.js";

/** Compare admitted read-only evidence against the attempt's captured before-state. */
export async function checkRefObservations(context: RefBackendContext, before: Pick<Store, "read">,
  observations: readonly RecordObservation[]): Promise<StoreRefusal | undefined> {
  for (const { reference } of observations) {
    const invalid = checkRefKey(reference, context.registry, false);
    if (invalid) return invalid;
    if (reference.owner.type === "person") {
      const admitted = await resolveReadReference(context, reference);
      if (admitted.status === "refused") return admitted.refusal;
    }
  }
  const checked = await checkRecordObservations(before, observations);
  return checked.status === "refused" ? checked.refusal : undefined;
}
