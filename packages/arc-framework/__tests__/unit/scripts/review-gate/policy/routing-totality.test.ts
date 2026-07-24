import { describe, expect, it } from "vitest";

import {
  RoutingWorkClassSchema,
  WorkContextSchema,
} from "../../../../../src/scripts/review-gate/policy/assurance-schema.js";
import {
  ChangeDeterminacySchema,
  ChangeSetStateSchema,
  CoreRoutingReasonSchema,
  OwnershipRelationSchema,
  ReviewContentKindSchema,
  ReviewRiskSchema,
  ReviewRoutingDecisionSchema,
  ReviewRoutingFactsSchema,
  SurfaceAuthoritySchema,
  type ReviewRoutingDecision,
  type ReviewRoutingFacts,
} from "../../../../../src/scripts/review-gate/policy/routing-schema.js";
import {
  FRONTLINE_ACTION_ORDER,
  REVIEW_OBLIGATION_ORDER,
  REVIEW_RETRIGGER_ORDER,
  reduceReviewRouting,
  resolveReviewRouting,
} from "../../../../../src/scripts/review-gate/policy/routing.js";

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

function rank<T extends string>(value: T, order: readonly T[]): number {
  return order.indexOf(value);
}

function expectNotLower(base: ReviewRoutingDecision, promoted: ReviewRoutingDecision): void {
  expect(rank(promoted.authorSelfReview, REVIEW_OBLIGATION_ORDER))
    .toBeGreaterThanOrEqual(rank(base.authorSelfReview, REVIEW_OBLIGATION_ORDER));
  expect(rank(promoted.frontlineAction, FRONTLINE_ACTION_ORDER))
    .toBeGreaterThanOrEqual(rank(base.frontlineAction, FRONTLINE_ACTION_ORDER));
  expect(rank(promoted.standardReview, REVIEW_OBLIGATION_ORDER))
    .toBeGreaterThanOrEqual(rank(base.standardReview, REVIEW_OBLIGATION_ORDER));
  expect(rank(promoted.retrigger, REVIEW_RETRIGGER_ORDER))
    .toBeGreaterThanOrEqual(rank(base.retrigger, REVIEW_RETRIGGER_ORDER));
}

describe("review routing totality", () => {
  it("returns a valid congruent decision for every closed fact combination", () => {
    const failures: string[] = [];
    let combinations = 0;

    for (const changeSetState of ChangeSetStateSchema.options) {
      for (const contentKind of ReviewContentKindSchema.options) {
        for (const reviewRisk of ReviewRiskSchema.options) {
          for (const changeDeterminacy of ChangeDeterminacySchema.options) {
            for (const ownership of OwnershipRelationSchema.options) {
              for (const surfaceAuthority of SurfaceAuthoritySchema.options) {
                for (const workContext of WorkContextSchema.options) {
                  for (const workClass of RoutingWorkClassSchema.options) {
                    for (const selfReview of [false, true]) {
                      for (const frontlineReview of [false, true]) {
                        combinations += 1;
                        const facts = ReviewRoutingFactsSchema.parse({
                          schemaVersion: 1,
                          changeSetState,
                          contentKind,
                          reviewRisk,
                          changeDeterminacy,
                          ownership,
                          surfaceAuthority,
                          assurance: { workContext, workClass },
                          activity: { selfReview, frontlineReview },
                        });
                        try {
                          const decision = reduceReviewRouting(facts);
                          if (!ReviewRoutingDecisionSchema.safeParse(decision).success) {
                            failures.push(`${JSON.stringify(facts)}: invalid decision`);
                          }
                          const congruent = decision.standardReview === "exempt"
                            ? decision.retrigger === "none"
                            : decision.retrigger !== "none";
                          if (!congruent) failures.push(`${JSON.stringify(facts)}: incongruent retrigger`);
                        } catch (error) {
                          failures.push(`${JSON.stringify(facts)}: ${String(error)}`);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(combinations).toBe(27_648);
    expect(failures).toEqual([]);
  });

  it("pins every stable framework routing reason", () => {
    expect(CoreRoutingReasonSchema.options).toEqual([
      "unknown-change-set",
      "auto-eligible-planning",
      "reviewed-routine-documentation",
      "routine-code",
      "atomic-determinate",
      "atomic-softened",
      "sensitive-change-set",
      "self-owned-artifact",
      "ownerless-artifact",
      "foreign-owned-artifact",
      "mixed-ownership",
      "unknown-ownership",
      "design-authority",
      "constitutional-surface",
      "unverifiable-derived-surface",
      "self-review-inactive",
      "frontline-inactive",
      "frontline-policy-skip",
      "frontline-policy-offer",
      "frontline-policy-attempt",
      "invocation-force",
      "invocation-skip",
      "source-invocation",
      "source-developer",
      "source-project",
      "source-unbound",
    ]);
  });
});

describe("review routing promotion properties", () => {
  it("applies activity adjustments after project promotions", () => {
    const resolution = resolveReviewRouting({
      schemaVersion: 1,
      changeSetState: "known",
      contentKind: "code-bearing",
      reviewRisk: "routine",
      changeDeterminacy: "atomic",
      ownership: "self",
      surfaceAuthority: "ordinary",
      assurance: { workContext: "work-unit", workClass: "Light" },
      activity: { selfReview: false, frontlineReview: false },
    }, () => ({
      schemaVersion: 1,
      policyId: "minimums",
      authorSelfReview: "required",
      frontlineAction: "attempt",
      reasons: ["project:minimums:active-review"],
    }));

    expect(resolution.decision).toMatchObject({
      authorSelfReview: "exempt",
      frontlineAction: "skip",
      standardReview: "recommended",
      retrigger: "incremental",
    });
  });

  it("never lowers a result when sensitivity is raised", () => {
    for (const contentKind of ReviewContentKindSchema.options) {
      for (const changeDeterminacy of ChangeDeterminacySchema.options) {
        for (const ownership of OwnershipRelationSchema.options) {
          for (const surfaceAuthority of SurfaceAuthoritySchema.options) {
            for (const selfReview of [false, true]) {
              for (const frontlineReview of [false, true]) {
                const facts = {
                  ...routineFacts,
                  contentKind,
                  changeDeterminacy,
                  ownership,
                  surfaceAuthority,
                  activity: { selfReview, frontlineReview },
                };
                expectNotLower(
                  reduceReviewRouting(facts),
                  reduceReviewRouting({ ...facts, reviewRisk: "sensitive" }),
                );
              }
            }
          }
        }
      }
    }
  });

  it("never lowers a result when ownership or authority is promoted", () => {
    for (const contentKind of ReviewContentKindSchema.options) {
      for (const changeDeterminacy of ChangeDeterminacySchema.options) {
        const selfOwned = reduceReviewRouting({ ...routineFacts, contentKind, changeDeterminacy });
        for (const ownership of ["foreign", "mixed", "unknown"] as const) {
          expectNotLower(
            selfOwned,
            reduceReviewRouting({ ...routineFacts, contentKind, changeDeterminacy, ownership }),
          );
        }

        for (const baseline of ["planning-grooming", "ordinary"] as const) {
          const ordinary = reduceReviewRouting({
            ...routineFacts,
            contentKind,
            changeDeterminacy,
            surfaceAuthority: baseline,
          });
          for (const surfaceAuthority of [
            "design-authority",
            "constitutional",
            "unverifiable-derived",
            "unknown",
          ] as const) {
            expectNotLower(ordinary, reduceReviewRouting({
              ...routineFacts,
              contentKind,
              changeDeterminacy,
              surfaceAuthority,
            }));
          }
        }
      }
    }
  });

  it("never lowers a result through project policy", () => {
    for (const contentKind of ReviewContentKindSchema.options) {
      for (const reviewRisk of ReviewRiskSchema.options) {
        for (const selfReview of [false, true]) {
          for (const frontlineReview of [false, true]) {
            const facts = {
              ...routineFacts,
              contentKind,
              reviewRisk,
              activity: { selfReview, frontlineReview },
            };
            const base = resolveReviewRouting(facts).decision;
            const promoted = resolveReviewRouting(facts, () => ({
              schemaVersion: 1,
              policyId: "maximums",
              authorSelfReview: "required",
              frontlineAction: "attempt",
              standardReview: "required",
              retrigger: "full-final",
              reasons: ["project:maximums:full-review"],
            })).decision;
            expectNotLower(base, promoted);
          }
        }
      }
    }
  });

  it("changes only the result owned by each activity fact", () => {
    for (const contentKind of ReviewContentKindSchema.options) {
      for (const reviewRisk of ReviewRiskSchema.options) {
        const base = reduceReviewRouting({ ...routineFacts, contentKind, reviewRisk });
        const noSelfReview = reduceReviewRouting({
          ...routineFacts,
          contentKind,
          reviewRisk,
          activity: { selfReview: false, frontlineReview: true },
        });
        const noFrontline = reduceReviewRouting({
          ...routineFacts,
          contentKind,
          reviewRisk,
          activity: { selfReview: true, frontlineReview: false },
        });

        expect(noSelfReview).toMatchObject({
          frontlineAction: base.frontlineAction,
          standardReview: base.standardReview,
          retrigger: base.retrigger,
          assuranceMode: base.assuranceMode,
        });
        expect(noFrontline).toMatchObject({
          authorSelfReview: base.authorSelfReview,
          standardReview: base.standardReview,
          retrigger: base.retrigger,
          assuranceMode: base.assuranceMode,
        });
      }
    }
  });

  it("changes only assurance mode when the default work class changes", () => {
    const decisions = RoutingWorkClassSchema.options.map((workClass) => reduceReviewRouting({
      ...routineFacts,
      assurance: { workContext: "work-unit", workClass },
    }));
    const withoutAssurance = decisions.map(({
      schemaVersion,
      authorSelfReview,
      frontlineAction,
      standardReview,
      retrigger,
      reasons,
    }) => ({
      schemaVersion,
      authorSelfReview,
      frontlineAction,
      standardReview,
      retrigger,
      reasons,
    }));

    expect(withoutAssurance).toEqual(withoutAssurance.map(() => withoutAssurance[0]));
    expect(decisions.map(({ assuranceMode }) => assuranceMode)).toEqual([
      "none",
      "none",
      "terminal-aggregate",
      "terminal-aggregate",
    ]);
  });
});
