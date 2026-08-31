/** Delivery landing admission from exact-target review observations. */

import { describe, expect, it } from "vitest";

import { assessDeliveryLandingReviewReadiness } from
  "../../../../src/scripts/review-gate/delivery-landing-readiness.js";
import { RoutedReviewObligationSchema, type ReviewStatusObservation, type ReviewStatusPort } from
  "../../../../src/scripts/review-gate/status.js";

const head = "a".repeat(40);
const target = { repository: "owner/repo", headRef: "delivery/member", headSha: head };

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

describe("delivery landing review readiness", () => {
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
