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
  STANDARD_REVIEW_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/standard-review.js";

const objectId = (character: string): string => character.repeat(40);

interface PolicyIdentityOverride {
  obligation?: "recommended" | "required";
  acceptableSources?: Array<{ sourceKind: string; qualifier: string | null }>;
  initialAdmission?: "automatic" | "checkpoint";
  rubricVersion?: string;
  rubricDigest?: `sha256:${string}`;
  retrigger?: "incremental" | "full-final";
}

const policyIdentityChanges: ReadonlyArray<readonly [string, PolicyIdentityOverride]> = [
  ["obligation", { obligation: "recommended" }],
  ["source qualifier", { acceptableSources: [{ sourceKind: "agent", qualifier: "carrier/v2" }] }],
  ["admission", { initialAdmission: "checkpoint" }],
  ["rubric version", { rubricVersion: "standard-review/v2" }],
  ["rubric digest", { rubricDigest: canonicalDigest({ rubric: "replacement" }) }],
  ["retrigger", { retrigger: "incremental" }],
];

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
    const requirementId = canonicalDigest({ requirement: "standard-review" });
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
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
      // @ts-expect-error Exercise runtime rejection of a Git OID in a semantic ID slot.
      requirementId: objectId("e"),
      carrier: { kind: "local-change-set", adapterId: "local", changeRequestId: null },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
    const rubricDigest = STANDARD_REVIEW_RUBRIC_IDENTITY.digest;
    const requirement = createReviewRequirement({
      target,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set", "sensitive-change-set"],
        rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
        rubricDigest,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [
        { sourceKind: "human", qualifier: null },
        { sourceKind: "agent", qualifier: "standard-review/v1" },
        { sourceKind: "human", qualifier: null },
      ],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("expected a non-exempt requirement");

    expect(requirement.reasons).toEqual(["sensitive-change-set"]);
    expect(requirement.acceptableSources).toEqual([
      { sourceKind: "agent", qualifier: "standard-review/v1" },
      { sourceKind: "human", qualifier: null },
    ]);
    expect(requirement.requirementId).toBe(canonicalDigest({
      domain: "arc.review-gate.requirement-id/v2",
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: target.targetId,
      kind: "standard-review",
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest,
      retrigger: "full-final",
      count: 1,
      acceptableSources: [
        { sourceKind: "agent", qualifier: "standard-review/v1" },
        { sourceKind: "human", qualifier: null },
      ],
      initialAdmission: "automatic",
      policyVersion: "sha256:4b42f515d1d68b811c4ff764b02fcbed4c9b121536d40b91b2480e31eb040c02",
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
    const rubricDigest = STANDARD_REVIEW_RUBRIC_IDENTITY.digest;
    const requirement = createReviewRequirement({
      target,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
        rubricDigest,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
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
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
      findings: [],
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
      findings: [],
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
    const requirementIdSeed = canonicalDigest({ requirement: "standard-review" });
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: "repo-1",
      targetId: target.targetId,
      requirementId: requirementIdSeed,
      carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
      generation: 0,
      requestMechanism: "automatic",
    });
    const requirementInput = {
      target,
      projection: {
        obligation: "required" as const,
        reasons: ["sensitive-change-set" as const],
        rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
        rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
        retrigger: "full-final" as const,
        count: 1 as const,
      },
      acceptableSources: [
        { sourceKind: "human", qualifier: null },
        { sourceKind: "agent", qualifier: "standard-review/v1" },
      ],
      initialAdmission: "automatic" as const,
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
      requestId: "sha256:18eafe10b6496574361ed462676a171f8142fd69f849dbf3b49c1c40ac276fc2",
      requirementId: "sha256:5bcc86a859459b05b8f8f249017a3eb46ffe3df51e044500329aee6abbdb93cd",
    });
    expect(new Set([target.targetId, request.requestId, requirement.requirementId]).size).toBe(3);
    expect(reordered.requirementId).toBe(requirement.requirementId);
  });

  it("accepts critical and rejects retired blocker in receipt findings", () => {
    const receipt = {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      requestId: canonicalDigest({ request: "severity" }),
      targetId: canonicalDigest({ target: "severity" }),
      requirementId: canonicalDigest({ requirement: "severity" }),
      applicabilityId: null,
      reviewRunId: "run-severity",
      evaluatorIdentity: "reviewer-1",
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: null,
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "severity" }),
      result: "findings",
      findings: [{
        findingId: "finding-1",
        severity: "critical",
        locus: "src/review.ts:42",
        evidenceUrlOrId: "review:finding-1",
        sourceOrdinal: 1,
      }],
    };

    expect(ReviewReceiptV2Schema.safeParse(receipt).success).toBe(true);
    expect(ReviewReceiptV2Schema.safeParse({
      ...receipt,
      findings: [{ ...receipt.findings[0], severity: "blocker" }],
    }).success).toBe(false);
  });

  it("rejects receipt findings whose ordinals do not match complete capture order", () => {
    const receipt = {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      requestId: canonicalDigest({ request: "ordinal" }),
      targetId: canonicalDigest({ target: "ordinal" }),
      requirementId: canonicalDigest({ requirement: "ordinal" }),
      applicabilityId: null,
      reviewRunId: "run-ordinal",
      evaluatorIdentity: "reviewer-1",
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: null,
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "ordinal" }),
      result: "findings",
      findings: [{
        findingId: "finding-1",
        severity: "major",
        locus: "src/review.ts:42",
        evidenceUrlOrId: "review:finding-1",
        sourceOrdinal: 2,
      }],
    };

    expect(ReviewReceiptV2Schema.safeParse(receipt).success).toBe(false);
  });

  it("separates identical content across the registered ID domains", () => {
    const content = {
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    };
    const domains = [
      "arc.review-gate.target-id/v2",
      "arc.review-gate.request-id/v2",
      "arc.review-gate.requirement-id/v2",
      "arc.review-gate.applicability-id/v2",
    ] as const;
    const digests = domains.map((domain) => canonicalDigest({ domain, ...content }));

    expect(new Set(digests).size).toBe(domains.length);
    expect(canonicalDigest({ domain: domains[0], ...content })).toBe(digests[0]);
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
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
        rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
        rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
        retrigger: "full-final" as const,
        count: 1 as const,
      },
      acceptableSources: [{ sourceKind: "agent", qualifier: null }],
      initialAdmission: "automatic" as const,
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
        rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
        rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "agent", qualifier: null }],
      initialAdmission: "automatic",
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
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
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
      findings: [],
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
      findings: [],
    });
    expect(() => validateReviewReceipt(target, requirement, request, {
      ...receipt,
      rubricDigest: canonicalDigest({ rubric: "other" }),
    })).toThrow(/rubric/u);
  });

  it.each(policyIdentityChanges)("rejects a receipt from a prior %s policy identity", (_field, override) => {
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
    const projection = {
      obligation: "required" as const,
      reasons: ["sensitive-change-set" as const],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final" as const,
      count: 1 as const,
    };
    const acceptableSources = [{ sourceKind: "agent", qualifier: "carrier/v1" }];
    const priorRequirement = createReviewRequirement({
      target,
      projection,
      acceptableSources,
      initialAdmission: "automatic",
    });
    if (priorRequirement === null) throw new Error("expected prior requirement");
    const priorRequest = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: priorRequirement.requirementId,
      carrier: { kind: "local-change-set", adapterId: "local", changeRequestId: null },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      lineageId: canonicalDigest({ lineage: "candidate" }),
      logicalPass: 1,
      generation: 0,
      requestMechanism: "automatic",
    });
    const priorReceipt = createReviewReceipt({
      target,
      requirement: priorRequirement,
      request: priorRequest,
      applicabilityId: null,
      reviewRunId: "run-1",
      evaluatorIdentity: "reviewer-1",
      attestingRuntimeIdentity: "local-attestor",
      attestationMechanism: "local-runtime",
      providerEventIdentity: null,
      result: "clean",
      findings: [],
    });
    const nextRequirement = createReviewRequirement({
      target,
      projection: {
        ...projection,
        obligation: override.obligation ?? projection.obligation,
        rubricVersion: override.rubricVersion ?? projection.rubricVersion,
        rubricDigest: override.rubricDigest ?? projection.rubricDigest,
        retrigger: override.retrigger ?? projection.retrigger,
      },
      acceptableSources: override.acceptableSources ?? acceptableSources,
      initialAdmission: override.initialAdmission ?? "automatic",
    });
    if (nextRequirement === null) throw new Error("expected next requirement");

    expect(nextRequirement.policyVersion).not.toBe(priorRequirement.policyVersion);
    expect(nextRequirement.requirementId).not.toBe(priorRequirement.requirementId);
    expect(() => validateReviewReceipt(
      target,
      nextRequirement,
      priorRequest,
      priorReceipt,
    )).toThrow(/requirement/u);
  });
});

describe("review target kind", () => {
  const targetInputs = {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
  } as const;

  it("admits both target kinds and rejects any other", () => {
    expect(createReviewTarget({ ...targetInputs, kind: "change-set" }).kind).toBe("change-set");
    expect(createReviewTarget({ ...targetInputs, kind: "delivery-member" }).kind).toBe("delivery-member");
    expect(() => createReviewTarget({
      ...targetInputs,
      kind: "delivery-slice",
    } as unknown as Parameters<typeof createReviewTarget>[0])).toThrow();
  });

  it("leaves an ordinary target's identity byte-identical", () => {
    expect(createReviewTarget({ ...targetInputs, kind: "change-set" }).targetId)
      .toBe("sha256:d4289a08f0d41356739446723949aaf892a2de41fb6510f6f065a4c93b26bcbd");
  });

  it("separates the identities of two targets differing only by kind", () => {
    const changeSet = createReviewTarget({ ...targetInputs, kind: "change-set" });
    const member = createReviewTarget({ ...targetInputs, kind: "delivery-member" });

    expect(member.targetId).not.toBe(changeSet.targetId);
    expect(member.targetId).toBe(canonicalDigest({
      domain: "arc.review-gate.target-id/v2",
      ...targetInputs,
      kind: "delivery-member",
    }));
    expect(validateReviewTarget(member)).toEqual(member);
    expect(() => validateReviewTarget({ ...member, kind: "change-set" }))
      .toThrow(/preimage/u);
  });
});
