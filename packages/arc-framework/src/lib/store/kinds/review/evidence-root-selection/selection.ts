/** Effective approved authority chosen from a complete validated producer inventory. */
import type { OwnerIdentity } from "../../../identity.js";
import type { ReviewEvidence } from "../evidence/schema.js";
import type { ReviewOutcome } from "../outcome/schema.js";
import { canonicalize } from "../../../../kernel/index.js";
import { reviewEvidenceLineageRefusal } from "../evidence/composed-record.js";
import { reviewOutcomeKey } from "../outcome/key.js";
import { reviewOutcomeResultDigest } from "../outcome/result.js";
import type { ReviewEvidenceRootSelection } from "./schema.js";
import { reviewEvidenceBranches } from "./lineage.js";
import { reviewRootSelectionPreviewRemedy, reviewRootSelectionRefusal, reviewRootSelectionRestoreRemedy } from "./remedy.js";

/** Return only the effective branch, refusing ambiguous or invalid authority. */
export function selectReviewEvidenceBranch(owner: OwnerIdentity, outcome: ReviewOutcome,
  evidence: readonly ReviewEvidence[], selection: ReviewEvidenceRootSelection | null): ReviewEvidence[] {
  const branches = reviewEvidenceBranches(outcome, evidence);
  if (selection === null) {
    if (branches.length > 1) throw reviewEvidenceLineageRefusal(evidence, "root",
      reviewRootSelectionPreviewRemedy(owner, outcome.attemptId));
    return branches[0] ?? [];
  }
  if (selection.producerId !== outcome.attemptId || selection.outcomeKey !== reviewOutcomeKey(outcome)
    || selection.resultDigest !== reviewOutcomeResultDigest(outcome)) throw reviewRootSelectionRefusal(owner, outcome.attemptId,
      "binding", "The selector does not bind this exact immutable producer result.", reviewRootSelectionRestoreRemedy(owner, outcome.attemptId));
  const roots = branches.map(branch => branch[0]?.dispositionSet.dispositionSetId);
  if (canonicalize(roots) !== canonicalize(selection.roots)) throw reviewRootSelectionRefusal(owner, outcome.attemptId,
    "inventory", "The complete approved root inventory differs from the recorded choice. Restore missing history before preview if a root disappeared.");
  const selected = branches.find(branch => branch[0]?.dispositionSet.dispositionSetId === selection.selectedRoot);
  if (selected === undefined || !eligibleReviewEvidenceRoots(branches).includes(selection.selectedRoot)) {
    throw reviewRootSelectionRefusal(owner, outcome.attemptId, "policy",
      "The choice excludes performed or settled work. This repair cannot reconcile effects on multiple branches.");
  }
  return selected;
}

/** Choices that exclude no node with performed work or settlement, even an empty settlement. */
export function eligibleReviewEvidenceRoots(branches: readonly (readonly ReviewEvidence[])[]): ReviewEvidence["dispositionSet"]["dispositionSetId"][] {
  return branches.flatMap((branch, index) => {
    const root = branch[0]?.dispositionSet.dispositionSetId;
    return root !== undefined && branches.every((other, otherIndex) => index === otherIndex
      || other.every(value => value.performance === undefined && value.settlement === undefined)) ? [root] : [];
  });
}
