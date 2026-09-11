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
import type { LaneSubjectLineage } from
  "../../../../../src/scripts/review-gate/core/lane-admission.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import { resolveLocalReviewCoverageSelection } from
  "../../../../../src/scripts/review-gate/policy/local-review-coverage-selection.js";
import { resolveReviewPolicy } from
  "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { resolveEvidenceBoundReviewPolicy } from
  "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";

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

function completeLocalResult(resultLineage: LaneSubjectLineage = lineage): ReviewResult {
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
      lineage: resultLineage,
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

function incrementalLocalResult(): ReviewResult {
  const predecessor = completeLocalResult();
  return {
    ...predecessor,
    producerId: "incremental-predecessor",
    target: target(objectId("b")),
    admission: {
      ...predecessor.admission,
      requestedCoverage: "incremental",
      effectiveCoverage: "incremental",
      correctionScope: {
        schemaVersion: 1,
        predecessorProducerId: "missing-complete-root",
        predecessorHeadSha: objectId("a"),
        basisHeadSha: objectId("a"),
        headSha: objectId("b"),
        requiredFindings: [],
      },
    },
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

  it("offers an Errand predecessor after its correction changes the head", async () => {
    const predecessorLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("a"),
    };
    const predecessor = completeLocalResult(predecessorLineage);
    const currentTarget = target(objectId("c"));

    await expect(resolveLocalReviewCoverageSelection({
      policy: readyPolicy(currentTarget.headSha),
      target: currentTarget,
      sourceId: "delegated-agent",
      lineage: { ...predecessorLineage, headSha: currentTarget.headSha },
      standardReview,
      predecessorOperationId: predecessor.producerId,
    }, dependencies(predecessor))).resolves.toMatchObject({
      state: "coverage-required",
      action: {
        choices: [
          { requestedCoverage: "incremental" },
          { requestedCoverage: "complete" },
        ],
      },
    });

    await expect(resolveLocalReviewCoverageSelection({
      policy: readyPolicy(currentTarget.headSha),
      target: currentTarget,
      sourceId: "delegated-agent",
      lineage: {
        ...predecessorLineage,
        vehicleIdentity: "other-errand",
        headSha: currentTarget.headSha,
      },
      standardReview,
      predecessorOperationId: predecessor.producerId,
    }, dependencies(predecessor))).resolves.toMatchObject({
      state: "coverage-required",
      action: { choices: [{ requestedCoverage: "complete" }] },
    });
  });

  it("offers, admits, and reduces changed-head Errand incremental coverage", async () => {
    const predecessorLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("a"),
    };
    const currentLineage = { ...predecessorLineage, headSha: objectId("c") };
    const predecessor = completeLocalResult(predecessorLineage);
    if (predecessor.kind !== "attested-local") throw new Error("expected local predecessor");
    const currentTarget = target(currentLineage.headSha);
    const offered = await resolveLocalReviewCoverageSelection({
      policy: readyPolicy(currentTarget.headSha),
      target: currentTarget,
      sourceId: "delegated-agent",
      lineage: currentLineage,
      standardReview,
      predecessorOperationId: predecessor.producerId,
    }, dependencies(predecessor));
    if (offered.state !== "coverage-required") throw new Error("expected coverage selection");
    const coverage = offered.action.choices[0];
    if (coverage?.requestedCoverage !== "incremental") throw new Error("expected incremental choice");
    const requirement = createReviewRequirement({
      target: currentTarget,
      projection: standardReview,
      acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
      initialAdmission: "checkpoint",
    });
    if (requirement === null) throw new Error("expected current requirement");
    const current: ReviewResult = {
      ...predecessor,
      producerId: "local-incremental",
      target: currentTarget,
      resultDigest: digest("incremental-result"),
      admission: {
        ...predecessor.admission,
        lineage: currentLineage,
        logicalPass: 2,
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
        correctionScope: coverage.correctionScope,
        policyVersion: requirement.policyVersion,
      },
      requirement,
    };

    await expect(resolveEvidenceBoundReviewPolicy({
      schemaVersion: 1,
      target: { repository: "local/repo-1", pullRequest: null, headSha: currentTarget.headSha },
      lane: "standard",
      frontlineActive: false,
      standardReview,
      completedPasses: 2,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "clean",
        reviewOperationId: current.producerId,
      }],
    }, {
      sources: ["delegated-agent"],
      maxPasses: 3,
      resultReader: {
        readResult: async (producerId) => producerId === predecessor.producerId
          ? predecessor
          : current,
      },
      dispositionStore: dependencies(predecessor).dispositionStore,
      confirmTarget: async () => currentTarget,
      confirmIncrementalApplicability: async (earlier, later) => (
        earlier.admission.lineage.kind === "head-bound"
          && later.admission.lineage.kind === "head-bound"
          && earlier.admission.lineage.vehicleKind === later.admission.lineage.vehicleKind
          && earlier.admission.lineage.vehicleIdentity === later.admission.lineage.vehicleIdentity
          ? "applicable"
          : "unavailable"
      ),
    })).resolves.toMatchObject({
      state: "pass-complete",
      payload: { verifiedTerminalSignal: { coverageAdequate: true } },
    });
  });

  it("does not offer correction coverage over an unreadable predecessor chain", async () => {
    const predecessor = incrementalLocalResult();
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
      action: { choices: [{ requestedCoverage: "complete" }] },
    });
  });
});
