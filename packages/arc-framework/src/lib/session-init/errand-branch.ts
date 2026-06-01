/**
 * Errand-branch identity — the `chore/<slug>` convention shared by the
 * session-init errand probes (resume detection, in-flight sweep, materialize).
 *
 * An errand is execution-only: its branch is the only durable artifact, so the
 * branch name is the errand's identity and `<slug>` is its key. This module is
 * the single definition of the prefix and the slug extraction, keeping the
 * probes that consume it consistent.
 *
 * @module
 */

/** Branch prefix marking an execution-only errand. */
export const ERRAND_BRANCH_PREFIX = "chore/";

/**
 * Extract the errand slug — the `<slug>` after `chore/`.
 *
 * @param branch - A branch name, or `null` for a detached HEAD.
 * @returns The slug, or `null` when the branch is not a non-empty errand branch.
 */
export function errandSlugOf(branch: string | null): string | null {
  if (branch === null || !branch.startsWith(ERRAND_BRANCH_PREFIX)) return null;
  const slug = branch.slice(ERRAND_BRANCH_PREFIX.length);
  return slug === "" ? null : slug;
}
