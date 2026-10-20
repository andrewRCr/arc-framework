/** Select live ordinary decisions by their original binding and logical-pass reach. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import type { ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import type { NativeExtraPassInput } from "./native-extra-pass.js";

/** Collect explicit withdrawals without treating them as a new grant. */
export function withdrawnExtraPassKeys(decisions: readonly ReviewDecision[]): Set<CanonicalDigest> {
  return new Set(decisions.flatMap(value => value.choice.kind === "withdrawal" ? [value.choice.decisionKey] : []));
}

function reaches(value: ReviewDecision, input: NativeExtraPassInput): boolean {
  const choice = value.choice;
  if (value.lane !== input.lane || !laneSubjectOwnerMatches(value.subject.lineage, input.subject.lineage)
    || choice.kind !== "extra-pass" || choice.precondition.kind === "approved-fix") return false;
  const { precondition } = choice, binding = precondition.targetBinding;
  if (binding.kind === "policy-target") {
    const matchesRepository = precondition.kind === "ceiling" ? binding.repository === input.policyTarget.repository
      : binding.repository.toLowerCase() === input.policyTarget.repository.toLowerCase();
    if (!matchesRepository || binding.pullRequest !== input.policyTarget.pullRequest) return false;
  }
  if (precondition.kind === "additional") return choice.passCount === input.completedPasses
    && value.subject.headSha !== null && value.subject.headSha === input.subject.headSha;
  if (input.completedPasses !== choice.passCount && input.completedPasses !== choice.passCount + 1) return false;
  return value.lane === "standard" && value.subject.lineage.kind === "candidate"
    || value.subject.headSha === input.subject.headSha;
}

function compareNewest(left: ReviewDecision, right: ReviewDecision): number {
  const a = left.decidedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(left.decidedAt);
  const b = right.decidedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(right.decidedAt);
  if (a !== b) return a < b ? 1 : -1;
  const keyA = reviewDecisionKey(left), keyB = reviewDecisionKey(right);
  return keyA === keyB ? 0 : keyA < keyB ? 1 : -1;
}

/** Return the newest non-withdrawn grants within this invocation's reach, excluding unrelated decisions. */
export function liveExtraPasses(decisions: readonly ReviewDecision[], input: NativeExtraPassInput): ReviewDecision[] {
  const withdrawn = withdrawnExtraPassKeys(decisions);
  return decisions.filter(value => !withdrawn.has(reviewDecisionKey(value)) && reaches(value, input)).sort(compareNewest);
}
