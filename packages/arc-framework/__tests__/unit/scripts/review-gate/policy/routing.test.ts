import { describe, expect, it } from "vitest";

import {
  reduceReviewRouting,
  resolveReviewRouting,
} from "../../../../../src/scripts/review-gate/policy/routing.js";
import type {
  ReviewRoutingFacts,
} from "../../../../../src/scripts/review-gate/policy/routing-schema.js";

const routineFacts: ReviewRoutingFacts = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "documentation",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "planning-grooming",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
};

describe("review routing bases", () => {
  it("fails closed while preserving independently valid assurance and activity", () => {
    const result = resolveReviewRouting({
      ...routineFacts,
      contentKind: "source",
      assurance: { workContext: "work-unit", workClass: "Novel" },
      activity: { selfReview: false, frontlineReview: false },
      arbitraryFact: true,
    });

    expect(result.facts).toMatchObject({
      changeSetState: "unknown",
      contentKind: "code-bearing",
      assurance: { workContext: "work-unit", workClass: "Novel" },
      activity: { selfReview: false, frontlineReview: false },
    });
    expect(result.diagnostics).toEqual(["arbitraryFact", "contentKind"]);
    expect(result.decision).toEqual({
      schemaVersion: 1,
      authorSelfReview: "required",
      frontlineAction: "attempt",
      independentAnalysis: "required",
      retrigger: "full-final",
      assuranceMode: "none",
      reasons: ["unknown-change-set"],
    });
  });

  it("uses conservative defaults for invalid closed fields", () => {
    const result = resolveReviewRouting({
      schemaVersion: 2,
      changeSetState: "known",
      contentKind: null,
      reviewRisk: "low",
      changeDeterminacy: "small",
      ownership: "team",
      surfaceAuthority: "generated",
      assurance: { workContext: "pull-request", workClass: "Medium" },
      activity: { selfReview: "yes", frontlineReview: 0 },
    });

    expect(result.facts).toEqual({
      schemaVersion: 1,
      changeSetState: "unknown",
      contentKind: "code-bearing",
      reviewRisk: "sensitive",
      changeDeterminacy: "ordinary",
      ownership: "unknown",
      surfaceAuthority: "unknown",
      assurance: { workContext: "unscoped", workClass: "Heavy" },
      activity: { selfReview: true, frontlineReview: true },
    });
    expect(result.diagnostics).toEqual([
      "activity.frontlineReview",
      "activity.selfReview",
      "assurance.workClass",
      "assurance.workContext",
      "changeDeterminacy",
      "contentKind",
      "ownership",
      "reviewRisk",
      "schemaVersion",
      "surfaceAuthority",
    ]);
  });

  it("keeps the sensitive floor above determinacy", () => {
    expect(reduceReviewRouting({
      ...routineFacts,
      contentKind: "code-bearing",
      reviewRisk: "sensitive",
      changeDeterminacy: "atomic",
    })).toMatchObject({
      authorSelfReview: "required",
      frontlineAction: "attempt",
      independentAnalysis: "required",
      retrigger: "full-final",
      reasons: ["sensitive-change-set"],
    });
  });

  it("resolves both routine documentation bases", () => {
    expect(reduceReviewRouting(routineFacts)).toMatchObject({
      authorSelfReview: "recommended",
      frontlineAction: "skip",
      independentAnalysis: "exempt",
      retrigger: "none",
      reasons: ["auto-eligible-planning", "self-owned-artifact"],
    });
    expect(reduceReviewRouting({ ...routineFacts, ownership: "ownerless" }).reasons)
      .toEqual(["auto-eligible-planning", "ownerless-artifact"]);
    expect(reduceReviewRouting({ ...routineFacts, surfaceAuthority: "ordinary" })).toMatchObject({
      authorSelfReview: "recommended",
      frontlineAction: "skip",
      independentAnalysis: "recommended",
      retrigger: "incremental",
      reasons: ["reviewed-routine-documentation"],
    });
  });

  it("resolves atomic and ordinary routine code bases", () => {
    expect(reduceReviewRouting({
      ...routineFacts,
      contentKind: "code-bearing",
      changeDeterminacy: "atomic",
    })).toMatchObject({
      authorSelfReview: "required",
      frontlineAction: "offer",
      independentAnalysis: "recommended",
      retrigger: "incremental",
      reasons: ["routine-code", "atomic-determinate", "atomic-softened"],
    });
    expect(reduceReviewRouting({ ...routineFacts, contentKind: "code-bearing" })).toMatchObject({
      authorSelfReview: "required",
      frontlineAction: "attempt",
      independentAnalysis: "required",
      retrigger: "incremental",
      reasons: ["routine-code"],
    });
  });
});
