import { describe, expect, it } from "vitest";

import {
  createReviewTarget,
} from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  ReviewPlanningGroomingResolveRequestSchema,
} from "../../../../src/scripts/review-gate/core/planning-grooming-command-schema.js";
import {
  composePlanningGroomingMethodActivity,
  resolvePlanningGroomingReviewCommand,
} from "../../../../src/scripts/review-gate/policy/planning-grooming-command.js";

const target = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: "a".repeat(40),
  diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40),
  headTree: "d".repeat(40),
});
const request = {
  schemaVersion: 1 as const,
  target: {
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    headSha: "c".repeat(40),
  },
  routingFacts: {
    contentKind: "documentation" as const,
    reviewRisk: "routine" as const,
    changeDeterminacy: "atomic" as const,
    ownership: "self" as const,
    surfaceAuthority: "planning-grooming" as const,
  },
};
const planningChangeSet = {
  changeSet: "known" as const,
  changes: [{
    status: "modified" as const,
    path: ".arc/backlog/planned/example/draft-example.md",
    oldMode: "100644" as const,
    newMode: "100644" as const,
  }],
};
const transientContext = {
  state: "resolved" as const,
  assurance: { workContext: "errand" as const, workClass: "none" as const },
  activity: { selfReview: true, frontlineReview: true },
  diagnostics: [] as string[],
};

describe("resolvePlanningGroomingReviewCommand", () => {
  it.each(["self", "ownerless"] as const)(
    "closes both review lanes for a proven %s-owned planning-grooming change",
    (ownership) => {
      const result = resolvePlanningGroomingReviewCommand({
        request: { ...request, routingFacts: { ...request.routingFacts, ownership } },
        target,
        changeSet: planningChangeSet,
        context: transientContext,
      });

      expect(result).toMatchObject({
        mode: "review-planning-grooming-resolve",
        state: "exempt",
        nextAction: "none",
        payload: {
          target,
          routing: {
            facts: {
              changeSetState: "known",
              contentKind: "documentation",
              reviewRisk: "routine",
              changeDeterminacy: "atomic",
              ownership,
              surfaceAuthority: "planning-grooming",
              assurance: { workContext: "errand", workClass: "none" },
            },
            decision: {
              frontlineAction: "skip",
              standardReview: "exempt",
              retrigger: "none",
            },
          },
          frontline: { state: "skipped", nextAction: "none" },
          standard: {
            state: "exempt",
            nextAction: "none",
            obligation: { obligation: "exempt", retrigger: "none", count: 1 },
          },
        },
      });
    },
  );

  it.each([
    [{ contentKind: "code-bearing" as const }, "recommended"],
    [{ ownership: "foreign" as const }, "required"],
    [{ ownership: "mixed" as const }, "required"],
    [{ ownership: "unknown" as const }, "required"],
    [{ reviewRisk: "sensitive" as const }, "required"],
    [{ surfaceAuthority: "design-authority" as const }, "required"],
  ])("continues ordinary review when routing judgments do not permit exemption", (override, obligation) => {
    const result = resolvePlanningGroomingReviewCommand({
      request: { ...request, routingFacts: { ...request.routingFacts, ...override } },
      target,
      changeSet: planningChangeSet,
      context: transientContext,
    });

    expect(result).toMatchObject({
      state: "review-required",
      nextAction: "continue-review",
      payload: {
        standard: { state: "continue-review", obligation: { obligation } },
      },
    });
  });

  it.each([
    [
      { changeSet: "unknown" as const, changes: [] as [] },
      transientContext,
      "unknown-change-set",
    ],
    [
      {
        changeSet: "known" as const,
        changes: [{
          status: "modified" as const,
          path: "src/index.ts",
          oldMode: "100644" as const,
          newMode: "100644" as const,
        }],
      },
      transientContext,
      "non-planning-change",
    ],
    [
      planningChangeSet,
      { state: "not-applicable" as const, reason: "transient-vehicle-required" as const },
      "transient-vehicle-required",
    ],
  ])("fails closed with typed ineligibility for %s", (changeSet, context, reason) => {
    const result = resolvePlanningGroomingReviewCommand({
      request,
      target,
      changeSet,
      context,
    });

    expect(result).toMatchObject({
      state: "not-eligible",
      nextAction: "continue-review",
      payload: { target, reason },
    });
  });

  it("keeps runtime-owned routing facts out of the public request", () => {
    expect(ReviewPlanningGroomingResolveRequestSchema.safeParse({
      ...request,
      routingFacts: {
        ...request.routingFacts,
        changeSetState: "known",
      },
    }).success).toBe(false);
    expect(ReviewPlanningGroomingResolveRequestSchema.safeParse(request).success).toBe(true);
  });

  it.each([
    ["baseRef", "release"],
    ["diffBaseSha", "e".repeat(40)],
    ["headSha", "f".repeat(40)],
  ] as const)("rejects a derived target with a mismatched %s", (field, replacement) => {
    expect(() => resolvePlanningGroomingReviewCommand({
      request: { ...request, target: { ...request.target, [field]: replacement } },
      target,
      changeSet: planningChangeSet,
      context: transientContext,
    })).toThrow(new RegExp(`derived target ${field} does not match`, "u"));
  });

  it("preserves method-activation fallback diagnostics with normalized activity", () => {
    const result = composePlanningGroomingMethodActivity({
      readMethodFile: () => undefined,
    });

    expect(result.activity).toEqual({ selfReview: true, frontlineReview: false });
    expect(result.diagnostics).toEqual([
      "method.frontline-review.missing",
      "method.self-review.missing",
    ]);
  });
});
