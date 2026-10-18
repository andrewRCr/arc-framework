/** Predict the lane consequence of proposed fixes from convergence and configured local coverage. */
import type { ProposedDispositionSet } from "../core/disposition-records.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ProvisionalFixConsequence } from "../core/provisional-pass-assessment.js";

/** Predict bounded local coverage only when the configured lane can run it. */
function errandNextPassCoverage(
  result: Exclude<ReviewResult, { kind: "frontline" }>,
  configuredSources: readonly string[],
  materialFix: boolean,
): "complete" | "incremental-when-proven" {
  return configuredSources.includes("delegated-agent") && (materialFix || result.requirement.retrigger === "incremental")
    ? "incremental-when-proven" : "complete";
}

/** What approving the proposal's fixes does to the lane subject that owns the reviewed result's pass progress. */
export function projectFixConsequence(input: {
  proposal: ProposedDispositionSet;
  result: ReviewResult;
  configuredSources: readonly string[];
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
    if (!input.belowCeiling) return { kind: "ceiling-decision" };
    const coverage = errand ? errandNextPassCoverage(result, input.configuredSources, input.materialFix)
      : convergedFixCheck ? "complete" : null;
    return { kind: "next-pass", coverage };
  }
  return result.kind === "frontline" || lineage.kind === "delivery-member"
    ? { kind: "lane-closes" }
    : { kind: "decided-at-fixed-head" };
}

