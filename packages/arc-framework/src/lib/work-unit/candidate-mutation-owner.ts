/** Candidate mutation ownership projected from the entering checkout's derived locus frame. */

import type { DerivedLocusFrame } from "../locus/derived-reader.js";

export type CandidateMutationOwner =
  | { readonly status: "owned"; readonly workUnit: string }
  | { readonly status: "unowned" }
  | { readonly status: "unavailable" };

/**
 * Project whether the entering checkout may own Candidate mutation.
 *
 * @param frame - Fresh worktree-derived entering-checkout authority
 * @returns One exact work-unit owner, a free-primary continuation, or refusal
 */
export function projectCandidateMutationOwner(frame: DerivedLocusFrame): CandidateMutationOwner {
  if (frame.entering.kind !== "selected") return { status: "unavailable" };
  const row = frame.entering.row;
  if (row.kind === "free-primary") return { status: "unowned" };
  if (
    row.kind === "unresolved-checkout"
    && row.checkout.primary
    && row.subject === null
    && row.diagnostics.length > 0
    && row.diagnostics.every(({ code }) => code === "primary-safety-unproven")
  ) {
    return { status: "unowned" };
  }
  if (
    frame.active !== null
    && frame.active.checkoutPath === row.checkout.path
  ) {
    return { status: "owned", workUnit: frame.active.subject.key };
  }
  if (
    row.kind === "retired"
    && row.subject.kind === "work-unit"
    && row.context !== null
  ) {
    return { status: "owned", workUnit: row.subject.key };
  }
  if (
    row.kind === "unresolved-checkout"
    && row.subject?.kind === "work-unit"
    && row.diagnostics.length > 0
    && row.diagnostics.every(({ code }) => code === "subject-unresolved")
  ) {
    return { status: "owned", workUnit: row.subject.key };
  }
  return { status: "unavailable" };
}
