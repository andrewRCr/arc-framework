import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewReceipt,
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";
import { projectForwardReviewContract } from "../../../../../src/scripts/review-gate/runtime/forward-contract.js";

const objectId = (character: string): string => character.repeat(40);

function contract() {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  const request = createReviewRequest(target, {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requirementId: requirement.requirementId,
    carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
    authorIdentity: "andrew",
    evaluatorIdentity: "reviewer-1",
    generation: 0,
    requestMechanism: "automatic",
  });
  const receipt = createReviewReceipt({
    target,
    requirement,
    request,
    applicabilityId: null,
    reviewRunId: "run-7",
    evaluatorIdentity: request.evaluatorIdentity,
    attestingRuntimeIdentity: "review-gate-app",
    attestationMechanism: "github-app",
    providerEventIdentity: "event-7",
    result: "clean",
  });
  return { target, requirement, request, receipt };
}

describe("forward review contract projection", () => {
  it("carries exact v2 identities into a neutral projection and bounded host output", () => {
    const records = contract();
    const result = projectForwardReviewContract(records);

    expect(result.projection).toMatchObject({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      conclusion: "success",
      target: { targetId: records.target.targetId },
      requirement: { requirementId: records.requirement.requirementId },
      request: { requestId: records.request.requestId },
      receipt: {
        requestId: records.request.requestId,
        reviewRunId: "run-7",
        attestingRuntimeIdentity: "review-gate-app",
      },
    });
    expect(result.checkOutput.title).toBe("ARC independent review: success");
    expect(result.checkOutput.summary).toContain(records.target.targetId);
    expect(result.checkOutput.summary).toContain(records.requirement.rubricDigest);
    expect(result.checkOutput.summary).toContain("review-gate-app");
  });

  it("projects an exempt decision without inventing requirement, request, or receipt identities", () => {
    const { target } = contract();
    const result = projectForwardReviewContract({
      target,
      requirement: null,
      request: null,
      receipt: null,
    });

    expect(result.projection).toMatchObject({
      conclusion: "success",
      requirement: null,
      request: null,
      receipt: null,
    });
    expect(result.checkOutput.summary).toContain("Review obligation:** exempt");
  });

  it("keeps incomplete evidence pending and provider unavailability fail-closed", () => {
    const records = contract();
    expect(projectForwardReviewContract({
      target: records.target,
      requirement: records.requirement,
      request: records.request,
      receipt: null,
    }).projection.conclusion).toBe("pending");

    const unavailable = createReviewReceipt({
      target: records.target,
      requirement: records.requirement,
      request: records.request,
      applicabilityId: null,
      reviewRunId: "run-8",
      evaluatorIdentity: records.request.evaluatorIdentity,
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: null,
      result: "unavailable",
    });
    expect(projectForwardReviewContract({ ...records, receipt: unavailable }).projection).toMatchObject({
      conclusion: "failure",
      blockers: [{ code: "independent-analysis:unavailable" }],
    });
  });

  it("rejects mixed versions, stale identities, and impossible hierarchy", () => {
    const records = contract();
    expect(() => projectForwardReviewContract({
      ...records,
      target: { ...records.target, schemaVersion: 1 },
    })).toThrow();
    expect(() => projectForwardReviewContract({
      ...records,
      requirement: { ...records.requirement, requirementId: canonicalDigest({ stale: true }) },
    })).toThrow(/requirement ID/u);
    expect(() => projectForwardReviewContract({
      target: records.target,
      requirement: null,
      request: records.request,
      receipt: null,
    })).toThrow(/without a requirement/u);
  });
});
