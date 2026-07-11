import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../../../../../src/scripts/review-gate/core/contracts.js";
import { computeChangeSetId, computePolicyVersion } from "../../../../../../src/scripts/review-gate/core/identity.js";
import type { LifecycleTailProof } from "../../../../../../src/scripts/review-gate/core/lifecycle-tail.js";
import type { ProviderReviewDisposition } from "../../../../../../src/scripts/review-gate/core/ports.js";
import {
  mapCodeRabbitApprovalToEvidence,
  resolveCodeRabbitDecisiveReview,
} from "../../../../../../src/scripts/review-gate/hosts/github/coderabbit-review.js";
import { SELF_HOSTING_POLICY, type SelfHostingPolicy } from "../../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

const BASE = "a".repeat(40);
const OLD_HEAD = "b".repeat(40);
const HEAD = "c".repeat(40);

function review(overrides: Partial<ProviderReviewDisposition> = {}): ProviderReviewDisposition {
  return {
    reviewId: "PRR_1",
    actorIdentity: SELF_HOSTING_POLICY.providerIdentities.coderabbitBotUserId,
    state: "approved",
    commitId: HEAD,
    submittedAt: "2026-07-11T20:00:00.000Z",
    evidenceRef: "https://github.test/pull/7#pullrequestreview-1",
    ...overrides,
  };
}

function policy(): SelfHostingPolicy {
  const [coderabbit, ...rest] = SELF_HOSTING_POLICY.qualifications;
  if (coderabbit === undefined) throw new Error("missing CodeRabbit fixture");
  return {
    ...SELF_HOSTING_POLICY,
    qualifications: [{
      ...coderabbit,
      enabled: true,
      exactCoverage: true,
      durableResults: true,
      distinctOutcomes: true,
      closureCapability: true,
    }, ...rest],
  };
}

function requirement(value: SelfHostingPolicy): ReviewRequirement {
  return {
    schemaVersion: 1,
    id: "independent-analysis",
    kind: "independent-analysis",
    obligation: "required",
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: computePolicyVersion({ policy: value }),
    rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"],
    changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: BASE, headSha: HEAD }),
    headSha: HEAD,
  };
}

function lifecycleTail(): LifecycleTailProof {
  return {
    schemaVersion: 1,
    predicateId: "lifecycle-bookkeeping-tail/v1",
    reviewedThroughSha: OLD_HEAD,
    currentHeadSha: HEAD,
    baseRef: "main",
    diffBaseSha: BASE,
    policyVersion: computePolicyVersion({ policy: SELF_HOSTING_POLICY }),
    rubricVersion: "independent-analysis/v1",
    sourceIdentity: "coderabbit-pr",
    artifact: { workUnitId: "review-gate", artifactGroupId: "review-gate", cohortPath: null },
    diagnostics: [],
  };
}

describe("CodeRabbit decisive review reduction", () => {
  it("selects the current-head pinned-bot approval and maps policy-qualified clean evidence", () => {
    const value = policy();
    const decisive = resolveCodeRabbitDecisiveReview({
      reviews: [review()],
      expectedBotUserId: SELF_HOSTING_POLICY.providerIdentities.coderabbitBotUserId,
      currentHeadSha: HEAD,
      lifecycleTail: null,
    });
    const evidence = mapCodeRabbitApprovalToEvidence({
      policy: value,
      requirement: requirement(value),
      baseRef: "main",
      diffBaseSha: BASE,
      decisive,
    });

    expect(decisive).toMatchObject({ kind: "approved", reviewedThroughSha: HEAD, reviewId: "PRR_1" });
    expect(evidence).toMatchObject({
      sourceIdentity: "coderabbit-pr",
      result: "clean",
      reviewRunId: "PRR_1",
      coverageThroughSha: HEAD,
    });
  });

  it("accepts an approval at the verified lifecycle-tail reviewed-through head", () => {
    const value = policy();
    const decisive = resolveCodeRabbitDecisiveReview({
      reviews: [review({ commitId: OLD_HEAD })],
      expectedBotUserId: SELF_HOSTING_POLICY.providerIdentities.coderabbitBotUserId,
      currentHeadSha: HEAD,
      lifecycleTail: lifecycleTail(),
    });

    expect(decisive).toMatchObject({ kind: "approved", reviewedThroughSha: OLD_HEAD });
    expect(mapCodeRabbitApprovalToEvidence({
      policy: value,
      requirement: requirement(value),
      baseRef: "main",
      diffBaseSha: BASE,
      decisive,
    })).toMatchObject({ coverageThroughSha: OLD_HEAD, headSha: OLD_HEAD });
  });

  it("retains a decisive current-head changes-requested review despite later comment noise", () => {
    const decisive = resolveCodeRabbitDecisiveReview({
      reviews: [
        review({ state: "changes-requested", submittedAt: "2026-07-11T20:00:00.000Z" }),
        review({ reviewId: "PRR_2", state: "commented", submittedAt: "2026-07-11T21:00:00.000Z" }),
      ],
      expectedBotUserId: SELF_HOSTING_POLICY.providerIdentities.coderabbitBotUserId,
      currentHeadSha: HEAD,
      lifecycleTail: null,
    });

    expect(decisive).toMatchObject({ kind: "changes-requested" });
    expect(mapCodeRabbitApprovalToEvidence({
      policy: policy(),
      requirement: requirement(policy()),
      baseRef: "main",
      diffBaseSha: BASE,
      decisive,
    })).toBeNull();
  });

  it.each([
    ["wrong bot", [review({ actorIdentity: "999" })]],
    ["prior head", [review({ commitId: "d".repeat(40) })]],
    ["ambiguous latest review", [
      review({ reviewId: "PRR_1" }),
      review({ reviewId: "PRR_2" }),
    ]],
  ] as const)("fails closed for %s", (_name, reviews) => {
    expect(resolveCodeRabbitDecisiveReview({
      reviews,
      expectedBotUserId: SELF_HOSTING_POLICY.providerIdentities.coderabbitBotUserId,
      currentHeadSha: HEAD,
      lifecycleTail: null,
    })).toMatchObject({ kind: "pending" });
  });

  it("does not map approval when the provider declaration is disabled or unqualified", () => {
    const decisive = resolveCodeRabbitDecisiveReview({
      reviews: [review()],
      expectedBotUserId: SELF_HOSTING_POLICY.providerIdentities.coderabbitBotUserId,
      currentHeadSha: HEAD,
      lifecycleTail: null,
    });
    expect(mapCodeRabbitApprovalToEvidence({
      policy: SELF_HOSTING_POLICY,
      requirement: requirement(SELF_HOSTING_POLICY),
      baseRef: "main",
      diffBaseSha: BASE,
      decisive,
    })).toBeNull();
  });
});
