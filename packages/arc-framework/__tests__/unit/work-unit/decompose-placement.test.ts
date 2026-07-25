import { describe, expect, it } from "vitest";

import {
  projectDecomposePlacement,
  resolveDecomposeMemberPlacement,
} from "../../../src/lib/work-unit/decompose-placement.js";

describe("resolveDecomposeMemberPlacement", () => {
  it.each([
    ["standalone", "monolith", "monolith", undefined, ["monolith"]],
    ["standalone", "monolith", "monolith", "monolith", ["monolith"]],
    ["in-cohort", "delivery/tooling", "tooling", "delivery", ["delivery", "tooling"]],
    ["at-cap", undefined, "leaf", "delivery/tooling", ["delivery", "tooling"]],
    ["cohortless", undefined, "delivery", undefined, []],
  ] as const)(
    "projects %s through the canonical planned placement",
    (parentPosition, cohort, originSlug, originCohort, expectedCohort) => {
      const result = resolveDecomposeMemberPlacement({ parentPosition, cohort }, originSlug, originCohort);

      expect(result).toEqual({
        status: "resolved",
        placement: {
          kind: "backlog",
          commitment: "planned",
          cohort: expectedCohort,
        },
      });
    },
  );

  it("refuses every cohort-requiring arm without its authority", () => {
    expect(resolveDecomposeMemberPlacement(
      { parentPosition: "standalone" },
      "delivery",
      undefined,
    )).toMatchObject({ status: "refused", reason: expect.stringMatching(/standalone.*cohort/i) });
    expect(resolveDecomposeMemberPlacement(
      { parentPosition: "in-cohort" },
      "tooling",
      undefined,
    )).toMatchObject({ status: "refused", reason: expect.stringMatching(/in-cohort.*cohort/i) });
    expect(resolveDecomposeMemberPlacement(
      { parentPosition: "at-cap" },
      "leaf",
      undefined,
    )).toMatchObject({ status: "refused", reason: expect.stringMatching(/at-cap.*origin.*cohort/i) });
  });

  it.each([
    ["standalone", "delivery", "mint", "new cohort `delivery`"],
    ["in-cohort", "delivery/tooling", "mint", "new sub-cohort `delivery/tooling`"],
    ["at-cap", "delivery/tooling", "existing", "existing cohort `delivery/tooling`"],
    ["cohortless", null, "none", "flat planned siblings (no cohort)"],
  ] as const)(
    "precomposes the %s workflow projection",
    (kind, cohort, coordination, summary) => {
      const resolved = resolveDecomposeMemberPlacement(
        {
          parentPosition: kind,
          ...(kind === "standalone" || kind === "in-cohort" ? { cohort: cohort ?? undefined } : {}),
        },
        kind === "in-cohort" ? "tooling" : "delivery",
        kind === "in-cohort" ? "delivery" : kind === "at-cap" ? cohort : undefined,
      );
      expect(resolved.status).toBe("resolved");
      if (resolved.status !== "resolved") return;
      expect(projectDecomposePlacement(kind, resolved.placement)).toEqual({
        kind,
        cohort,
        coordination,
        summary,
      });
    },
  );

  it.each([
    [{ parentPosition: "standalone", cohort: "new-home" }, "origin", undefined],
    [{ parentPosition: "in-cohort", cohort: "parent/new-home" }, "origin", "parent"],
    [{ parentPosition: "at-cap" }, "origin", "parent"],
  ] as const)("rejects a parent-position arm inconsistent with the origin", (cut, origin, cohort) => {
    expect(resolveDecomposeMemberPlacement(cut, origin, cohort)).toMatchObject({
      status: "refused",
      reason: expect.stringMatching(/does not match|must preserve/iu),
    });
  });
});
