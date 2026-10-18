/** Shared roots of the editable operational-state projection. */

import { posix } from "node:path";

import { SlugSchema } from "../kernel/index.js";

/** Lifecycle roots, also used to recognize movable artifact targets. */
export const PROJECTED_LIFECYCLE_ROOTS = [".arc/active", ".arc/backlog", ".arc/completed"] as const;

/** Container whose slug-named children are personal projection roots. */
export const PROJECTED_PERSONAL_ROOT = ".arc/user";

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
