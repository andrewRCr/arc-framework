import { describe, expect, it } from "vitest";

import {
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
});
