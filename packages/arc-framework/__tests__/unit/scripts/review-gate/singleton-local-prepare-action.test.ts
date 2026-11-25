/** Ordinary local instructions retain the stored grant they relay. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { projectSingletonLocalPrepareAction } from "../../../../src/scripts/review-gate/singleton-local-prepare-action.js";

it("preserves both ordinary decision references in local prepare instructions", () => {
  const target = { repository: "owner/repo", pullRequest: 41, headSha: "a".repeat(40) };
  const ceilingKey = canonicalDigest({ ceiling: true }), additionalKey = canonicalDigest({ additional: true });
  const action = projectSingletonLocalPrepareAction({ target,
    lineageBoundary: { workUnitId: "example", candidateId: canonicalDigest({ candidate: true }) },
    standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: true }), retrigger: "full-final", count: 1 },
    judgment: { ceilingOverride: { target, lane: "standard", exhaustedPassCount: 2, nextPass: 3, decisionKey: ceilingKey },
      additionalPassAuthorization: { target, lane: "standard", precedingProducerId: "producer-1",
        completedPasses: 2, nextPass: 3, decisionKey: additionalKey } } });
  expect(action.request.policyJudgment).toMatchObject({ ceilingOverride: { decisionKey: ceilingKey },
    additionalPassAuthorization: { decisionKey: additionalKey } });
});
