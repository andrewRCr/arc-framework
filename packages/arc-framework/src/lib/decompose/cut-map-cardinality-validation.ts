/** Destination counts and substantive extraction ownership. */
import type { CutMap } from "./cut-map-schema.js";
import type { CutMapIssue } from "./cut-map-issues.js";

/** Require the new/existing destination counts promised by the authored shape. */
export function cutShapeCardinalityIssue({ authoring }: CutMap): CutMapIssue | null {
  const newCount = authoring.destinations.filter(({ kind }) => kind === "new-member").length;
  const existingCount = authoring.destinations.filter(({ kind }) => kind === "existing-home").length;
  const messages = {
    symmetric: "A symmetric map needs at least two new members and no existing home.",
    heterogeneous: "A heterogeneous map needs at least one new member and one existing home.",
    extraction: "An extraction map needs at least one new member.",
  };
  const invalid = authoring.shape === "symmetric" ? newCount < 2 || existingCount !== 0
    : authoring.shape === "heterogeneous" ? newCount < 1 || existingCount < 1 : newCount < 1;
  return invalid ? { code: "shape-cardinality", path: "authoring.shape", message: messages[authoring.shape] } : null;
}

/** Require the placement's member count, excluding a surviving origin. */
export function cutPlacementCardinalityIssue({ authoring }: CutMap): CutMapIssue | null {
  const newCount = authoring.destinations.filter(({ kind }) => kind === "new-member").length;
  if (authoring.placement.kind === "direct-member") return newCount === 1 ? null : {
    code: "placement-cardinality", path: "authoring.placement", message: "Direct-member placement requires exactly one new member.",
  };
  const extraction = authoring.shape === "extraction";
  return newCount >= (extraction ? 1 : 2) ? null : {
    code: "placement-cardinality", path: "authoring.placement", message: extraction
      ? "Extraction cohort placement requires at least one new member."
      : "Multiple-member placement requires at least two new members.",
  };
}

/** Require each extracted new member to own at least one source unit. */
export function cutDestinationCoverageIssue({ authoring }: CutMap): CutMapIssue | null {
  if (authoring.shape !== "extraction") return null;
  const covered = new Set(authoring.sourceAllocations.flatMap(({ ownership, disposition }) =>
    ownership === "destination-owned" && disposition.kind === "target" ? [disposition.destinationId] : []));
  const index = authoring.destinations.findIndex(destination =>
    destination.kind === "new-member" && !covered.has(destination.destinationId));
  return index < 0 ? null : {
    code: "destination-coverage", path: `authoring.destinations.${index}`,
    message: "Every extracted new member must own at least one destination-owned source unit.",
  };
}
