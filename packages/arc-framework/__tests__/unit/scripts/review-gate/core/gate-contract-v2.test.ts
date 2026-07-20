import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  ReviewAcceptedSourceSchema,
  ReviewCarrierSchema,
  ReviewReceiptV2Schema,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import {
  createReviewReceipt,
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
  validateReviewReceipt,
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";

const objectId = (character: string): string => character.repeat(40);

describe("review gate v2 contract", () => {
  it("derives one exact change-set target from its registered preimage", () => {
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

    expect(target).toEqual({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      targetId: canonicalDigest({
        domain: "arc.review-gate.target-id/v2",
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: objectId("a"),
        diffBaseTree: objectId("b"),
        headSha: objectId("c"),
        headTree: objectId("d"),
      }),
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });
  });

  it("derives one actor-separated request for one hosted carrier", () => {
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
    const requirementId = canonicalDigest({ requirement: "independent-analysis" });
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId,
      carrier: {
        kind: "change-request",
        adapterId: "github",
        changeRequestId: "pull/42",
      },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    });

    expect(request.requestId).toBe(canonicalDigest({
      domain: "arc.review-gate.request-id/v2",
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: "repo-1",
      targetId: target.targetId,
      requirementId,
      carrier: {
        kind: "change-request",
        adapterId: "github",
        changeRequestId: "pull/42",
      },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    }));
    expect(request.targetId).toBe(target.targetId);
    expect(request.requirementId).toBe(requirementId);
  });

  it("keeps semantic IDs canonical while Git object IDs remain bare", () => {
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

    expect(target.targetId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(target.headSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(() => createReviewTarget({
      ...target,
      headSha: `sha256:${target.headSha}`,
    })).toThrow();
    expect(() => createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: objectId("e"),
      carrier: { kind: "local-change-set", adapterId: "local", changeRequestId: null },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    })).toThrow();
  });

  it("rejects invalid binding, hosted identity, actor, and envelope shapes", () => {
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
    const base = {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: canonicalDigest({ requirement: "analysis" }),
      carrier: { kind: "change-request" as const, adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    };

    expect(() => createReviewRequest(target, { ...base, repositoryId: "repo-2" })).toThrow(/repository/u);
    expect(() => createReviewRequest(target, { ...base, targetId: canonicalDigest({ target: "other" }) }))
      .toThrow(/target/u);
    expect(() => createReviewRequest(target, { ...base, evaluatorIdentity: "andrew" })).toThrow(/differ/u);
    expect(() => createReviewRequest(target, {
      ...base,
      carrier: { kind: "change-request", adapterId: "github", changeRequestId: null },
    } as unknown as Parameters<typeof createReviewRequest>[1])).toThrow();
    expect(() => createReviewRequest(target, {
      ...base,
      ambientObservation: "ignored",
    } as Parameters<typeof createReviewRequest>[1])).toThrow(/unrecognized key/iu);
  });

  it("rejects target and carrier retargeting without a newly derived ID", () => {
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
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: canonicalDigest({ requirement: "analysis" }),
      carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    });

    expect(() => validateReviewTarget({ ...target, headSha: objectId("f") })).toThrow(/target ID/u);
    expect(() => validateReviewRequest(target, {
      ...request,
      carrier: { ...request.carrier, changeRequestId: "pull/43" },
    })).toThrow(/request ID/u);
  });

  it("binds one normalized logical obligation into one exact requirement", () => {
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
    const rubricDigest = INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest;
    const policyVersion = canonicalDigest({ policy: "self-hosting/v2" });
    const requirement = createReviewRequirement({
      target,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set", "sensitive-change-set"],
        rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
        rubricDigest,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [
        { sourceKind: "human", qualifier: null },
        { sourceKind: "agent", qualifier: "independent-analysis/v1" },
        { sourceKind: "human", qualifier: null },
      ],
      initialAdmission: "automatic",
      policyVersion,
    });
    if (requirement === null) throw new Error("expected a non-exempt requirement");

    expect(requirement.reasons).toEqual(["sensitive-change-set"]);
    expect(requirement.acceptableSources).toEqual([
      { sourceKind: "agent", qualifier: "independent-analysis/v1" },
      { sourceKind: "human", qualifier: null },
    ]);
    expect(requirement.requirementId).toBe(canonicalDigest({
      domain: "arc.review-gate.requirement-id/v2",
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: target.targetId,
      kind: "independent-analysis",
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest,
      retrigger: "full-final",
      count: 1,
      acceptableSources: [
        { sourceKind: "agent", qualifier: "independent-analysis/v1" },
        { sourceKind: "human", qualifier: null },
      ],
      initialAdmission: "automatic",
      policyVersion,
    }));
  });

  it("binds terminal evidence to the exact request, target, rubric, and attesting runtime", () => {
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
    const rubricDigest = INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest;
    const requirement = createReviewRequirement({
      target,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
        rubricDigest,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
      initialAdmission: "automatic",
      policyVersion: canonicalDigest({ policy: "self-hosting/v2" }),
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
      evaluatorIdentity: "reviewer-1",
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: null,
      result: "clean",
    });
    expect(receipt).toEqual({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      requestId: request.requestId,
      targetId: target.targetId,
      requirementId: requirement.requirementId,
      applicabilityId: null,
      reviewRunId: "run-7",
      evaluatorIdentity: "reviewer-1",
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: null,
      rubricVersion: requirement.rubricVersion,
      rubricDigest,
      result: "clean",
    });

    expect(() => ReviewAcceptedSourceSchema.parse({ sourceKind: "human" })).toThrow();
    expect(() => ReviewCarrierSchema.parse({ kind: "local-change-set", adapterId: "local" })).toThrow();
    for (const nullableKey of ["applicabilityId", "providerEventIdentity"] as const) {
      const withoutExplicitNull = Object.fromEntries(
        Object.entries(receipt).filter(([key]) => key !== nullableKey),
      );
      expect(() => ReviewReceiptV2Schema.parse(withoutExplicitNull)).toThrow();
    }
  });

  it("pins domain-separated golden IDs and set-order invariance", () => {
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
    const requirementIdSeed = canonicalDigest({ requirement: "independent-analysis" });
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: "repo-1",
      targetId: target.targetId,
      requirementId: requirementIdSeed,
      carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    });
    const requirementInput = {
      target,
      projection: {
        obligation: "required" as const,
        reasons: ["sensitive-change-set" as const],
        rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
        rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
        retrigger: "full-final" as const,
        count: 1 as const,
      },
      acceptableSources: [
        { sourceKind: "human", qualifier: null },
        { sourceKind: "agent", qualifier: "independent-analysis/v1" },
      ],
      initialAdmission: "automatic" as const,
      policyVersion: canonicalDigest({ policy: "self-hosting/v2" }),
    };
    const requirement = createReviewRequirement(requirementInput);
    const reordered = createReviewRequirement({
      ...requirementInput,
      projection: {
        ...requirementInput.projection,
        reasons: ["sensitive-change-set", "sensitive-change-set"],
      },
      acceptableSources: [...requirementInput.acceptableSources].reverse(),
    });
    if (requirement === null || reordered === null) throw new Error("expected requirements");

    expect({
      targetId: target.targetId,
      requestId: request.requestId,
      requirementId: requirement.requirementId,
    }).toEqual({
      targetId: "sha256:d4289a08f0d41356739446723949aaf892a2de41fb6510f6f065a4c93b26bcbd",
      requestId: "sha256:480e17fe526675904ddc4124b18108214be44b199a82dad7a8d6e5f7990aea8b",
      requirementId: "sha256:cb4b827d547becb161814c809b8bf95151c2b1bee5e811264c4ac3ff31591d3f",
    });
    expect(new Set([target.targetId, request.requestId, requirement.requirementId]).size).toBe(3);
    expect(reordered.requirementId).toBe(requirement.requirementId);
  });

  it("changes each ID for one semantic field and rejects self-ID reuse", () => {
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
    const movedTarget = createReviewTarget({
      schemaVersion: target.schemaVersion,
      semanticsVersion: target.semanticsVersion,
      kind: target.kind,
      repositoryId: target.repositoryId,
      baseRef: target.baseRef,
      diffBaseSha: target.diffBaseSha,
      diffBaseTree: target.diffBaseTree,
      headSha: target.headSha,
      headTree: objectId("e"),
    });
    expect(movedTarget.targetId).not.toBe(target.targetId);

    const requestInput = {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: canonicalDigest({ requirement: "analysis" }),
      carrier: { kind: "change-request" as const, adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    };
    const request = createReviewRequest(target, requestInput);
    expect(createReviewRequest(target, { ...requestInput, generation: 1 }).requestId).not.toBe(request.requestId);

    const requirementInput = {
      target,
      projection: {
        obligation: "required" as const,
        reasons: ["sensitive-change-set" as const],
        rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
        rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
        retrigger: "full-final" as const,
        count: 1 as const,
      },
      acceptableSources: [{ sourceKind: "agent", qualifier: null }],
      initialAdmission: "automatic" as const,
      policyVersion: canonicalDigest({ policy: "self-hosting/v2" }),
    };
    const requirement = createReviewRequirement(requirementInput);
    const checkpoint = createReviewRequirement({ ...requirementInput, initialAdmission: "checkpoint" });
    if (requirement === null || checkpoint === null) throw new Error("expected requirements");
    expect(checkpoint.requirementId).not.toBe(requirement.requirementId);
    expect(() => validateReviewRequirement(target, {
      ...requirement,
      reasons: ["routine-code"],
    })).toThrow(/requirement ID/u);
  });

  it("refuses mismatched terminal receipt bindings", () => {
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
      acceptableSources: [{ sourceKind: "agent", qualifier: null }],
      initialAdmission: "automatic",
      policyVersion: canonicalDigest({ policy: "self-hosting/v2" }),
    });
    if (requirement === null) throw new Error("expected requirement");
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: requirement.requirementId,
      carrier: { kind: "local-change-set", adapterId: "local", changeRequestId: null },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    });

    expect(() => createReviewReceipt({
      target,
      requirement,
      request,
      applicabilityId: null,
      reviewRunId: "run-7",
      evaluatorIdentity: "reviewer-2",
      attestingRuntimeIdentity: "local-attestor",
      attestationMechanism: "local-runtime",
      providerEventIdentity: null,
      result: "clean",
    })).toThrow(/evaluator/u);

    const receipt = createReviewReceipt({
      target,
      requirement,
      request,
      applicabilityId: null,
      reviewRunId: "run-7",
      evaluatorIdentity: "reviewer-1",
      attestingRuntimeIdentity: "local-attestor",
      attestationMechanism: "local-runtime",
      providerEventIdentity: null,
      result: "clean",
    });
    expect(() => validateReviewReceipt(target, requirement, request, {
      ...receipt,
      rubricDigest: canonicalDigest({ rubric: "other" }),
    })).toThrow(/rubric/u);
  });
});
