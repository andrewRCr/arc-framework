/** Reviewer-facing pointers that disclose no disposition rationale or lane verdict. */
import { currentApprovedDispositionNode, type ApprovedDispositionRecord } from "./advisory-records.js";

/** The earlier finding's locus and optional defect-class label, without response authority. */
export interface FixedFindingPointer { readonly locus: string; readonly title?: string; }

/** Select the information a complete reviewer may receive from approved lineage records. */
export function projectFixedFindingPointers(records: readonly ApprovedDispositionRecord[]): readonly FixedFindingPointer[] {
  return records.flatMap(record => currentApprovedDispositionNode(record).approvedDisposition.dispositionSet.findings
    .filter(finding => finding.sourceVerification === "verified" && finding.disposition === "fix")
    .map(finding => ({ locus: finding.locus, ...(finding.title === undefined ? {} : { title: finding.title }) })));
}
