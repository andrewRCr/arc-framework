/** CodeRabbit decisive-review selection and policy-qualified evidence mapping. */

import type { ReviewRequirement } from "../../core/contracts.js";
import type { Evidence } from "../../core/evidence.js";
import { computeChangeSetId, computePolicyVersion } from "../../core/identity.js";
import {
  isTrustedLifecycleTailProof,
  type LifecycleTailProof,
} from "../../core/lifecycle-tail.js";
import type { ProviderReviewDisposition } from "../../core/ports.js";
import { qualifyIndependentAnalysisSource } from "../../policy/self-hosting/qualification.js";
import type { SelfHostingPolicy } from "../../policy/self-hosting/schema.js";

/** The one decisive bot review applicable to the canonical head, or fail-closed pending. */
export type CodeRabbitDecisiveReview =
  | { kind: "pending"; reason: string }
  | {
    kind: "approved" | "changes-requested";
    reviewId: string;
    evidenceRef: string;
    reviewedThroughSha: string;
    observedAt: string;
  };

/** Select the latest applicable decisive review from the policy-pinned CodeRabbit bot. */
export function resolveCodeRabbitDecisiveReview(input: {
  reviews: readonly ProviderReviewDisposition[];
  expectedBotUserId: string;
  currentHeadSha: string;
  lifecycleTail: LifecycleTailProof | null;
}): CodeRabbitDecisiveReview {
  const eligibleHeads = new Set([input.currentHeadSha]);
  if (
    isTrustedLifecycleTailProof(input.lifecycleTail)
    && input.lifecycleTail.currentHeadSha === input.currentHeadSha
    && input.lifecycleTail.sourceIdentity === "coderabbit-pr"
  ) {
    eligibleHeads.add(input.lifecycleTail.reviewedThroughSha);
  }
  const decisive = input.reviews.filter((review) => review.actorIdentity === input.expectedBotUserId
    && (review.state === "approved" || review.state === "changes-requested")
    && eligibleHeads.has(review.commitId)
    && review.submittedAt !== null);
  if (decisive.length === 0) return { kind: "pending", reason: "no-applicable-decisive-review" };
  const ordered = [...decisive].sort((left, right) =>
    (right.submittedAt ?? "").localeCompare(left.submittedAt ?? "") || right.reviewId.localeCompare(left.reviewId));
  const latest = ordered[0];
  const next = ordered[1];
  if (latest === undefined) return { kind: "pending", reason: "no-applicable-decisive-review" };
  if (next !== undefined && next.submittedAt === latest.submittedAt) {
    return { kind: "pending", reason: "ambiguous-decisive-review" };
  }
  if (latest.submittedAt === null) return { kind: "pending", reason: "undated-decisive-review" };
  const kind = latest.state === "approved" ? "approved" : "changes-requested";
  return {
    kind,
    reviewId: latest.reviewId,
    evidenceRef: latest.evidenceRef,
    reviewedThroughSha: latest.commitId,
    observedAt: latest.submittedAt,
  };
}

function providerQualifies(policy: SelfHostingPolicy, requirement: ReviewRequirement): boolean {
  const declaration = policy.qualifications.find((candidate) => candidate.sourceIdentity === "coderabbit-pr");
  if (declaration === undefined || declaration.transport !== "durable-record") return false;
  const accepted = requirement.acceptableSources.some((source) => source.sourceKind === declaration.sourceKind
    && (source.qualifier === undefined || source.qualifier === declaration.qualifier));
  return accepted && qualifyIndependentAnalysisSource(declaration, requirement.rubricVersion).qualified;
}

/** Map only an enabled, qualified current/tail approval into ordinary clean evidence. */
export function mapCodeRabbitApprovalToEvidence(input: {
  policy: SelfHostingPolicy;
  requirement: ReviewRequirement;
  baseRef: string;
  diffBaseSha: string;
  decisive: CodeRabbitDecisiveReview;
}): Evidence | null {
  if (input.decisive.kind !== "approved") return null;
  if (computePolicyVersion({ policy: input.policy }) !== input.requirement.policyVersion) return null;
  if (!providerQualifies(input.policy, input.requirement)) return null;
  const reviewedThroughSha = input.decisive.reviewedThroughSha;
  return {
    schemaVersion: 1,
    requirementId: input.requirement.id,
    sourceKind: "agent",
    sourceIdentity: "coderabbit-pr",
    result: "clean",
    evidenceUrlOrId: input.decisive.evidenceRef,
    reviewRunId: input.decisive.reviewId,
    policyVersion: input.requirement.policyVersion,
    rubricVersion: input.requirement.rubricVersion,
    coverage: "full",
    coverageFromSha: input.diffBaseSha,
    coverageThroughSha: reviewedThroughSha,
    baseRef: input.baseRef,
    diffBaseSha: input.diffBaseSha,
    changeSetId: computeChangeSetId({
      baseRef: input.baseRef,
      diffBaseSha: input.diffBaseSha,
      headSha: reviewedThroughSha,
    }),
    headSha: reviewedThroughSha,
    findings: [],
    closures: [],
    observedAt: input.decisive.observedAt,
  };
}
