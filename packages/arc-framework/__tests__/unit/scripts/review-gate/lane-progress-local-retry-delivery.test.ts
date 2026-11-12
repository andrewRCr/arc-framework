/** Delivery retry projection respects the complete driver admission. */

import { describe, expect, it } from "vitest";
import { createDeliveryLocalReviewAdmission, createLocalReviewPreparationFixture } from
  "../../../fixtures/local-review-preparation.js";
import { createReviewReceipt } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { readLaneProgress, readLaneProgressAcrossLineage, recordLocalReceiptConclusion } from
  "../../../../src/scripts/review-gate/lane-progress.js";
import { DeliveryLocalReviewAdmissionSchema, type DeliveryLocalReviewAdmission } from
  "../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { attemptMatchesTarget } from
  "../../../../src/scripts/review-gate/policy/hosted-reservation-support.js";
import { prepareLocalReview } from "../../../../src/scripts/review-gate/runtime/local-prepare.js";

type Fixture = ReturnType<typeof createLocalReviewPreparationFixture>;

function admissionFor(fixture: Fixture, additionalPass = false): DeliveryLocalReviewAdmission {
  const admission = createDeliveryLocalReviewAdmission(fixture.memberTarget.headSha);
  return DeliveryLocalReviewAdmissionSchema.parse(additionalPass ? {
    ...admission, pass: 2,
    additionalPassAuthorization: {
      target: admission.target, lane: "standard", precedingProducerId: "preceding-producer",
      completedPasses: 1, nextPass: 2,
    },
  } : admission);
}

async function prepare(fixture: Fixture, deliveryAdmission: DeliveryLocalReviewAdmission) {
  const result = await prepareLocalReview({
    schemaVersion: 1, evaluatorIdentity: "evaluator-1", deliveryAdmission,
    routingFacts: {
      contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary",
    },
  }, fixture.dependencies);
  const state = fixture.published();
  if (result.state !== "ready" || state?.kind !== "local-review") throw new Error("local admission not ready");
  return state;
}

async function retryHistory(
  additionalPass: boolean,
  change: (admission: DeliveryLocalReviewAdmission) => DeliveryLocalReviewAdmission,
) {
  const fixture = createLocalReviewPreparationFixture();
  const admission = admissionFor(fixture, additionalPass);
  const original = await prepare(fixture, admission);
  const receipt = createReviewReceipt({
    target: original.target, requirement: original.requirement, request: original.request,
    applicabilityId: null, reviewRunId: "failed-run", evaluatorIdentity: original.request.evaluatorIdentity,
    attestingRuntimeIdentity: original.attestation.runtimeIdentity,
    attestationMechanism: original.attestation.mechanism, providerEventIdentity: null, result: "failed", findings: [],
  });
  await recordLocalReceiptConclusion(fixture.dependencies.operationStore, {
    state: original, receipt, now: fixture.dependencies.now(),
  });
  const next = await prepare(fixture, DeliveryLocalReviewAdmissionSchema.parse(change(admission)));
  const owner = fixture.laneProgress();
  const input = {
    lane: "standard" as const, repositoryId: next.repositoryId, headSha: next.target.headSha, lineage: next.lineage,
  };
  const projections = [
    await readLaneProgress(fixture.dependencies.operationStore, input),
    await readLaneProgressAcrossLineage(fixture.dependencies.operationStore, { ...input, lineageHeadShas: [input.headSha] }),
  ];
  expect(next.retryGeneration).toBe(original.retryGeneration + 1);
  expect(owner?.attempts.map(({ outcome }) => outcome)).toEqual(["terminal-failure", "pending"]);
  expect(fixture.laneProgress()).toEqual(owner);
  return { original, next, admission, projections };
}

describe("delivery local retry policy projection", () => {
  it.each([false, true])("collapses matching complete admissions with additional pass %s", async (additionalPass) => {
    const { next, projections } = await retryHistory(additionalPass, (admission) => ({
      ...admission, statusTarget: { ...admission.statusTarget }, target: { ...admission.target },
    }));
    for (const progress of projections) {
      if (progress.status !== "recorded") throw new Error("missing progress");
      expect(progress.attempts.map(({ attemptId }) => attemptId)).toEqual([next.operationId]);
    }
  });

  it.each([
    ["change request", false, (admission: DeliveryLocalReviewAdmission) => ({
      ...admission, target: { ...admission.target, pullRequest: 42 },
    })],
    ["status reference", false, (admission: DeliveryLocalReviewAdmission) => ({
      ...admission, statusTarget: { ...admission.statusTarget, headRef: "delivery/root" },
    })],
    ["status head", false, (admission: DeliveryLocalReviewAdmission) => ({
      ...admission, statusTarget: { ...admission.statusTarget, headSha: "7".repeat(40) },
    })],
    ["additional pass producer", true, (admission: DeliveryLocalReviewAdmission) => ({
      ...admission, additionalPassAuthorization: { ...admission.additionalPassAuthorization!, precedingProducerId: "other-producer" },
    })],
    ["additional pass absence", true, (admission: DeliveryLocalReviewAdmission) => {
      const { additionalPassAuthorization, ...withoutAuthorization } = admission;
      void additionalPassAuthorization;
      return withoutAuthorization;
    }],
  ] as const)("retains failed admission when %s changes", async (_label, additionalPass, change) => {
    const { original, next, admission, projections } = await retryHistory(additionalPass, change);
    for (const progress of projections) {
      if (progress.status !== "recorded") throw new Error("missing progress");
      expect(progress.attempts.map(({ attemptId }) => attemptId)).toEqual([original.operationId, next.operationId]);
      const originalTarget = progress.attempts.filter((attempt) => attemptMatchesTarget(attempt, original.target.headSha, {
        ...admission.target, vehicle: admission.vehicle,
      }));
      expect(originalTarget.map(({ outcome }) => outcome)).toContain("terminal-failure");
    }
  });
});
