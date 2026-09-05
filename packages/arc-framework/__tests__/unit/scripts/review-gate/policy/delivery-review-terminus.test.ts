/** Exact member-scoped Owner terminus acceptance. */

import { describe, expect, it, vi } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import { IntegrationBoundaryLocusSchema } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  DeliveryReviewTerminusAcceptanceInputSchema,
  DeliveryReviewTerminusOfferSchema,
  resolveDeliveryReviewTerminusAcceptance,
} from "../../../../../src/scripts/review-gate/policy/delivery-review-terminus.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const planId = "123e4567-e89b-42d3-a456-426614174000";
const vehicle = DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId,
  deliverableId: digest("d"),
  workUnitId: "example",
  head: oid("a"),
});
const boundary = IntegrationBoundaryLocusSchema.parse({
  schemaVersion: 1,
  mode: "integration-boundary",
  workUnit: "example",
  candidateId: digest("c"),
  candidateSubjectDigest: digest("f"),
  terminus: null,
  locus: "delivery-status-required",
  nextAction: {
    kind: "resolve-delivery-status",
    workUnitId: "example",
    command: "arc review status --work-unit example --json",
    interactionText: "Resume the retained delivery-member review conjunction.",
  },
  policy: null,
  reservation: {
    schemaVersion: 1,
    semanticsVersion: "standard-review-reservation/v1",
    reservationId: digest("a"),
    sources: ["coderabbit-pr"],
    target: { kind: "delivery", repository: "owner/repo", workUnitId: "example", planId },
    obligation: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("e"),
      retrigger: "full-final",
      count: 1,
    },
  },
});
const offer = DeliveryReviewTerminusOfferSchema.parse({
  schemaVersion: 1,
  kind: "delivery-member-owner-terminus",
  workUnitId: "example",
  remote: "upstream",
  expectedBoundaryVersion: digest("b"),
  candidateId: boundary.candidateId,
  candidateSubjectDigest: boundary.candidateSubjectDigest,
  target: { repository: "owner/repo", pullRequest: 41, headSha: vehicle.head },
  vehicle,
  completedPasses: 7,
  interactionText: "Accept the standard-review terminus for this exact delivery member without claiming clean.",
});
const request = DeliveryReviewTerminusAcceptanceInputSchema.parse({
  schemaVersion: 1,
  offer,
  judgment: { mode: "owner-accepted" },
});

describe("delivery review Owner terminus", () => {
  it("records one exact member terminus through the versioned boundary", async () => {
    const writeBoundary = vi.fn(async () => ({
      status: "written" as const,
      path: ".arc/system/.internal/candidates/example.boundary.json",
    }));

    const result = await resolveDeliveryReviewTerminusAcceptance(request, {
      readBoundary: async () => ({ boundary, version: offer.expectedBoundaryVersion }),
      readOwnerAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
      readCurrentOffer: async () => offer,
      writeBoundary,
    });

    expect(result).toMatchObject({
      state: "recorded",
      nextAction: "commit-boundary",
      boundaryPath: ".arc/system/.internal/candidates/example.boundary.json",
      record: {
        vehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 7,
        },
      },
    });
    expect(writeBoundary).toHaveBeenCalledWith(expect.objectContaining({
      deliveryReviewTermini: [{
        vehicle,
        terminus: expect.objectContaining({ acceptedBy: "andrew", completedPasses: 7 }),
      }],
    }), offer.expectedBoundaryVersion);
  });

  it("treats an exact recorded member terminus as a no-write replay", async () => {
    const record = {
      vehicle,
      terminus: {
        schemaVersion: 1 as const,
        semanticsVersion: "review-terminus/v1" as const,
        kind: "owner-accepted" as const,
        lane: "standard" as const,
        acceptedBy: "andrew",
        completedPasses: 7,
      },
    };
    const writeBoundary = vi.fn();

    await expect(resolveDeliveryReviewTerminusAcceptance(request, {
      readBoundary: async () => ({
        boundary: IntegrationBoundaryLocusSchema.parse({ ...boundary, deliveryReviewTermini: [record] }),
        version: digest("n"),
      }),
      readOwnerAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
      readCurrentOffer: async () => null,
      writeBoundary,
    })).resolves.toMatchObject({ state: "exact-replay", nextAction: "continue", record });
    expect(writeBoundary).not.toHaveBeenCalled();
  });

  it.each([
    ["changed boundary", { version: digest("n") }, { status: "authorized", ownerIdentity: "andrew" }],
    ["non-Owner identity", { version: offer.expectedBoundaryVersion }, { status: "refused", reason: "not-owner" }],
  ] as const)("refuses a %s before mutation", async (_label, boundaryOverride, authority) => {
    const writeBoundary = vi.fn();
    const result = await resolveDeliveryReviewTerminusAcceptance(request, {
      readBoundary: async () => ({ boundary, ...boundaryOverride }),
      readOwnerAuthority: async () => authority,
      readCurrentOffer: async () => offer,
      writeBoundary,
    });

    expect(result).toMatchObject({ state: "refused", nextAction: "rerun-status" });
    expect(writeBoundary).not.toHaveBeenCalled();
  });

  it("returns a stale-offer refusal when the boundary CAS loses its race", async () => {
    const result = await resolveDeliveryReviewTerminusAcceptance(request, {
      readBoundary: async () => ({ boundary, version: offer.expectedBoundaryVersion }),
      readOwnerAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
      readCurrentOffer: async () => offer,
      writeBoundary: async () => ({ status: "version-conflict" }),
    });

    expect(result).toMatchObject({
      state: "refused",
      nextAction: "rerun-status",
      reason: "stale-offer",
    });
  });

  it("refuses when another completed pass changes the current offer", async () => {
    const writeBoundary = vi.fn();
    const changedOffer = DeliveryReviewTerminusOfferSchema.parse({
      ...offer,
      completedPasses: offer.completedPasses + 1,
    });

    await expect(resolveDeliveryReviewTerminusAcceptance(request, {
      readBoundary: async () => ({ boundary, version: offer.expectedBoundaryVersion }),
      readOwnerAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
      readCurrentOffer: async () => changedOffer,
      writeBoundary,
    })).resolves.toMatchObject({
      state: "refused",
      nextAction: "rerun-status",
      reason: "stale-offer",
    });
    expect(writeBoundary).not.toHaveBeenCalled();
  });
});
