/** Typed branch marks and the late-change ranges retained until confirmation. */
/** One local or host branch observation, held by a Git ref. */
export interface WindowComparisonMark { branch: string; side: "local" | "origin"; kind: "compared" | "gone"; tip: string; recorded: string | null; base: string }
/** A late change that the Owner must reapply and confirm at its held tip. */
export interface WindowComparisonRange { branch: string; side: "local" | "origin"; kind: "moved" | "gone" | "unrecorded"; from: string; tip: string }
/** Classify a mark without consulting a branch's later current tip. */
export function windowComparisonRange(mark: WindowComparisonMark): WindowComparisonRange | null {
  if (mark.kind === "compared" && mark.recorded === mark.tip) return null;
  return { branch: mark.branch, side: mark.side, kind: mark.kind === "gone" ? "gone" : mark.recorded === null ? "unrecorded" : "moved",
    from: mark.base, tip: mark.tip };
}
