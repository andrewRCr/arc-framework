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

import { randomBytes } from "node:crypto";

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
 * Mint the suffix that keeps two same-slug errands from different clones off one remote branch.
 *
 * @returns Eight lowercase hex characters.
 */
export function mintErrandBranchSuffix(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Name an errand's branch from its type and slug, with the suffix where one was minted.
 *
 * @param type - The branch nature-type.
 * @param slug - The errand's slug.
 * @param suffix - The minted suffix, or none.
 * @returns `<type>/<slug>`, or `<type>/<slug>-<suffix>`.
 */
export function errandBranch(type: ErrandBranchType, slug: string, suffix?: string): string {
  return suffix === undefined ? `${type}/${slug}` : `${type}/${slug}-${suffix}`;
}

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

/**
 * The slug a suffixed errand branch carries, read from the branch alone.
 *
 * @param branch - A branch that may take the form `<type>/<slug>-<suffix>`.
 * @returns The slug before the suffix, or null when the branch is not a suffixed errand branch.
 */
export function suffixedErrandBranchSlug(branch: string): string | null {
  const separator = branch.indexOf("/");
  if (separator < 0 || !isErrandBranchType(branch.slice(0, separator))) return null;
  const rest = branch.slice(separator + 1), cut = rest.length - 9;
  return cut > 0 && rest[cut] === "-" && BRANCH_SUFFIX.test(rest.slice(cut + 1)) ? rest.slice(0, cut) : null;
}
