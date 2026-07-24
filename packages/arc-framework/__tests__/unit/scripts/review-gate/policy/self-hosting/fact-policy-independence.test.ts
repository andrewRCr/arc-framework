import { describe, expect, it } from "vitest";

import {
  classifyChangeSet,
  type ChangePathSet,
  type ChangeSet,
} from "../../../../../../src/lib/change-facts.js";
import {
  resolveSurfaceAuthority,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/authority.js";
import {
  classifyReviewRiskFromChangeSet,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/risk.js";

describe("self-hosting fact-policy independence", () => {
  it("keeps a light CI change sensitive when its documentation carries design authority", () => {
    const changeSet: ChangeSet = {
      changeSet: "known",
      changes: [{
        status: "modified",
        path: ".arc/reference/strategies/project/strategy-review.md",
        oldMode: "100644",
        newMode: "100644",
      }],
    };

    expect(classifyChangeSet(changeSet)).toBe("light");
    expect(classifyReviewRiskFromChangeSet(changeSet)).toEqual({
      risk: "sensitive",
      reasons: ["strategy-surface"],
    });
    expect(resolveSurfaceAuthority(changeSet)).toEqual({ authority: "design-authority" });
  });

  it("does not read verified-tree history while mapping review facts", () => {
    const changeSet: ChangePathSet = {
      changeSet: "known",
      changes: [{ status: "modified", path: "README.md" }],
    };
    Object.defineProperty(changeSet, "verifiedTreeHistory", {
      get: () => { throw new Error("review policy observed CI history"); },
    });

    expect(classifyReviewRiskFromChangeSet(changeSet)).toEqual({
      risk: "routine",
      reasons: ["routine-doc-surface"],
    });
    expect(resolveSurfaceAuthority(changeSet)).toEqual({ authority: "ordinary" });
  });
});
