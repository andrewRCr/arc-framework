/** Unit coverage for typed non-delivery local review coverage recovery. */

import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import type { RawGitExec } from "../../../../../src/lib/change-facts.js";
import type {
  CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
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
import {
  confirmErrandFixResponseApplicability,
  confirmNonDeliveryIncrementalApplicability,
  resolveLocalReviewCoverageSelection,
} from
  "../../../../../src/scripts/review-gate/policy/local-review-coverage-selection.js";
import { resolveReviewPolicy } from
  "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { projectGitReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/git-review-contribution-applicability.js";
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

function carriedProofExec(mechanical = true): RawGitExec {
  const trees = new Map([
    [objectId("1"), objectId("4")],
    [objectId("a"), objectId("5")],
    [objectId("2"), objectId("6")],
    [objectId("b"), objectId("7")],
    [objectId("3"), objectId("8")],
    [objectId("c"), objectId("9")],
  ]);
  const bytes = (value: string) => ({ stdout: new TextEncoder().encode(value) });
  return async (args) => {
    if (args[0] === "rev-parse") {
      const expression = args.at(-1) ?? "";
      if (expression === "HEAD^{commit}") return bytes(`${objectId("a")}\n`);
      const match = /^([0-9a-f]+)\^\{(commit|tree)\}$/u.exec(expression);
      if (match?.[1] !== undefined && trees.has(match[1])) {
        return bytes(`${match[2] === "commit" ? match[1] : trees.get(match[1])}\n`);
      }
    }
    if (args[0] === "merge-base" && args[1] === "--all") {
      const left = args[2];
      const right = args[3];
      if (left === objectId("a") && (right === objectId("2") || right === objectId("3"))) {
        return bytes(`${objectId("1")}\n`);
      }
      if (left === objectId("b") && right === objectId("3")) return bytes(`${objectId("2")}\n`);
    }
    if (args[0] === "merge-tree") {
      if (!args.includes("--name-only")) return bytes(`${objectId("4")}\n`);
      const left = args.at(-2);
      const right = args.at(-1);
      if (left === objectId("2") && right === objectId("a")) return bytes(`${objectId("d")}\n`);
      if (left === objectId("3") && right === objectId("a")) return bytes(`${objectId("e")}\n`);
      if (left === objectId("3") && right === objectId("b")) {
        return bytes(`${objectId(mechanical ? "9" : "f")}\n`);
      }
    }
    if (args[0] === "diff" && args.includes("--name-only")) {
      return bytes("src/example.ts\0");
    }
    throw new Error(`Unexpected Git proof invocation: ${args.join(" ")}`);
  };
}

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

function completeLocalResult(
  resultLineage: LaneSubjectLineage = lineage,
): Extract<ReviewResult, { kind: "attested-local" }> {
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
    vehicle: { kind: "work-unit", identity: "example" },
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
  confirmCurrentApplicability: () => Promise<"applicable">;
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
    confirmCurrentApplicability: async () => "applicable",
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
  it("carries exact Candidate coverage through a mechanically proved later correction", async () => {
    const predecessor = completeLocalResult();
    const selectedTarget = { ...target(objectId("b")), diffBaseSha: objectId("2") };
    const currentTarget = { ...target(objectId("c")), diffBaseSha: objectId("3") };
    const exec = carriedProofExec();
    const selector = {
      schemaVersion: 1 as const,
      repositoryId: currentTarget.repositoryId,
      repository: "local/repo-1",
      pullRequest: 42,
      lane: "standard" as const,
      sourceId: predecessor.sourceIdentity,
      priorAttemptId: predecessor.producerId,
      priorHead: predecessor.target.headSha,
      currentHead: selectedTarget.headSha,
      priorBase: predecessor.target.diffBaseSha,
      currentBase: selectedTarget.diffBaseSha,
    };
    const selected = await projectGitReviewContributionApplicability({
      selector, exec,
      observeEndpoints: async () => ({ head: selectedTarget.headSha, base: selectedTarget.diffBaseSha }),
    });
    expect(selected.state).toBe("decision-required");
    if (selected.state !== "decision-required") return;
    const candidate = (choice: "covered" | "review-required") => ({
      attestation: { candidateId: lineage.candidateId },
      transitions: [{
        transitionKind: "review-applicability-selection",
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        candidateId: lineage.candidateId,
        selector,
        projectionDigest: selected.projectionDigest,
        residualDigest: selected.residualDigest,
        selectedBy: "andrew",
        selectedAt: "2026-09-25T12:00:00.000Z",
        choice,
      }],
    }) as CandidateManagedRecordV1;
    const common = {
      predecessor, currentTarget, currentLineage: lineage,
      repository: "local/repo-1", pullRequest: 42,
      exec, observeTarget: async () => currentTarget,
    };
    await expect(confirmNonDeliveryIncrementalApplicability({
      ...common, candidate: candidate("covered"),
    })).resolves.toBe("applicable");
    await expect(confirmNonDeliveryIncrementalApplicability({
      ...common, candidate: candidate("review-required"),
    })).resolves.toBe("review-required");
    await expect(confirmNonDeliveryIncrementalApplicability({
      ...common,
      candidate: candidate("covered"),
      observeTarget: async () => ({ ...currentTarget, targetId: digest("moved") }),
    })).resolves.toBe("unavailable");
    await expect(confirmNonDeliveryIncrementalApplicability({
      ...common, candidate: candidate("covered"), exec: carriedProofExec(false),
    })).resolves.toBe("unavailable");
  });
  it("does not equate same Errand lineage with changed-base contribution proof", async () => {
    const earlierLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("a"),
    };
    const predecessor = completeLocalResult(earlierLineage);
    const currentTarget = { ...target(objectId("c")), diffBaseSha: objectId("b") };
    const exec = vi.fn(async () => { throw new Error("contribution proof unavailable"); });
    await expect(confirmNonDeliveryIncrementalApplicability({
      predecessor,
      currentTarget,
      currentLineage: { ...earlierLineage, headSha: currentTarget.headSha },
      repository: "local/repo-1",
      pullRequest: 42,
      candidate: null,
      exec,
      observeTarget: async () => currentTarget,
    })).resolves.toBe("unavailable");
    expect(exec).toHaveBeenCalledWith(
      ["merge-base", "--all", predecessor.target.headSha, currentTarget.diffBaseSha],
      { objectAccess: "local-only" },
    );
  });

  it("routes a noncandidate D4 divergence to a typed review requirement", async () => {
    const earlierLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("a"),
    };
    const { targetId: _priorId, ...priorInput } = target(objectId("a"));
    const { targetId: _currentId, ...currentInput } = target(objectId("b"));
    void _priorId;
    void _currentId;
    const predecessor = {
      ...completeLocalResult(earlierLineage),
      target: createReviewTarget({
        ...priorInput,
        diffBaseSha: objectId("1"), diffBaseTree: objectId("4"),
        headSha: objectId("a"), headTree: objectId("5"),
      }),
    };
    const currentTarget = createReviewTarget({
      ...currentInput,
      diffBaseSha: objectId("2"), diffBaseTree: objectId("6"),
      headSha: objectId("b"), headTree: objectId("7"),
    });
    await expect(confirmNonDeliveryIncrementalApplicability({
      predecessor,
      currentTarget,
      currentLineage: { ...earlierLineage, headSha: objectId("b") },
      repository: "local/repo-1",
      pullRequest: 42,
      candidate: null,
      exec: carriedProofExec(false),
      observeTarget: async () => currentTarget,
    })).resolves.toBe("review-required");
  });

  it("withholds the Errand response bridge when the live target or produced head differs", async () => {
    const errandLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("a"),
    };
    const predecessor = {
      ...completeLocalResult(errandLineage),
      originalOutcome: "findings" as const,
      vehicle: { kind: "errand" as const, identity: "repair-review-state", claimId: "claim-old" },
      request: { carrier: {
        kind: "local-change-set", adapterId: "delegated-agent",
        changeRequestId: null, errandClaimId: "claim-old",
      } } as Extract<ReviewResult, { kind: "attested-local" }>["request"],
    };
    const { targetId: _targetId, ...currentInput } = predecessor.target;
    void _targetId;
    const currentTarget = createReviewTarget({
      ...currentInput, headSha: objectId("b"), headTree: objectId("c"),
    });
    const readResponsePerformance = vi.fn(async () => ({
      schemaVersion: 1 as const,
      producerId: predecessor.producerId,
      dispositionSetId: digest("approved"),
      originatingHeadSha: predecessor.target.headSha,
      producedHeadSha: objectId("c"),
      performedAt: "2026-09-25T12:00:00.000Z",
    }));
    const common = {
      predecessor,
      currentTarget,
      currentLineage: { ...errandLineage, headSha: currentTarget.headSha },
      currentClaimId: "claim-old",
      dispositionStore: dependencies(predecessor).dispositionStore,
      readResponsePerformance,
    };
    await expect(confirmErrandFixResponseApplicability({
      ...common,
      observeTarget: async () => ({ ...currentTarget, targetId: digest("moved") }),
    })).resolves.toBe("unavailable");
    expect(readResponsePerformance).not.toHaveBeenCalled();
    await expect(confirmErrandFixResponseApplicability({
      ...common,
      observeTarget: async () => currentTarget,
    })).resolves.toBe("unavailable");
    expect(readResponsePerformance).toHaveBeenCalledOnce();
  });

  it("does not carry an old Errand response into a new claim using the same slug", async () => {
    const errandLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("a"),
    };
    const predecessor = {
      ...completeLocalResult(errandLineage),
      originalOutcome: "findings" as const,
      vehicle: { kind: "errand" as const, identity: "repair-review-state", claimId: "claim-old" },
      request: { carrier: {
        kind: "local-change-set", adapterId: "delegated-agent",
        changeRequestId: null, errandClaimId: "claim-old",
      } } as Extract<ReviewResult, { kind: "attested-local" }>["request"],
    };
    const { targetId: _targetId, ...currentInput } = predecessor.target;
    void _targetId;
    const currentTarget = createReviewTarget({
      ...currentInput, headSha: objectId("b"), headTree: objectId("c"),
    });
    const readResponsePerformance = vi.fn(async () => null);
    await expect(confirmErrandFixResponseApplicability({
      predecessor,
      currentTarget,
      currentLineage: { ...errandLineage, headSha: currentTarget.headSha },
      currentClaimId: "claim-new",
      observeTarget: async () => currentTarget,
      dispositionStore: dependencies(predecessor).dispositionStore,
      readResponsePerformance,
    })).resolves.toBe("unavailable");
    await expect(confirmErrandFixResponseApplicability({
      predecessor,
      currentTarget,
      currentLineage: { ...errandLineage, headSha: currentTarget.headSha },
      currentClaimId: "claim-old",
      currentResult: {
        ...predecessor,
        target: currentTarget,
        vehicle: { kind: "errand", identity: "repair-review-state", claimId: "claim-new" },
      },
      observeTarget: async () => currentTarget,
      dispositionStore: dependencies(predecessor).dispositionStore,
      readResponsePerformance,
    })).resolves.toBe("unavailable");
    expect(readResponsePerformance).not.toHaveBeenCalled();
  });

  it("requires a real pull request coordinate before applying contribution authority", async () => {
    const earlierLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("a"),
    };
    const predecessor = completeLocalResult(earlierLineage);
    const exec = vi.fn(async () => { throw new Error("unchanged head needs no Git query"); });
    const common = {
      predecessor,
      currentTarget: predecessor.target,
      currentLineage: earlierLineage,
      repository: "arc-framework/example",
      candidate: null,
      exec,
      observeTarget: async () => predecessor.target,
    };
    await expect(confirmNonDeliveryIncrementalApplicability({
      ...common, pullRequest: null,
    })).resolves.toBe("unavailable");
    expect(exec).not.toHaveBeenCalled();
    await expect(confirmNonDeliveryIncrementalApplicability({
      ...common, pullRequest: 42,
    })).resolves.toBe("applicable");
  });
  it("withholds incremental coverage when current contribution proof requires review", async () => {
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
    for (const decision of ["review-required", "unavailable"] as const) {
      const proof = { ...dependencies(predecessor), confirmCurrentApplicability: async () => decision };
      await expect(resolveLocalReviewCoverageSelection(common, proof)).resolves.toMatchObject({
        state: "coverage-required",
        action: { choices: [{ requestedCoverage: "complete" }] },
      });
    }
    await expect(resolveLocalReviewCoverageSelection(common, {
      resultReader: dependencies(predecessor).resultReader,
      dispositionStore: dependencies(predecessor).dispositionStore,
    })).resolves.toMatchObject({
      state: "coverage-required",
      action: { choices: [{ requestedCoverage: "complete" }] },
    });
  });
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
