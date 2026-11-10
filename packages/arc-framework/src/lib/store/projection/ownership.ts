/** Decide whether a checkout without an index should materialize a projection. */
import type { ProjectionLocation } from "./location.js";
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../../git/worktree-marker.js";

/** Read the checkout's current projection eligibility; an existing index is handled independently. */
export async function checkoutHoldsProjection(checkout: string, location: ProjectionLocation): Promise<boolean> {
  if (location.primary) return true;
  const read = await readWorktreeMarker(checkout);
  if (read.kind !== "present" || read.marker.husk !== undefined) return false;
  const ownership = decodeWorktreeMarkerOwnership(read.marker);
  return ownership.kind === "current" && (ownership.subject.kind === "work-unit"
    || (ownership.subject.kind !== "branch" && ownership.provisioning === "ready"));
}
