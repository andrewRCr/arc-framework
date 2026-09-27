/** Delivery landing admission from exact-target review observations. */

import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../src/lib/delivery/review-vehicle.js";
import {
  assessDeliveryLandingReviewReadiness,
  createDeliveryLandingSetReviewReadiness,
} from
  "../../../../src/scripts/review-gate/delivery-landing-readiness.js";
import { resolveReviewPolicy } from
  "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { composeDeliveryReviewObligation, RoutedReviewObligationSchema, type ReviewStatusObservation,
  type ReviewStatusPort } from
  "../../../../src/scripts/review-gate/status.js";

const head = "a".repeat(40);
const target = { repository: "owner/repo", headRef: "delivery/member", headSha: head };
const secondTarget = {
  repository: target.repository,
  headRef: "delivery/member-2",
  headSha: "c".repeat(40),
};

function port(observation: ReviewStatusObservation): ReviewStatusPort {
  return { observe: async () => observation };
}

function observation(
  overrides: Partial<ReviewStatusObservation> = {},
): ReviewStatusObservation {
  return {
    actualHeadSha: head,
    requiredChecks: "green",
    routedObligation: RoutedReviewObligationSchema.parse({
      state: "settled",
      detail: "Every retained delivery-member review is discharged.",
      conjunction: {
        kind: "delivery",
        status: "discharged",
        members: [{
          position: 1,
          memberCount: 1,
          chunkKey: "member-1",
          title: "Member 1",
          target: { repository: target.repository, pullRequest: 41, headSha: head },
          vehicle: {
            kind: "delivery-member",
            planId: "123e4567-e89b-42d3-a456-426614174000",
            deliverableId: `sha256:${"1".repeat(64)}`,
            workUnitId: "delivery-test",
            head,
          },
          state: "discharged",
          detail: "The exact member review is discharged.",
          progress: {
            completedPasses: 1,
            completePasses: 1,
            passCeiling: 2,
            attempts: [],
          },
        }],
      },
    }),
    currentBaseOid: "b".repeat(40),
    baseContained: false,
    ...overrides,
  };
}

function deliveryObligation(secondDischarged: boolean) {
  const targets = [target, secondTarget].map((member, index) => ({
    repository: member.repository,
    pullRequest: 41 + index,
    headSha: member.headSha,
    vehicle: DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: "123e4567-e89b-42d3-a456-426614174000",
      deliverableId: `sha256:${String(index + 1).repeat(64)}`,
      workUnitId: "delivery-test",
      head: member.headSha,
    }),
    position: index + 1,
    memberCount: 2,
    chunkKey: `member-${String(index + 1)}`,
    title: `Member ${String(index + 1)}`,
  }));
  const second = targets[1];
  if (second === undefined) throw new Error("missing second member");
  const requestAdmission = secondDischarged ? undefined : resolveReviewPolicy({
    schemaVersion: 1,
    target: { repository: second.repository, pullRequest: second.pullRequest, headSha: second.headSha },
    lane: "standard",
    standardReview: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"e".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
    sources: ["codex-pr"],
    maxPasses: 2,
    completedPasses: 0,
    attempts: [],
  });
  return composeDeliveryReviewObligation({
    targets,
    discharges: [{
      discharged: true,
      detail: "member one discharged",
      nextSource: null,
      completedPasses: 1,
      completePasses: 1,
      passCeiling: 2,
      attemptHistory: [],
    }, {
      discharged: secondDischarged,
      detail: secondDischarged ? "member two discharged" : "member two outstanding",
      nextSource: secondDischarged ? null : "codex-pr",
      requestAdmission,
      completedPasses: 0,
      completePasses: 0,
      passCeiling: 2,
      attemptHistory: [],
    }],
  });
}

describe("delivery landing review readiness", () => {
  it("shares one delivery-review conjunction across independent exact member reads", async () => {
    let sharedReadCount = 0;
    const sharedStatus: ReviewStatusPort = {
      observe: async (selected) => observation({
        actualHeadSha: selected.headSha,
        routedObligation: sharedReadCount++ === 0
          ? deliveryObligation(true)
          : { state: "blocked", detail: "The delivery reduction was repeated." },
      }),
    };
    const readiness = createDeliveryLandingSetReviewReadiness(
      target,
      sharedStatus,
      (selected, routedObligation) => port(observation({
        actualHeadSha: selected.headSha,
        routedObligation,
      })),
    );

    await expect(Promise.all([readiness(target), readiness(secondTarget)]))
      .resolves.toEqual([{ status: "ready" }, { status: "ready" }]);
  });

  it("admits a discharged exact member while a later member still needs review", async () => {
    const routedObligation = deliveryObligation(false);
    expect(routedObligation.state).toBe("review-required");

    await expect(assessDeliveryLandingReviewReadiness(
      target,
      port(observation({ routedObligation })),
    )).resolves.toEqual({ status: "ready" });
    await expect(assessDeliveryLandingReviewReadiness(
      secondTarget,
      port(observation({ actualHeadSha: secondTarget.headSha, routedObligation })),
    )).resolves.toEqual({ status: "refused", reason: "review-unsettled" });
  });

  it("admits only the discharged member in a shared native landing read", async () => {
    const routedObligation = deliveryObligation(false);
    const readiness = createDeliveryLandingSetReviewReadiness(
      target,
      port(observation({ routedObligation })),
      (selected, sharedObligation) => port(observation({
        actualHeadSha: selected.headSha,
        routedObligation: sharedObligation,
      })),
    );

    await expect(readiness(target)).resolves.toEqual({ status: "ready" });
    await expect(readiness(secondTarget))
      .resolves.toEqual({ status: "refused", reason: "review-unsettled" });
  });

  it("refuses a target absent from a settled delivery conjunction", async () => {
    const unrelated = { ...target, headSha: "d".repeat(40) };
    await expect(assessDeliveryLandingReviewReadiness(
      unrelated,
      port(observation({
        actualHeadSha: unrelated.headSha,
        routedObligation: deliveryObligation(true),
      })),
    )).resolves.toEqual({ status: "refused", reason: "review-unsettled" });
  });

  it.each(["green", "not-required"] as const)(
    "admits a settled exact head with %s checks",
    async (requiredChecks) => {
      await expect(assessDeliveryLandingReviewReadiness(
        target,
        port(observation({ requiredChecks })),
      )).resolves.toEqual({ status: "ready" });
    },
  );

  it.each(["review-required", "blocked"] as const)(
    "refuses a %s routed obligation",
    async (state) => {
      await expect(assessDeliveryLandingReviewReadiness(
        target,
        port(observation({ routedObligation: { state, detail: "Review is not settled." } })),
      )).resolves.toEqual({ status: "refused", reason: "review-unsettled" });
    },
  );

  it.each(["pending", "failed", "unavailable"] as const)(
    "refuses %s required checks",
    async (requiredChecks) => {
      await expect(assessDeliveryLandingReviewReadiness(
        target,
        port(observation({ requiredChecks })),
      )).resolves.toEqual({ status: "refused", reason: "checks-not-green" });
    },
  );

  it("refuses a moved head and an unavailable observation", async () => {
    await expect(assessDeliveryLandingReviewReadiness(
      target,
      port(observation({ actualHeadSha: "c".repeat(40) })),
    )).resolves.toEqual({ status: "refused", reason: "stale-target" });

    await expect(assessDeliveryLandingReviewReadiness(target, {
      observe: async () => { throw new Error("unavailable"); },
    })).resolves.toEqual({ status: "refused", reason: "status-unavailable" });
  });
});
