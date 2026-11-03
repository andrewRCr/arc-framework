import { describe, expect, it, vi } from "vitest";
import { DeliveryLocalReviewAdmissionSchema } from "../../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { createDeliveryLocalReviewAdmission } from "../../../../fixtures/local-review-preparation.js";

import { CanonicalDigestSchema, canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewRequirement, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  createLocalReviewAdmission,
  resolveLocalReviewAdmission,
} from "../../../../../src/scripts/review-gate/core/local-operation.js";
import type {
  ReviewOperationStateStore,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import { LaneSubjectLineageSchema } from
  "../../../../../src/scripts/review-gate/core/lane-admission.js";
import { projectLocalReviewGuidance } from
  "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";

const objectId = (character: string): string => character.repeat(40);
const digest = (value: string) => canonicalDigest({ value });

function fixture() {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "12345678-1234-1234-1234-123456789abc",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("rubric"),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("fixture requirement unexpectedly exempt");
  return {
    target,
    requirement,
    authority: {
      vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
      authorIdentity: "andrew",
      evaluatorIdentity: "fresh-reviewer",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation" as const,
    },
    laneSourceId: "delegated-agent",
    scopeMode: "whole-target" as const,
    lineage: {
      kind: "candidate" as const,
      candidateId: digest("candidate"),
    },
    logicalPass: 1,
    retryGeneration: 0,
    coverageAdmission: { requestedCoverage: "complete" as const },
    policyBindingDigest: digest("local-policy"),
    requestMechanism: "local-prepare",
  };
}

describe("local review operation identity", () => {
  it("derives the same request and operation identity from the same canonical facts", () => {
    const input = fixture();
    expect(createLocalReviewAdmission(input)).toEqual(createLocalReviewAdmission(input));
  });

  it("uses new operation and request identities when an Errand claim changes at the same head", () => {
    const input = fixture();
    const errand = (claimId: string) => createLocalReviewAdmission({
      ...input,
      authority: {
        ...input.authority,
        vehicle: { kind: "errand", identity: "review-surface-binding", claimId },
      },
    });

    expect(errand("claim-1").operationId).not.toBe(errand("claim-2").operationId);
    expect(errand("claim-1").carrier.request.requestId)
      .not.toBe(errand("claim-2").carrier.request.requestId);
  });

  it("returns an identical existing operation and re-verifies it without rebuilding", async () => {
    const admission = createLocalReviewAdmission(fixture());
    const state = operationState(admission);
    const store: ReviewOperationStateStore = {
      readOperation: vi.fn(async () => ({ version: 1, state })),
      publishOperation: vi.fn(),
    };
    const verifyExisting = vi.fn(async () => undefined);

    await expect(resolveLocalReviewAdmission(fixture(), { store, verifyExisting })).resolves.toMatchObject({
      state: "existing",
      operationId: admission.operationId,
      persistedVersion: 1,
    });
    expect(verifyExisting).toHaveBeenCalledWith(state);
    expect(store.publishOperation).not.toHaveBeenCalled();
  });

  it("admits a new operation identity when any keyed fact differs", async () => {
    const baseline = fixture();
    const original = createLocalReviewAdmission(baseline);
    const variants = [
      { ...baseline, requestMechanism: "local-resume" },
      { ...baseline, policyBindingDigest: digest("stricter-policy") },
      { ...baseline, laneSourceId: "other-local-source" },
      { ...baseline, scopeMode: "chunked" as const },
      { ...baseline, authority: { ...baseline.authority, evaluatorIdentity: "other-reviewer" } },
    ];
    const store: ReviewOperationStateStore = {
      readOperation: vi.fn(async () => ({ version: 0, state: null })),
      publishOperation: vi.fn(),
    };

    for (const variant of variants) {
      const resolution = await resolveLocalReviewAdmission(variant, {
        store,
        verifyExisting: async () => undefined,
      });
      expect(resolution).toMatchObject({ state: "new" });
      expect(resolution.operationId).not.toBe(original.operationId);
    }
  });

  it("binds lineage, logical pass, and retry generation into request and operation identity", () => {
    const baseline = fixture();
    const original = createLocalReviewAdmission(baseline);
    const variants = [
      { ...baseline, logicalPass: 2 },
      { ...baseline, retryGeneration: 1 },
      {
        ...baseline,
        lineage: { kind: "candidate" as const, candidateId: digest("another-candidate") },
      },
      {
        ...baseline,
        lineage: LaneSubjectLineageSchema.parse({
          kind: "delivery-member" as const,
          planId: "123e4567-e89b-12d3-a456-426614174000",
          workUnitId: "review-surface-binding",
          deliverableId: digest("sibling-member"),
        }),
      },
    ];

    for (const variant of variants) {
      const admission = createLocalReviewAdmission(variant);
      expect(admission.operationId).not.toBe(original.operationId);
      expect(admission.carrier.request.requestId).not.toBe(original.carrier.request.requestId);
    }
  });
});

function memberInput() {
  const input = fixture(), { targetId: _targetId, ...fields } = input.target;
  void _targetId;
  const target = createReviewTarget({ ...fields, kind: "delivery-member" });
  const requirement = createReviewRequirement({ target, projection: { obligation: "recommended", reasons: ["routine-code"],
    rubricVersion: "standard-review/v1", rubricDigest: digest("rubric"), retrigger: "full-final", count: 1 },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }], initialAdmission: "checkpoint" });
  if (requirement === null) throw new Error("Expected review requirement");
  const deliveryAdmission = DeliveryLocalReviewAdmissionSchema.parse(createDeliveryLocalReviewAdmission(target.headSha));
  const { head: _head, ...lineage } = deliveryAdmission.vehicle;
  void _head;
  return { ...input, target, requirement, deliveryAdmission, lineage: LaneSubjectLineageSchema.parse(lineage),
    authority: { ...input.authority, vehicle: { kind: "delivery-member" as const, identity: deliveryAdmission.vehicle.deliverableId } } };
}

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("keeps delivery operation and request identities stable across transient %s references", field => {
  const input = memberInput(), target = input.deliveryAdmission.target;
  const grant = field === "ceilingOverride" ? { target, lane: "standard" as const, exhaustedPassCount: 0, nextPass: 1 }
    : { target, lane: "standard" as const, precedingProducerId: "producer-1", completedPasses: 0, nextPass: 1 };
  const baseline = createLocalReviewAdmission({ ...input, deliveryAdmission: { ...input.deliveryAdmission, [field]: grant } });
  const decisionKey = digest(field);
  const referenced = createLocalReviewAdmission({ ...input,
    deliveryAdmission: { ...input.deliveryAdmission, [field]: { ...grant, decisionKey } } });
  expect(referenced.operationId).toBe(baseline.operationId);
  expect(referenced.carrier.request.requestId).toBe(baseline.carrier.request.requestId);
  expect(referenced.deliveryAdmission?.[field]).toHaveProperty("decisionKey", decisionKey);
});

function operationState(admission: ReturnType<typeof createLocalReviewAdmission>) {
    const guidance = projectLocalReviewGuidance();
    return {
      schemaVersion: 1 as const,
      semanticsVersion: "review-operation/v1" as const,
      kind: "local-review" as const,
      operationId: admission.operationId,
      updatedAt: "2026-07-23T17:00:00Z",
      vehicle: admission.authority.vehicle,
      repositoryId: admission.target.repositoryId,
      targetId: admission.target.targetId,
      requestId: admission.carrier.request.requestId,
      policyVersion: admission.requirement.policyVersion,
      policyBindingDigest: CanonicalDigestSchema.parse(admission.policyBindingDigest),
      laneSourceId: admission.laneSourceId,
      lineage: admission.lineage,
      logicalPass: admission.logicalPass,
      retryGeneration: admission.retryGeneration,
      coverageAdmission: admission.coverageAdmission,
      scopeMode: admission.scopeMode,
      attestationRuntimeKind: admission.authority.attestationRuntimeKind,
      sourceRef: "review-source.json",
      sourceDigest: digest("source"),
      guidance: guidance.projection,
      guidanceDigest: CanonicalDigestSchema.parse(guidance.guidanceDigest),
      reviewerInstructions: guidance.reviewerInstructions,
      target: admission.target,
      requirement: admission.requirement,
      request: admission.carrier.request,
      attestation: admission.carrier.attestation,
      cleanupTtlMs: 60_000,
      ...(admission.deliveryAdmission === undefined ? {} : { deliveryAdmission: admission.deliveryAdmission }),
    };
}

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("reuses an existing delivery operation across transient %s references", async field => {
  const input = memberInput(), target = input.deliveryAdmission.target;
  const grant = field === "ceilingOverride" ? { target, lane: "standard" as const, exhaustedPassCount: 0, nextPass: 1 }
    : { target, lane: "standard" as const, precedingProducerId: "producer-1", completedPasses: 0, nextPass: 1 };
  const original = { ...input, deliveryAdmission: { ...input.deliveryAdmission, [field]: grant } };
  const admission = createLocalReviewAdmission(original), state = operationState(admission);
  const store: ReviewOperationStateStore = { readOperation: async () => ({ version: 1, state }), publishOperation: vi.fn() };
  const result = await resolveLocalReviewAdmission({ ...input,
    deliveryAdmission: { ...input.deliveryAdmission, [field]: { ...grant, decisionKey: digest(field) } } },
    { store, verifyExisting: async () => undefined });
  expect(result).toMatchObject({ state: "existing", operationId: admission.operationId,
    deliveryAdmission: { [field]: { decisionKey: digest(field) } }, persistedState: { operationId: admission.operationId } });
});
