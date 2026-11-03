/** The corrective remedy for a review producer whose prepared routing a pre-publication call does not reproduce. */

import { describe, expect, it } from "vitest";

import { prePublicationRoutingMismatchRemedy } from
  "../../../../../src/scripts/review-gate/core/pre-publication-remedy.js";
import type { StandardReviewObligationProjection } from
  "../../../../../src/scripts/review-gate/policy/standard-review-projection-schema.js";

const prepared: StandardReviewObligationProjection = {
  obligation: "required",
  reasons: ["sensitive-change-set"],
  rubricVersion: "standard-review/v1",
  rubricDigest: `sha256:${"a".repeat(64)}`,
  retrigger: "full-final",
  count: 1,
};

function correction(producer: Partial<StandardReviewObligationProjection>,
  request: Partial<StandardReviewObligationProjection>): string {
  const remedy = prePublicationRoutingMismatchRemedy("example", {
    producerReview: { ...prepared, ...producer },
    requestReview: { ...prepared, ...request },
  });
  expect(remedy).toMatchObject({
    invariant: "Pre-publication settles a review only under the routing it was prepared with.",
    argv: ["arc", "review", "pre-publication", "example"],
  });
  return remedy.text;
}

describe("prePublicationRoutingMismatchRemedy", () => {
  it("names the change-set facts that differ from the ones the review was prepared with", () => {
    expect(correction({}, { reasons: ["routine-code"] })).toContain("Set contentKind, reviewRisk in --change-set as the "
      + "review was prepared (the review was prepared routing as sensitive-change-set; this call routes as "
      + "routine-code), then re-run");
  });

  it("asks for every fact when this call's change set is unestablished", () => {
    expect(correction({}, { reasons: ["unknown-change-set"] }))
      .toContain("Supply --change-set with every fact, reviewRisk as the review was prepared (");
  });

  it("asks to omit the change set when the review was prepared without one", () => {
    expect(correction({ reasons: ["unknown-change-set"] }, { reasons: ["routine-code"] }))
      .toContain("Omit --change-set, as the review was prepared without established change-set facts (");
  });

  it("names a fresh review for a difference no change set produces", () => {
    expect(correction({ reasons: ["sensitive-change-set", "frontline-inactive"] }, {}))
      .toContain("Prepare a fresh review under the current routing (");
    expect(correction({}, { reasons: ["routine-code"], rubricDigest: `sha256:${"b".repeat(64)}` }))
      .toContain("Prepare a fresh review under the current rubric (rubricDigest changed");
    expect(correction({}, { obligation: "recommended" }))
      .toContain("Prepare a fresh review under the current review policy (obligation changed");
  });
});
