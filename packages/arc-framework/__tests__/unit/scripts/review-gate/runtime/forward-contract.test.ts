import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { classifyReviewApplicability } from "../../../../../src/scripts/review-gate/core/applicability.js";
import {
  createReviewReceipt,
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";
import { createForwardLifecycleTailProof } from "../../../../../src/scripts/review-gate/core/lifecycle-tail.js";
import {
  projectForwardReviewContract,
  projectReducedForwardReviewContract,
} from "../../../../../src/scripts/review-gate/runtime/forward-contract.js";

const objectId = (character: string): string => character.repeat(40);

function contract(options: {
  head?: string;
  generation?: number;
  retrigger?: "incremental" | "full-final";
  applicabilityId?: `sha256:${string}` | null;
  carrier?: "local" | "hosted";
} = {}) {
  const generation = options.generation ?? 0;
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId(options.head ?? "c"),
    headTree: objectId(options.head ?? "d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
      retrigger: options.retrigger ?? "full-final",
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
    carrier: options.carrier === "local"
      ? { kind: "local-change-set", adapterId: "local", changeRequestId: null }
      : { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
    authorIdentity: "andrew",
    evaluatorIdentity: "reviewer-1",
    generation,
    requestMechanism: generation === 0 ? "automatic" : "refresh",
  });
  const receipt = createReviewReceipt({
    target,
    requirement,
    request,
    applicabilityId: options.applicabilityId ?? null,
    reviewRunId: `run-${generation}`,
    evaluatorIdentity: request.evaluatorIdentity,
    attestingRuntimeIdentity: "review-gate-app",
    attestationMechanism: "github-app",
    providerEventIdentity: options.carrier === "local" ? null : `event-${generation}`,
    result: "clean",
  });
  return { channel: "hosted" as const, target, requirement, request, receipt };
}

function applicability(
  priorTargetId: string,
  currentTargetId: string,
  conflictState: "none" | "resolved",
  deltaPath: string,
) {
  return classifyReviewApplicability({
    priorTargetId,
    currentTargetId,
    changeSetId: canonicalDigest({ deltaPath }),
    reviewedPaths: ["src/a.ts"],
    changeSet: {
      changeSet: "known",
      changes: [{
        status: "modified",
        path: deltaPath,
        oldMode: "100644",
        newMode: "100755",
      }],
    },
    conflictState,
  });
}

describe("forward review contract projection", () => {
  it.each([
    ["local", "local", "success"],
    ["both", "local", "success"],
    ["hosted", "local", "failure"],
    ["local", "hosted", "failure"],
  ] as const)("keeps %s channel policy explicit for %s evidence", (channel, carrier, conclusion) => {
    const records = contract({ carrier });
    expect(projectForwardReviewContract({ ...records, channel }).projection).toMatchObject({
      conclusion,
      ...(conclusion === "failure" ? { blockers: [{ code: "independent-analysis:unqualified" }] } : {}),
    });
  });

  it("lets the typed coverage reducer, not projection prose, settle full-final", () => {
    const records = contract();
    const result = projectReducedForwardReviewContract({
      channel: "hosted",
      target: records.target,
      requirement: records.requirement,
      activeRequest: records.request,
      links: [{ fromTargetId: null, ...records }],
      applicability: null,
      lifecycleTail: null,
      coveragePaths: [],
    });

    expect(result).toMatchObject({
      activeFlight: "current",
      treatment: "final-full",
      projection: { conclusion: "success" },
    });
  });

  it("carries prior coverage across disjoint reconcile applicability", () => {
    const prior = contract({ head: "c", retrigger: "incremental" });
    const current = contract({ head: "d", generation: 1, retrigger: "incremental" });
    const proof = applicability(prior.target.targetId, current.target.targetId, "none", "docs/a.md");

    const result = projectReducedForwardReviewContract({
      channel: "hosted",
      target: current.target,
      requirement: current.requirement,
      activeRequest: current.request,
      links: [{ fromTargetId: null, ...prior }],
      applicability: proof,
      lifecycleTail: null,
      coveragePaths: [],
    });

    expect(result).toMatchObject({
      treatment: "carry",
      projection: {
        conclusion: "success",
        coverage: { treatment: "carry", applicabilityId: proof.applicabilityId },
      },
    });
    expect(result.checkOutput.summary).toContain("Coverage:** carry");
    expect(result.checkOutput.summary).toContain(proof.applicabilityId);
  });

  it.each([
    ["interacting", "none", "src/a.ts"],
    ["conflict", "resolved", "src/b.ts"],
  ] as const)("requires proof-bound incremental coverage for an %s reconcile", (_name, conflictState, deltaPath) => {
    const prior = contract({ head: "c", retrigger: "incremental" });
    const current = contract({ head: "d", generation: 1, retrigger: "incremental" });
    const proof = applicability(prior.target.targetId, current.target.targetId, conflictState, deltaPath);
    const receipt = createReviewReceipt({
      target: current.target,
      requirement: current.requirement,
      request: current.request,
      applicabilityId: proof.applicabilityId,
      reviewRunId: "run-1",
      evaluatorIdentity: current.request.evaluatorIdentity,
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: "event-1",
      result: "clean",
    });

    expect(projectReducedForwardReviewContract({
      channel: "hosted",
      target: current.target,
      requirement: current.requirement,
      activeRequest: current.request,
      links: [
        { fromTargetId: null, ...prior },
        { fromTargetId: prior.target.targetId, ...current, receipt },
      ],
      applicability: proof,
      lifecycleTail: null,
      coveragePaths: proof.interactionPaths.length > 0 ? proof.interactionPaths : proof.deltaPaths,
    })).toMatchObject({ treatment: "incremental", projection: { conclusion: "success" } });
  });

  it("keeps interacting coverage pending when the receipt does not bind the applicability proof", () => {
    const prior = contract({ head: "c", retrigger: "incremental" });
    const current = contract({ head: "d", generation: 1, retrigger: "incremental" });
    const proof = applicability(prior.target.targetId, current.target.targetId, "none", "src/a.ts");

    expect(projectReducedForwardReviewContract({
      channel: "hosted",
      target: current.target,
      requirement: current.requirement,
      activeRequest: current.request,
      links: [
        { fromTargetId: null, ...prior },
        { fromTargetId: prior.target.targetId, ...current },
      ],
      applicability: proof,
      lifecycleTail: null,
      coveragePaths: proof.interactionPaths,
    })).toMatchObject({
      treatment: "none",
      projection: {
        conclusion: "pending",
        coverage: { treatment: "none", applicabilityId: proof.applicabilityId },
      },
    });
  });

  it("carries a bookkeeping tail while invalidating the stale active flight", () => {
    const prior = contract({ head: "c", retrigger: "incremental" });
    const current = contract({ head: "d", generation: 1, retrigger: "incremental" });
    const surface = {
      treeId: objectId("e"),
      pathManifestDigest: canonicalDigest({ paths: ["src/a.ts"] }),
      semanticDigest: canonicalDigest({ semantic: "same" }),
    };
    const lifecycleTail = createForwardLifecycleTailProof({
      predicateId: "lifecycle-bookkeeping-tail/v2",
      priorTarget: prior.target,
      currentTarget: current.target,
      reviewedSurface: surface,
      currentSurface: { ...surface },
      policyVersion: current.requirement.policyVersion,
      rubricVersion: current.requirement.rubricVersion,
      rubricDigest: current.requirement.rubricDigest,
      sourceIdentity: prior.request.evaluatorIdentity,
      artifact: { workUnitId: "review-architecture", artifactGroupId: "work-unit:review-architecture", cohortPath: null },
      diagnostics: [],
    });

    expect(projectReducedForwardReviewContract({
      channel: "hosted",
      target: current.target,
      requirement: current.requirement,
      activeRequest: prior.request,
      links: [{ fromTargetId: null, ...prior }],
      applicability: null,
      lifecycleTail,
      coveragePaths: [],
    })).toMatchObject({
      treatment: "carry",
      activeFlight: "invalidated",
      projection: { conclusion: "success" },
    });
  });

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
        reviewRunId: "run-0",
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
      channel: "hosted",
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
      channel: "hosted",
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
      providerEventIdentity: "event-8",
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
      channel: "hosted",
      target: records.target,
      requirement: null,
      request: records.request,
      receipt: null,
    })).toThrow(/without a requirement/u);
  });
});
