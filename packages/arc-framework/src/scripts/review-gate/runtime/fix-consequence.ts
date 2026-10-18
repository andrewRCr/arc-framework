/** Predict the lane consequence of proposed fixes from convergence and configured local coverage. */
import type { ProposedDispositionSet } from "../core/disposition-records.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ProvisionalFixConsequence } from "../core/provisional-pass-assessment.js";

function nextPassCoverage(
  input: Parameters<typeof projectFixConsequence>[0], errand: boolean, convergedFixCheck: boolean,
): Extract<ProvisionalFixConsequence, { kind: "next-pass" }>["coverage"] {
  if (input.result.kind !== "frontline" && input.chainAdequate && input.delegatedAgentSelectable
    && (input.materialFix || (errand && input.result.requirement.retrigger === "incremental"))) {
    return "incremental-when-proven";
  }
  return errand || convergedFixCheck ? "complete" : null;
}

/** What approving the proposal's fixes does to the lane subject that owns the reviewed result's pass progress. */
export function projectFixConsequence(input: {
  proposal: ProposedDispositionSet;
  result: ReviewResult;
  chainAdequate: boolean;
  delegatedAgentSelectable: boolean;
  materialFix: boolean;
  belowCeiling: boolean;
}): ProvisionalFixConsequence {
  if (!input.proposal.dispositionSet.findings.some((finding) => finding.disposition === "fix")) {
    return { kind: "no-fix" };
  }
  const { result } = input;
  const lineage = result.admission.lineage;
  // An Errand's standard progress is bound to its head, so every fixed head starts unreviewed.
  const errand = result.kind !== "frontline" && lineage.kind === "head-bound" && lineage.vehicleKind === "errand";
  const convergedFixCheck = !input.materialFix && result.kind !== "frontline"
    && lineage.kind === "delivery-member" && result.requirement.retrigger === "full-final"
    && result.admission.effectiveCoverage === "incremental";
  if (input.materialFix || errand || convergedFixCheck) {
    const coverage = nextPassCoverage(input, errand, convergedFixCheck);
    if (!input.belowCeiling && coverage !== "incremental-when-proven") return { kind: "ceiling-decision" };
    return { kind: "next-pass", coverage };
  }
  return result.kind === "frontline" || lineage.kind === "delivery-member"
    ? { kind: "lane-closes" }
    : { kind: "decided-at-fixed-head" };
}

