/** Pure work-unit slug normalization for branches and completed artifact paths. */

import { identifyWorkUnitArtifactPath } from "../layout/index.js";

/**
 * Identify an exact completed metadata path as an external-target slug.
 *
 * @param path - Repository-relative path from an already-read tree.
 * @returns The completed work-unit slug, or `null` when the path is ineligible.
 */
export function completedWorkUnitMetaSlug(path: string): string | null {
  const identified = identifyWorkUnitArtifactPath(path);
  return identified?.placement.kind === "completed" && identified.artifact === "meta"
    ? identified.slug
    : null;
}

/**
 * Strip a branch's type-prefix to its WU-name slug. A WU branch is
 * `<type>/<slug>` (`feat/foo`, `plan/foo`); the slug is everything after the
 * first `/`. A branch with no `/` (e.g. `main`) carries no WU and returns
 * `null`.
 *
 * @param branch - Branch short-name
 * @returns The WU-name slug, or `null` when the branch is not a WU branch
 */
export function branchToWorkUnitSlug(branch: string): string | null {
  if (branch.startsWith("delivery/")) return null;
  const slash = branch.indexOf("/");
  if (slash === -1) return null;
  const slug = branch.slice(slash + 1);
  return slug === "" ? null : slug;
}

