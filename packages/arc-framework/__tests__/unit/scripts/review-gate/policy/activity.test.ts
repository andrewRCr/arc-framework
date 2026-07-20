import { describe, expect, it } from "vitest";

import {
  resolveReviewMethodActivity,
  type ReviewMethodActivityPort,
} from "../../../../../src/scripts/review-gate/policy/activity.js";
import { reduceReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import type { ReviewRoutingFacts } from "../../../../../src/scripts/review-gate/policy/routing-schema.js";

const facts: ReviewRoutingFacts = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
};

const port = (value: unknown): ReviewMethodActivityPort => ({
  readReviewMethodActivity: () => value,
});

describe("review method activity port", () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])("supplies closed activity facts for %s / %s", (selfReview, frontlineReview) => {
    expect(resolveReviewMethodActivity(port({ selfReview, frontlineReview }))).toEqual({
      activity: { selfReview, frontlineReview },
      diagnostics: [],
    });
  });

  it("preserves a valid peer while defaulting malformed activity conservatively", () => {
    expect(resolveReviewMethodActivity(port({ selfReview: false, frontlineReview: "enabled" }))).toEqual({
      activity: { selfReview: false, frontlineReview: true },
      diagnostics: ["activity.frontlineReview"],
    });
    expect(resolveReviewMethodActivity(port({ selfReview: false, extra: true }))).toEqual({
      activity: { selfReview: false, frontlineReview: true },
      diagnostics: ["activity.extra", "activity.frontlineReview"],
    });
  });

  it("keeps each activity adjustment isolated from independent analysis", () => {
    const baseline = reduceReviewRouting(facts);
    const selfInactive = reduceReviewRouting({
      ...facts,
      activity: resolveReviewMethodActivity(port({ selfReview: false, frontlineReview: true })).activity,
    });
    const frontlineInactive = reduceReviewRouting({
      ...facts,
      activity: resolveReviewMethodActivity(port({ selfReview: true, frontlineReview: false })).activity,
    });

    expect(selfInactive).toMatchObject({
      authorSelfReview: "exempt",
      frontlineAction: baseline.frontlineAction,
      independentAnalysis: baseline.independentAnalysis,
    });
    expect(frontlineInactive).toMatchObject({
      authorSelfReview: baseline.authorSelfReview,
      frontlineAction: "skip",
      independentAnalysis: baseline.independentAnalysis,
    });
  });
});
