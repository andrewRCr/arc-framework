import { describe, expect, it } from "vitest";

import { projectSuccessorReadiness } from "../../../src/lib/work-unit/retirement-lifecycle-result.js";

describe("retirement lifecycle successor readiness", () => {
  it("selects a spawn-anchored remedy only for one authoritative candidate", () => {
    expect(projectSuccessorReadiness([], true)).toEqual({
      candidates: [],
      actionable: true,
      remedy: null,
    });
    expect(projectSuccessorReadiness(["ready"], true)).toEqual({
      candidates: ["ready"],
      actionable: true,
      remedy: {
        argv: ["arc", "start", "ready"],
        text: "arc start ready",
      },
    });
    expect(projectSuccessorReadiness(["alpha", "beta"], true)).toEqual({
      candidates: ["alpha", "beta"],
      actionable: true,
      remedy: null,
    });
    expect(projectSuccessorReadiness(["ready"], false)).toEqual({
      candidates: ["ready"],
      actionable: false,
      remedy: null,
    });
  });
});
