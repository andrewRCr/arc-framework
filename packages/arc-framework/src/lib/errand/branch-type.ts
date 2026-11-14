/**
 * The errand branch nature-type vocabulary.
 *
 * An errand branch is a projection of its identity record, so the prefix no
 * longer carries errand-ness — it is free to reflect the work's nature. The
 * admissible set is the `branch-format` method's type set **minus `feat`**: a
 * feature is spec-worthy, which makes it a work unit, never an errand. `chore`
 * is the default, preserving the pre-nature-typed behavior.
 *
 * The set is hard-coded here as the policy layer; reading a project's
 * `branch-format` override through a config-resolver is a forward-compat seam
 * (no code-readable projection of method overrides exists yet) — see the
 * customization-architecture work for the eventual projection.
 *
 * @module
 */

/** Branch nature-types an errand may carry — the `branch-format` set minus `feat`. */
export const ERRAND_BRANCH_TYPES = ["fix", "chore", "refactor", "hotfix"] as const;

/** One admissible errand branch nature-type. */
export type ErrandBranchType = (typeof ERRAND_BRANCH_TYPES)[number];

/** The default nature-type, applied when `open` is given no `--type`. */
export const DEFAULT_ERRAND_BRANCH_TYPE: ErrandBranchType = "chore";

/** Whether a string is an admissible errand branch nature-type. */
export function isErrandBranchType(value: string): value is ErrandBranchType {
  return (ERRAND_BRANCH_TYPES as readonly string[]).includes(value);
}

/** Eight lowercase hex characters after the slug, which keep two same-slug errands' branches apart. */
const BRANCH_SUFFIX = /^[0-9a-f]{8}$/u;

/**
 * The nature-type an errand branch names for its slug, as `<type>/<slug>` or `<type>/<slug>-<suffix>`.
 *
 * @param branch - The branch an errand record names.
 * @param slug - The errand's slug.
 * @returns The admitted type, or null when the branch takes neither form.
 */
export function errandBranchType(branch: string, slug: string): ErrandBranchType | null {
  const separator = branch.indexOf("/");
  if (separator < 0) return null;
  const type = branch.slice(0, separator), rest = branch.slice(separator + 1);
  if (!isErrandBranchType(type)) return null;
  if (rest === slug) return type;
  return rest.startsWith(`${slug}-`) && BRANCH_SUFFIX.test(rest.slice(slug.length + 1)) ? type : null;
}
