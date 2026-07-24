/**
 * Canonical member-placement projection for decomposition.
 *
 * The validated cut-map carries placement intent; this module converts that
 * intent into the physical layout address shared by scaffolding and retirement.
 */

import { SlugSchema, type Slug } from "../kernel/index.js";
import type { WorkUnitPlacement } from "../layout/index.js";
import type { ParentPosition } from "./decompose-cut-map.js";

/** The planned-backlog placement every new decomposition member occupies. */
export type DecomposeMemberPlacement = Extract<WorkUnitPlacement, { kind: "backlog" }> & {
  commitment: "planned";
};

/** Result of projecting a validated cut into one physical member placement. */
export type DecomposeMemberPlacementResult =
  | { status: "resolved"; placement: DecomposeMemberPlacement }
  | { status: "refused"; reason: string };

function cohortSegments(value: string): Slug[] | null {
  const segments = value.split("/");
  const parsed = segments.map((segment) => SlugSchema.safeParse(segment));
  return parsed.every((result) => result.success)
    ? parsed.map((result) => (result as { success: true; data: Slug }).data)
    : null;
}

/**
 * Resolve a cut-map placement through the canonical work-unit layout.
 *
 * @param cut - Placement fields from a validated decompose allocation map.
 * @param originCohort - Existing origin membership used only by `at-cap`.
 * @returns A planned placement or an explicit missing/invalid-authority refusal.
 */
export function resolveDecomposeMemberPlacement(
  cut: { parentPosition: ParentPosition; cohort?: string },
  originCohort: string | null | undefined,
): DecomposeMemberPlacementResult {
  if (cut.parentPosition === "cohortless") {
    return {
      status: "resolved",
      placement: { kind: "backlog", commitment: "planned", cohort: [] },
    };
  }

  const cohort = cut.parentPosition === "at-cap" ? originCohort : cut.cohort;
  if (cohort === undefined || cohort === null || cohort === "") {
    const source = cut.parentPosition === "at-cap" ? "origin cohort" : "declared cohort";
    return {
      status: "refused",
      reason: `${cut.parentPosition} decomposition requires a valid ${source} placement.`,
    };
  }
  const segments = cohortSegments(cohort);
  if (segments === null || segments.length === 0 || segments.length > 2) {
    return {
      status: "refused",
      reason: `${cut.parentPosition} decomposition carries an invalid cohort placement.`,
    };
  }
  return {
    status: "resolved",
    placement: { kind: "backlog", commitment: "planned", cohort: segments },
  };
}
