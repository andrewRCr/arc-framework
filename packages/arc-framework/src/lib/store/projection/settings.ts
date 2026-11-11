/** Exact destination settings acknowledged by a completed projection layout. */
import { isDeepStrictEqual } from "node:util";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";

/** Keep a work-unit UID separate from the slug consumed by layout and path identification. */
export function projectionSettings(root: Pick<ProjectionRootState, "identity" | "view" | "claim" | "claimUid" | "layoutActive">): ProjectionIndex["projectedUnder"] {
  return { identity: root.identity, view: root.view, claim: root.claim, layoutActive: root.layoutActive,
    ...(root.claimUid === undefined ? {} : { claimUid: root.claimUid }) };
}

/** A retained retry flag or changed destination settings requires a layout reconciliation. */
export function needsProjectionReprojection(root: ProjectionRootState, index: ProjectionIndex): boolean {
  return index.reprojectionPending === true || !isDeepStrictEqual(index.projectedUnder, projectionSettings(root));
}
