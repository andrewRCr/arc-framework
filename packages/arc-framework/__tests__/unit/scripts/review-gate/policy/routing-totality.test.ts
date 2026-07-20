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
} from "../../../../../src/scripts/review-gate/policy/routing-schema.js";
import {
  reduceReviewRouting,
} from "../../../../../src/scripts/review-gate/policy/routing.js";

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
                          const congruent = decision.independentAnalysis === "exempt"
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
