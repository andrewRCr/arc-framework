/** Shared roots of the editable operational-state projection. */

import { posix } from "node:path";

import { SlugSchema, type Slug } from "../kernel/index.js";

/** Lifecycle roots, also used to recognize movable artifact targets. */
export const PROJECTED_LIFECYCLE_ROOTS = [".arc/active", ".arc/backlog", ".arc/completed"] as const;

/** Container whose slug-named children are personal projection roots. */
export const PROJECTED_PERSONAL_ROOT = ".arc/user";

/** Directory pattern ignoring each lifecycle root. */
export const PROJECTED_LIFECYCLE_PATTERNS: readonly string[] = PROJECTED_LIFECYCLE_ROOTS.map((root) => `${root}/`);

/** Directory pattern ignoring every identity's personal root, and never their shared container alone. */
const PROJECTED_PERSONAL_PATTERN = `${PROJECTED_PERSONAL_ROOT}/*/`;

/**
 * Each projected root as the path it holds for one identity: the lifecycle roots and that identity's personal root.
 * @param identity - The checkout's identity.
 * @returns Repository-relative root paths, without a trailing slash.
 */
export function projectedRootPaths(identity: Slug): readonly string[] {
  return [...PROJECTED_LIFECYCLE_ROOTS, `${PROJECTED_PERSONAL_ROOT}/${identity}`];
}

/**
 * Each projected root as the directory pattern that ignores it for every identity.
 * @returns Git ignore patterns, each with its trailing slash.
 */
export function projectedRootPatterns(): readonly string[] {
  return [...PROJECTED_LIFECYCLE_PATTERNS, PROJECTED_PERSONAL_PATTERN];
}

/** Whether a repository-relative path belongs to projected state. */
export function isProjectedPath(path: string): boolean {
  if (isProjectedLifecyclePath(path)) return true;
  const normalized = posix.normalize(path);
  const prefix = `${PROJECTED_PERSONAL_ROOT}/`;
  if (!normalized.startsWith(prefix)) return false;
  return SlugSchema.safeParse(normalized.slice(prefix.length).split("/")[0]).success;
}

/** Whether a repository-relative path belongs to a lifecycle projection root. */
export function isProjectedLifecyclePath(path: string): boolean {
  const normalized = posix.normalize(path).replace(/\/$/, "");
  return PROJECTED_LIFECYCLE_ROOTS.some(root => normalized === root || normalized.startsWith(`${root}/`));
}
