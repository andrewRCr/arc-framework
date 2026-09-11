/** Unit coverage for typed non-delivery local review coverage recovery. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import { resolveLocalReviewCoverageSelection } from
  "../../../../../src/scripts/review-gate/policy/local-review-coverage-selection.js";
import { resolveReviewPolicy } from
  "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

const objectId = (character: string): string => character.repeat(40);
const digest = (value: string): string => canonicalDigest({ value });
const lineage = { kind: "candidate" as const, candidateId: digest("candidate") };
const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set" as const],
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  retrigger: "full-final" as const,
  count: 1 as const,
};

function target(headSha: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("0"),
    diffBaseTree: objectId("1"),
    headSha,
    headTree: objectId("2"),
  });
}

function completeLocalResult(): ReviewResult {
  const predecessorTarget = target(objectId("a"));
  const requirement = createReviewRequirement({
    target: predecessorTarget,
    projection: standardReview,
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("expected standard review requirement");
  return {
    kind: "attested-local",
    producerId: "local-predecessor",
    repositoryId: predecessorTarget.repositoryId,
    target: predecessorTarget,
    sourceIdentity: "delegated-agent",
    originalOutcome: "clean",
    findings: [],
    resultDigest: digest("result"),
    admission: {
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: "whole-target",
      policyVersion: requirement.policyVersion,
    },
    receiptRef: "refs/arc/review/receipts/local-predecessor",
    localSourceRef: "refs/arc/review/local/local-predecessor",
    requirement,
    request: {} as never,
  };
}

function dependencies(predecessor: ReviewResult): {
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordStore;
} {
  return {
    resultReader: {
      readResult: async (producerId) => {
        if (producerId !== predecessor.producerId) throw new Error("missing result");
        return predecessor;
      },
    },
    dispositionStore: {
      readDispositionRecord: async () => null,
      appendDispositionRecord: async () => ({ dispositionRecordRef: "unused" }),
    },
  };
}

function readyPolicy(headSha: string) {
  return resolveReviewPolicy({
    schemaVersion: 1,
    target: { repository: "local/repo-1", pullRequest: null, headSha },
    lane: "standard",
    frontlineActive: false,
    standardReview,
    completedPasses: 1,
    attempts: [],
    sources: ["delegated-agent"],
    maxPasses: 2,
    invocation: { mode: "force", sourceId: "delegated-agent" },
  });
}

describe("local review coverage selection", () => {
  it("offers an exact predecessor-backed incremental choice after the target head changes", async () => {
    const predecessor = completeLocalResult();
    const currentTarget = target(objectId("c"));

    await expect(resolveLocalReviewCoverageSelection({
      policy: readyPolicy(currentTarget.headSha),
      target: currentTarget,
      sourceId: "delegated-agent",
      lineage,
      standardReview,
      predecessorOperationId: predecessor.producerId,
    }, dependencies(predecessor))).resolves.toMatchObject({
      state: "coverage-required",
      action: {
        target: currentTarget,
        choices: [{
          requestedCoverage: "incremental",
          correctionScope: {
            predecessorProducerId: predecessor.producerId,
            predecessorHeadSha: predecessor.target.headSha,
            basisHeadSha: predecessor.target.headSha,
            headSha: currentTarget.headSha,
          },
        }, { requestedCoverage: "complete" }],
      },
    });
  });

  it("accepts only the exact offered correction admission", async () => {
    const predecessor = completeLocalResult();
    const currentTarget = target(objectId("c"));
    const common = {
      policy: readyPolicy(currentTarget.headSha),
      target: currentTarget,
      sourceId: "delegated-agent",
      lineage,
      standardReview,
      predecessorOperationId: predecessor.producerId,
    };
    const offered = await resolveLocalReviewCoverageSelection(common, dependencies(predecessor));
    if (offered.state !== "coverage-required") throw new Error("expected coverage choice");
    const incremental = offered.action.choices[0];
    if (incremental?.requestedCoverage !== "incremental") {
      throw new Error("expected incremental choice first");
    }
    const exactScope = incremental.correctionScope;
    if (exactScope === undefined) throw new Error("expected exact correction scope");

    await expect(resolveLocalReviewCoverageSelection({
      ...common,
      coverageAdmission: incremental,
    }, dependencies(predecessor))).resolves.toEqual({ state: "ready", coverageSelected: false });
    await expect(resolveLocalReviewCoverageSelection({
      ...common,
      coverageAdmission: {
        ...incremental,
        correctionScope: { ...exactScope, basisHeadSha: objectId("9") },
      },
    }, dependencies(predecessor))).rejects.toThrow(/current offered choice/u);
  });
});
