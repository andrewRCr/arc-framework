/** Current work-branch selection over explicit repository-qualified lifecycle links. */
import type { BranchLink } from "./links.js";
import type { StoreRecord } from "./read.js";
/** Link selection preserves ambiguity rather than crossing repository authority. */
export type WorkBranchSelection = { kind: "linked"; link: BranchLink } | { kind: "none" }
  | { kind: "ambiguous"; reason: string };
/** Select the holding checkout's linked branch, or the final link in the current repository.
 * @param record - Primary links, whose keyed writes preserve insertion order.
 * @param input - Current repository and optional holder branch.
 * @returns Link, absence, or repository/canonical-name ambiguity.
 */
export function selectWorkBranchLink(record: Pick<StoreRecord, "links">,
  input: { repository?: string; currentBranch?: string | null } = {}): WorkBranchSelection {
  const links = (record.links?.branches ?? []).filter((link) => input.repository === undefined || link.repository === input.repository);
  if (links.length === 0) return { kind: "none" };
  if (new Set(links.map((link) => link.repository)).size > 1) return { kind: "ambiguous", reason: "Branch links span repositories; resolve the current project identity before selecting its work branch." };
  if (new Set(links.map((link) => workBranchName(link.ref))).size !== links.length) return { kind: "ambiguous", reason: "Branch links contain duplicate canonical local refs; repair the links before selecting a work branch." };
  const current = input.currentBranch;
  const matches = current === undefined || current === null ? [] : links.filter((link) => workBranchName(link.ref) === workBranchName(current));
  if (current !== undefined && matches.length === 0) return { kind: "ambiguous", reason: "The holding checkout is detached or its branch is not linked to this work unit; inspect its branch and links before continuing." };
  if (matches.length > 1) return { kind: "ambiguous", reason: "More than one canonical link names the holding checkout's branch." };
  // Promotion appends its work branch after the retained Errand branch, and
  // keyed lifecycle link updates preserve that order. The final link is thus
  // the current work branch where no holding checkout supplies a stronger fact.
  const selected = matches[0] ?? links.at(-1);
  return selected === undefined ? { kind: "none" } : { kind: "linked", link: selected };
}
/** Normalize an explicit local branch ref for Git's branch-name/refspec seams.
 * @param ref - Stored local branch name or fully qualified heads ref.
 * @returns Local branch name.
 */
export function workBranchName(ref: string): string { return ref.replace(/^refs\/heads\//u, ""); }
