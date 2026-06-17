/**
 * Work-unit slug validation — the path-safe identity invariant shared by every
 * verb that interpolates a work-unit name into a filesystem path.
 *
 * A slug is one or more lowercase-alphanumeric segments joined by single
 * hyphens. Enforcing it where a name becomes a path keeps a crafted value
 * (path separators, `..` dot-segments) from escaping the artifact root, and
 * keeps the work-unit identity portable as a storage key independent of where
 * the artifacts physically live.
 */

/** The path-safe work-unit slug pattern. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when `name` is a path-safe work-unit slug. */
export function isSlugSafe(name: string): boolean {
  return SLUG_PATTERN.test(name);
}
