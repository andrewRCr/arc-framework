/** Exact destination settings acknowledged by a completed projection layout. */
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";

/** Keep a work-unit UID separate from the slug consumed by layout and path identification. */
export function projectionSettings(root: Pick<ProjectionRootState, "identity" | "view" | "claim" | "claimUid" | "layoutActive">): ProjectionIndex["projectedUnder"] {
  return { identity: root.identity, view: root.view, claim: root.claim, layoutActive: root.layoutActive,
    ...(root.claimUid === undefined ? {} : { claimUid: root.claimUid }) };
}
