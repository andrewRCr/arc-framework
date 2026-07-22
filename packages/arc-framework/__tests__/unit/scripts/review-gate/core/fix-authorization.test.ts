import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  consumeFixAuthorization,
  createFixAuthorization,
  validateFixAuthorization,
} from "../../../../../src/scripts/review-gate/core/fix-authorization.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  queryFixAuthorizationSetMutability,
  queryFixMutability,
} from "../../../../../src/scripts/review-gate/core/head-mutability.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";

function target(head: string, tree: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "0".repeat(40),
    diffBaseTree: "1".repeat(40),
    headSha: head,
    headTree: tree,
  });
}

const oldTarget = target("a".repeat(40), "b".repeat(40));
const newTarget = target("c".repeat(40), "d".repeat(40));

function approved(disposition: "fix" | "defer" = "fix") {
  const set = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: oldTarget.targetId,
    policyVersion: canonicalDigest({ policy: "review" }),
    rubricVersion: "independent-analysis/v1",
    rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
    proposedBy: "author-1",
    findings: [{
      findingId: "finding-1",
      sourceIdentity: "local-review",
      locus: "src/index.ts:7",
      sourceVerification: "verified",
      verificationRefs: ["source:src/index.ts:7"],
      severity: "major",
      disposition,
      gating: "blocking",
      rationale: "The source confirms the reported boundary failure.",
      recommendation: disposition === "fix" ? "Apply the bounded fix." : "Defer the change.",
      openQuestions: [],
    }],
  });
  return approveDispositionState({
    proposed: proposeDispositionSet(set),
    approvedBy: "maintainer-1",
    approvedAt: "2026-07-20T20:00:00Z",
  });
}

describe("review-fix authorization", () => {
  it("mints before the new head exists and binds only the approved fix set and old target", () => {
    const dispositionState = approved();
    const authorization = createFixAuthorization({ dispositionState, oldTarget });
    expect(validateFixAuthorization(authorization)).toMatchObject({
      oldTargetId: oldTarget.targetId,
      oldHeadSha: oldTarget.headSha,
      dispositionSetId: dispositionState.dispositionSet.dispositionSetId,
      authorizedFindingIds: ["finding-1"],
    });
    expect(authorization).not.toHaveProperty("newTargetId");
    expect(authorization).not.toHaveProperty("newHeadSha");
    expect(queryFixMutability({
      authorization,
      dispositionState,
      currentTarget: oldTarget,
      priorConsumptions: [],
    })).toMatchObject({ kind: "allow", reason: "authorized-fix" });
  });

  it("binds one verified old-to-new consumption and rejects replay or mismatched state", () => {
    const dispositionState = approved();
    const authorization = createFixAuthorization({ dispositionState, oldTarget });
    const consumption = consumeFixAuthorization({
      authorization,
      oldTarget,
      newTarget,
      appliedBy: "author-1",
      consumedAt: "2026-07-20T20:05:00Z",
      verificationRefs: ["test:review-fix"],
      priorConsumptions: [],
    });
    expect(consumption).toMatchObject({
      fixAuthorizationId: authorization.fixAuthorizationId,
      oldTargetId: oldTarget.targetId,
      newTargetId: newTarget.targetId,
      appliedBy: "author-1",
      verificationRefs: ["test:review-fix"],
    });
    expect(() => consumeFixAuthorization({
      authorization,
      oldTarget,
      newTarget,
      appliedBy: "author-1",
      consumedAt: "2026-07-20T20:06:00Z",
      verificationRefs: ["test:review-fix"],
      priorConsumptions: [consumption],
    })).toThrow(/already been consumed/iu);
    expect(queryFixMutability({
      authorization,
      dispositionState,
      currentTarget: oldTarget,
      priorConsumptions: [consumption],
    })).toEqual({ kind: "refuse", reason: "reused-authorization" });
  });

  it("never mints a head-update authorization for defer-only approval", () => {
    expect(() => createFixAuthorization({ dispositionState: approved("defer"), oldTarget }))
      .toThrow(/non-fix dispositions/iu);
  });

  it("fails closed for missing, ambiguous, stale, invalid, or mismatched authorization state", () => {
    const dispositionState = approved();
    const authorization = createFixAuthorization({ dispositionState, oldTarget });
    const selection = {
      requestedFixAuthorizationId: authorization.fixAuthorizationId,
      dispositionState,
      currentTarget: oldTarget,
      priorConsumptions: [],
    };
    expect(queryFixAuthorizationSetMutability({ ...selection, authorizations: [] }))
      .toEqual({ kind: "refuse", reason: "missing-authorization" });
    expect(queryFixAuthorizationSetMutability({ ...selection, authorizations: [authorization, authorization] }))
      .toEqual({ kind: "refuse", reason: "ambiguous-authorization" });
    expect(queryFixMutability({ authorization, dispositionState, currentTarget: newTarget, priorConsumptions: [] }))
      .toEqual({ kind: "refuse", reason: "stale-authorization" });
    expect(queryFixMutability({
      authorization: { ...authorization, fixAuthorizationId: canonicalDigest({ authorization: "tampered" }) },
      dispositionState,
      currentTarget: oldTarget,
      priorConsumptions: [],
    })).toEqual({ kind: "refuse", reason: "invalid-authorization" });
    const changedDispositionSetId = canonicalDigest({ set: "changed" });
    const changedState = {
      ...dispositionState,
      approval: { ...dispositionState.approval, dispositionSetId: changedDispositionSetId },
      dispositionSet: {
        ...dispositionState.dispositionSet,
        dispositionSetId: changedDispositionSetId,
      },
    };
    expect(queryFixMutability({
      authorization,
      dispositionState: changedState,
      currentTarget: oldTarget,
      priorConsumptions: [],
    })).toEqual({ kind: "refuse", reason: "mismatched-authorization" });
  });
});
