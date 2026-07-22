import { describe, expect, it } from "vitest";

import {
  FRONTLINE_ACTION_ORDER,
  REVIEW_OBLIGATION_ORDER,
  REVIEW_RETRIGGER_ORDER,
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
      authorSelfReview: "exempt",
      frontlineAction: "skip",
      independentAnalysis: "required",
      retrigger: "full-final",
      assuranceMode: "terminal-aggregate",
      reasons: ["unknown-change-set", "self-review-inactive", "frontline-inactive"],
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
    expect(result.decision.assuranceMode).toBe("terminal-aggregate");
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

  it("refuses inherited routing facts and falls back to the conservative floor", () => {
    const result = resolveReviewRouting(Object.create({
      schemaVersion: 1,
      changeSetState: "known",
      contentKind: "documentation",
      reviewRisk: "routine",
      changeDeterminacy: "ordinary",
      ownership: "self",
      surfaceAuthority: "ordinary",
      assurance: { workContext: "work-unit", workClass: "Light" },
      activity: { selfReview: true, frontlineReview: true },
    }));

    expect(result.facts).toEqual({
      changeSetState: "unknown",
      contentKind: "code-bearing",
      reviewRisk: "sensitive",
      changeDeterminacy: "ordinary",
      ownership: "unknown",
      surfaceAuthority: "unknown",
      assurance: { workContext: "unscoped", workClass: "Heavy" },
      activity: { selfReview: true, frontlineReview: true },
      schemaVersion: 1,
    });
    expect(result.diagnostics).toEqual([
      "$",
      "activity",
      "activity.frontlineReview",
      "activity.selfReview",
      "assurance",
      "assurance.workClass",
      "assurance.workContext",
      "changeDeterminacy",
      "changeSetState",
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

  it.each([
    ["foreign", "foreign-owned-artifact"],
    ["mixed", "mixed-ownership"],
    ["unknown", "unknown-ownership"],
  ] as const)("promotes %s ownership without lowering another result", (ownership, reason) => {
    const decision = reduceReviewRouting({ ...routineFacts, ownership });

    expect(decision).toMatchObject({
      authorSelfReview: "recommended",
      frontlineAction: "skip",
      independentAnalysis: "required",
      retrigger: "incremental",
    });
    expect(decision.reasons).toEqual(["reviewed-routine-documentation", reason]);
  });

  it.each([
    ["design-authority", "design-authority"],
    ["constitutional", "constitutional-surface"],
    ["unverifiable-derived", "unverifiable-derived-surface"],
    ["unknown", "unverifiable-derived-surface"],
  ] as const)("promotes %s authority to the full-final floor", (surfaceAuthority, reason) => {
    const decision = reduceReviewRouting({
      ...routineFacts,
      contentKind: "code-bearing",
      changeDeterminacy: "atomic",
      surfaceAuthority,
    });

    expect(decision).toMatchObject({
      authorSelfReview: "required",
      frontlineAction: "offer",
      independentAnalysis: "required",
      retrigger: "full-final",
    });
    expect(decision.reasons).toEqual([
      "routine-code",
      "atomic-determinate",
      "atomic-softened",
      reason,
    ]);
  });

  it("publishes closed ascending lattices for every promotable result", () => {
    expect(REVIEW_OBLIGATION_ORDER).toEqual(["exempt", "recommended", "required"]);
    expect(FRONTLINE_ACTION_ORDER).toEqual(["skip", "offer", "attempt"]);
    expect(REVIEW_RETRIGGER_ORDER).toEqual(["none", "incremental", "full-final"]);
  });

  it.each([
    ["none", "none"],
    ["Light", "none"],
    ["Heavy", "terminal-aggregate"],
    ["Novel", "terminal-aggregate"],
  ] as const)("maps work class %s to assurance mode %s", (workClass, assuranceMode) => {
    expect(reduceReviewRouting({
      ...routineFacts,
      assurance: { workContext: "work-unit", workClass },
    }).assuranceMode).toBe(assuranceMode);
  });

  it("adjusts each inactive method without weakening independent analysis", () => {
    const active = reduceReviewRouting({ ...routineFacts, contentKind: "code-bearing" });
    const noSelfReview = reduceReviewRouting({
      ...routineFacts,
      contentKind: "code-bearing",
      activity: { selfReview: false, frontlineReview: true },
    });
    const noFrontline = reduceReviewRouting({
      ...routineFacts,
      contentKind: "code-bearing",
      activity: { selfReview: true, frontlineReview: false },
    });

    expect(noSelfReview).toMatchObject({
      authorSelfReview: "exempt",
      frontlineAction: active.frontlineAction,
      independentAnalysis: active.independentAnalysis,
      retrigger: active.retrigger,
    });
    expect(noSelfReview.reasons.at(-1)).toBe("self-review-inactive");
    expect(noFrontline).toMatchObject({
      authorSelfReview: active.authorSelfReview,
      frontlineAction: "skip",
      independentAnalysis: active.independentAnalysis,
      retrigger: active.retrigger,
    });
    expect(noFrontline.reasons.at(-1)).toBe("frontline-inactive");
  });

  it("keeps formative planning exempt inside a heavier work unit", () => {
    expect(reduceReviewRouting({
      ...routineFacts,
      assurance: { workContext: "work-unit", workClass: "Novel" },
    })).toMatchObject({
      independentAnalysis: "exempt",
      retrigger: "none",
      assuranceMode: "terminal-aggregate",
    });
  });

  it("applies project policy through the same normalized fact record", () => {
    const result = resolveReviewRouting(routineFacts, (facts) => ({
      schemaVersion: 1,
      policyId: "assurance-floor",
      independentAnalysis: facts.assurance.workClass === "Light" ? "required" : "recommended",
      reasons: ["project:assurance-floor:light-review"],
    }));

    expect(result.decision).toMatchObject({
      independentAnalysis: "required",
      retrigger: "incremental",
    });
    expect(result.decision.reasons.at(-1)).toBe("project:assurance-floor:light-review");
    expect(result.diagnostics).toEqual([]);
  });

  it("closes project promotions over the validity invariant without weakening", () => {
    const fullFinal = resolveReviewRouting(routineFacts, () => ({
      schemaVersion: 1,
      policyId: "release",
      retrigger: "full-final",
      reasons: ["project:release:full-final"],
    })).decision;
    expect(fullFinal).toMatchObject({ independentAnalysis: "recommended", retrigger: "full-final" });

    const requiredBase = resolveReviewRouting({ ...routineFacts, contentKind: "code-bearing" }, () => ({
      schemaVersion: 1,
      policyId: "routine",
      authorSelfReview: "recommended",
      frontlineAction: "offer",
      independentAnalysis: "recommended",
      retrigger: "incremental",
      reasons: ["project:routine:minimums"],
    })).decision;
    expect(requiredBase).toMatchObject({
      authorSelfReview: "required",
      frontlineAction: "attempt",
      independentAnalysis: "required",
      retrigger: "incremental",
    });
  });

  it("rejects malformed, fact-extending, or failed project policy output", () => {
    const malformed = resolveReviewRouting(routineFacts, () => ({
      schemaVersion: 1,
      policyId: "unsafe",
      independentAnalysis: "required",
      reasons: ["project:unsafe:extension"],
      facts: { providerAvailable: true },
    }));
    expect(malformed.decision).toEqual(reduceReviewRouting(routineFacts));
    expect(malformed.diagnostics).toEqual(["projectPromotion"]);

    const failed = resolveReviewRouting(routineFacts, () => {
      throw new Error("policy unavailable");
    });
    expect(failed.decision).toEqual(reduceReviewRouting(routineFacts));
    expect(failed.diagnostics).toEqual(["projectPromotion"]);
  });
});
