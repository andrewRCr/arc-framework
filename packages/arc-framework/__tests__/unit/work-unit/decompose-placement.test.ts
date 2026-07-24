import { describe, expect, it } from "vitest";

import {
  projectDecomposePlacement,
  resolveDecomposeMemberPlacement,
} from "../../../src/lib/work-unit/decompose-placement.js";

describe("resolveDecomposeMemberPlacement", () => {
  it.each([
    ["standalone", "delivery", undefined, ["delivery"]],
    ["in-cohort", "delivery/tooling", undefined, ["delivery", "tooling"]],
    ["at-cap", undefined, "delivery/tooling", ["delivery", "tooling"]],
    ["cohortless", undefined, undefined, []],
  ] as const)(
    "projects %s through the canonical planned placement",
    (parentPosition, cohort, originCohort, expectedCohort) => {
      const result = resolveDecomposeMemberPlacement({ parentPosition, cohort }, originCohort);

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
      undefined,
    )).toMatchObject({ status: "refused", reason: expect.stringMatching(/standalone.*cohort/i) });
    expect(resolveDecomposeMemberPlacement(
      { parentPosition: "in-cohort" },
      undefined,
    )).toMatchObject({ status: "refused", reason: expect.stringMatching(/in-cohort.*cohort/i) });
    expect(resolveDecomposeMemberPlacement(
      { parentPosition: "at-cap" },
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
        kind === "at-cap" ? cohort : undefined,
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
});
