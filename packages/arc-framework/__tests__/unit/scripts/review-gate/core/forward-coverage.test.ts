import { describe, expect, it } from "vitest";

import {
  createReviewReceipt,
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  reduceForwardCoverage,
  type ForwardCoverageLink,
} from "../../../../../src/scripts/review-gate/core/forward-coverage.js";
import {
  INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";

const objectId = (character: string): string => character.repeat(40);

function link(
  head: string,
  generation: number,
  fromTargetId: string | null,
  retrigger: "incremental" | "full-final" = "incremental",
  overrides: {
    evaluatorIdentity?: string;
    providerEventIdentity?: string | null;
    result?: "clean" | "findings" | "unavailable" | "failed";
  } = {},
): ForwardCoverageLink {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId(head),
    headTree: objectId(head),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
      retrigger,
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "carrier/v1" }],
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
    authorIdentity: "author-1",
    evaluatorIdentity: overrides.evaluatorIdentity ?? "reviewer-1",
    generation,
    requestMechanism: generation === 0 ? "automatic" : "refresh",
  });
  const receipt = createReviewReceipt({
    target,
    requirement,
    request,
    applicabilityId: null,
    reviewRunId: `run-${generation}`,
    evaluatorIdentity: request.evaluatorIdentity,
    attestingRuntimeIdentity: "review-gate-app",
    attestationMechanism: "github-app",
    providerEventIdentity: overrides.providerEventIdentity === undefined
      ? `event-${generation}`
      : overrides.providerEventIdentity,
    result: overrides.result ?? "clean",
  });
  return { fromTargetId, target, requirement, request, receipt };
}

describe("forward coverage reduction", () => {
  it("accepts a contiguous same-source chain reaching the current target", () => {
    const first = link("c", 0, null);
    const second = link("d", 1, first.target.targetId);

    expect(reduceForwardCoverage({
      target: second.target,
      requirement: second.requirement,
      links: [first, second],
    })).toMatchObject({
      satisfied: true,
      reason: "complete-incremental-chain",
      chain: [first, second],
    });
  });

  it.each([
    ["gap", (first: ForwardCoverageLink) => link("d", 1, first.requirement.requirementId)],
    ["source change", (first: ForwardCoverageLink) => link("d", 1, first.target.targetId, "incremental", {
      evaluatorIdentity: "reviewer-2",
    })],
    ["ambiguous carrier event", (first: ForwardCoverageLink) => link(
      "d",
      1,
      first.target.targetId,
      "incremental",
      { providerEventIdentity: "event-0" },
    )],
    ["incomplete result", (first: ForwardCoverageLink) => link(
      "d",
      1,
      first.target.targetId,
      "incremental",
      { result: "unavailable" },
    )],
  ] as const)("rejects a %s in an incremental chain", (_name, nextLink) => {
    const first = link("c", 0, null);
    const second = nextLink(first);

    expect(reduceForwardCoverage({
      target: second.target,
      requirement: second.requirement,
      links: [first, second],
    })).toMatchObject({ satisfied: false, chain: [] });
  });

  it("rejects a retargeted record instead of weakening its exact binding", () => {
    const first = link("c", 0, null);
    const second = link("d", 1, first.target.targetId);

    expect(() => reduceForwardCoverage({
      target: second.target,
      requirement: second.requirement,
      links: [{
        ...first,
        target: { ...first.target, targetId: second.target.targetId },
      }, second],
    })).toThrow(/target ID/u);
  });

  it("requires one final full review of the settled target for full-final", () => {
    const first = link("c", 0, null, "full-final");
    const feedback = link("d", 1, first.target.targetId, "full-final");

    expect(reduceForwardCoverage({
      target: feedback.target,
      requirement: feedback.requirement,
      links: [first, feedback],
    })).toMatchObject({ satisfied: false, reason: "final-full-review-required" });

    const settled = link("e", 2, null, "full-final");
    expect(reduceForwardCoverage({
      target: settled.target,
      requirement: settled.requirement,
      links: [first, feedback, settled],
    })).toMatchObject({
      satisfied: true,
      reason: "complete-final-full-review",
      chain: [first, feedback, settled],
    });
  });
});
