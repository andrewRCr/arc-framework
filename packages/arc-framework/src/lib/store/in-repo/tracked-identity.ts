/** Admission for owner identities supported by the tracked substrate. */
import type { OwnerIdentity } from "../identity.js";
import { unsupported } from "./refusals.js";

/** Refuse a generation UID that tracked records never established.
 * @param owner - Requested record owner.
 * @returns Nothing for the supported name-qualified identity.
 */
export function admitTrackedOwner(owner: OwnerIdentity): void {
  if (owner.type !== "person" && owner.uid !== undefined) unsupported("rename",
    "This tracked layout stores no owner generation UIDs.",
    "Resolve the supported name-qualified identity through lookup without a UID, or use a backend that serves UIDs.");
}
