/** Unit coverage for ordered hosted-review admission. */

import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  assertHostedErrandBindingAuthority,
  assertHostedErrandAdmission,
  assertHostedReservationAdmission,
  configuredSourceSuffix,
  firstAdmissibleHostedSource,
  hostedReservationAttemptsForTarget,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-admission.js";

const reservation = createStandardReviewReservation({
  candidateId: `sha256:${"a".repeat(64)}`,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  repository: "owner/repo",
  headSha: "b".repeat(40),
  obligation: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"c".repeat(64)}`,
    retrigger: "full-final",
    count: 1,
  },
});
const CANDIDATE_ID = `sha256:${"a".repeat(64)}`;
const SUBJECT_DIGEST = `sha256:${"d".repeat(64)}`;
const CURRENT_HEAD = "e".repeat(40);
const DELIVERY_PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const DELIVERY_MEMBER_ID = `sha256:${"f".repeat(64)}`;
const deliveryReservation = createStandardReviewReservation({
  candidateId: CANDIDATE_ID,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  target: {
    kind: "delivery",
    repository: "owner/repo",
    workUnitId: "example",
    planId: DELIVERY_PLAN_ID,
  },
  obligation: reservation.obligation,
});
const deliveryVehicle = DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: DELIVERY_PLAN_ID,
  deliverableId: DELIVERY_MEMBER_ID,
  workUnitId: "example",
  head: "f".repeat(40),
});
const binding = {
  boundary: { candidateId: CANDIDATE_ID, candidateSubjectDigest: SUBJECT_DIGEST },
  candidate: { candidateId: CANDIDATE_ID, subjectDigest: SUBJECT_DIGEST, headSha: CURRENT_HEAD },
};
const errandBinding = {
  kind: "errand" as const,
  key: "review-errand",
  claimId: "claim-1",
  branch: "chore/review-errand",
  sources: ["coderabbit-pr", "codex-pr"],
  standardReview: reservation.obligation,
};

describe("hosted reservation admission", () => {
  it("admits the preferred source before any attempt", () => {
    expect(firstAdmissibleHostedSource(reservation, [])).toBe("coderabbit-pr");
  });

  it("admits the next source only after the ordered prefix is safely unavailable", () => {
    const attempts = [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }];
    expect(firstAdmissibleHostedSource(reservation, attempts)).toBe("codex-pr");
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts,
      ...binding,
    })).not.toThrow();
  });

  it("admits a current Candidate after the publication-only head advance", () => {
    expect(reservation.target.kind).toBe("pinned-head");
    if (reservation.target.kind !== "pinned-head") throw new Error("expected pinned fixture");
    expect(reservation.target.headSha).not.toBe(CURRENT_HEAD);
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      ...binding,
    })).not.toThrow();
  });

  it("admits an exact delivery member under the originating Candidate authority", () => {
    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: deliveryVehicle.head,
      targetKind: "delivery-member",
      vehicle: deliveryVehicle,
      attempts: [],
      ...binding,
    })).not.toThrow();
  });

  it("keeps safe-unavailability progress independent for each exact delivery member", () => {
    const otherVehicle = {
      ...deliveryVehicle,
      deliverableId: `sha256:${"1".repeat(64)}`,
    };
    const attempts = [{
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
      hosted: {
        target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
        vehicle: deliveryVehicle,
      },
    }];
    const currentMemberAttempts = hostedReservationAttemptsForTarget({
      attempts,
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    });
    const otherMemberAttempts = hostedReservationAttemptsForTarget({
      attempts,
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: otherVehicle,
    });

    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: deliveryVehicle.head,
      targetKind: "delivery-member",
      vehicle: deliveryVehicle,
      attempts: currentMemberAttempts,
      ...binding,
    })).not.toThrow();
    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: otherVehicle.head,
      targetKind: "delivery-member",
      vehicle: otherVehicle,
      attempts: otherMemberAttempts,
      ...binding,
    })).toThrow(/requires `coderabbit-pr` next/u);
  });

  it("excludes a delivery-member attempt from singleton source ordering", () => {
    expect(hostedReservationAttemptsForTarget({
      attempts: [{
        sourceId: "coderabbit-pr",
        outcome: "rate-limited",
        hosted: {
          target: { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD },
          vehicle: { ...deliveryVehicle, head: CURRENT_HEAD },
        },
      }],
      target: { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD },
    })).toEqual([]);
  });

  it("rejects a delivery member reconstructed under a different plan", () => {
    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: deliveryVehicle.head,
      targetKind: "delivery-member",
      vehicle: {
        ...deliveryVehicle,
        planId: "123e4567-e89b-12d3-a456-426614174001",
      },
      attempts: [],
      ...binding,
    })).toThrow(/reservation vehicle/u);
  });

  it("rejects a direct lower-source request when the preferred source has no safe attempt", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      ...binding,
    })).toThrow(/requires `coderabbit-pr` next/u);
  });

  it("admits a carried reservation after an approved Candidate subject advance", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      ...binding,
      candidate: { ...binding.candidate, subjectDigest: `sha256:${"f".repeat(64)}` },
    })).not.toThrow();
  });

  it("does not treat a mixed or terminal history as safe fallback evidence", () => {
    expect(firstAdmissibleHostedSource(reservation, [
      { sourceId: "coderabbit-pr", outcome: "rate-limited" },
      { sourceId: "coderabbit-pr", outcome: "terminal-failure" },
    ])).toBe("coderabbit-pr");
  });

  it("admits hosted progress from the exact active Errand without Candidate state", () => {
    expect(() => assertHostedErrandAdmission({
      binding: errandBinding,
      current: {
        key: "review-errand",
        claimId: "claim-1",
        branch: "chore/review-errand",
      },
      provider: "coderabbit-pr",
      attempts: [],
    })).not.toThrow();
  });

  it("preserves ordered fallback for Errand-hosted progress", () => {
    expect(() => assertHostedErrandAdmission({
      binding: errandBinding,
      current: {
        key: "review-errand",
        claimId: "claim-1",
        branch: "chore/review-errand",
      },
      provider: "codex-pr",
      attempts: [{ sourceId: "coderabbit-pr", outcome: "transient-unavailable" }],
    })).not.toThrow();
  });

  it("derives and admits an exact configured suffix for explicit Errand selection", () => {
    expect(configuredSourceSuffix(errandBinding.sources, "codex-pr")).toEqual(["codex-pr"]);
    expect(() => assertHostedErrandBindingAuthority({
      binding: { ...errandBinding, sources: ["codex-pr"] },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).not.toThrow();
  });

  it("rejects an unavailable selection or an Errand source binding that is not an exact configured suffix", () => {
    expect(() => configuredSourceSuffix(errandBinding.sources, "delegated-agent"))
      .toThrow(/configured standard-review source/u);
    expect(() => assertHostedErrandBindingAuthority({
      binding: { ...errandBinding, sources: ["codex-pr", "coderabbit-pr"] },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).toThrow(/source binding.*configured suffix/u);
  });

  it("rejects an Errand handle whose rubric identity differs from the current rubric", () => {
    expect(() => assertHostedErrandBindingAuthority({
      binding: {
        ...errandBinding,
        standardReview: {
          ...errandBinding.standardReview,
          rubricDigest: `sha256:${"f".repeat(64)}`,
        },
      },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).toThrow(/rubric binding does not match/u);
  });
});
