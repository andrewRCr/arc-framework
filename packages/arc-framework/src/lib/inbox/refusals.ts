/** Lossless service refusals composed from store evidence. */
import type { StoreRefusal } from "../store/refusal.js";
import type { InboxRefusal } from "./types.js";
/** Preserve a backend's refusal as the provenance of a service refusal.
 * @param refusal - Store refusal.
 * @returns Lossless condition and remedy with original evidence.
 */
export function withProvenance(refusal: StoreRefusal): InboxRefusal { return { ...refusal, provenance: refusal }; }
/** Construct a named service refusal.
 * @param code - Stable failure class.
 * @param condition - Evidence stopping the operation.
 * @param remedy - Repair or valid continuation.
 * @param provenance - Underlying completeness or refusal evidence.
 * @returns A refused outcome.
 */
export function failure(code: string, condition: string, remedy: string, provenance?: InboxRefusal["provenance"]): { status: "refused"; refusal: InboxRefusal } {
  return { status: "refused", refusal: { code, condition, remedy: { text: remedy }, ...(provenance === undefined ? {} : { provenance }) } };
}
