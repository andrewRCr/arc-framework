import { describe, expect, it } from "vitest";

import {
  applyPlanningLaneOwnershipException,
  assessPlanningLaneOwnershipEligibility,
} from "../../../src/lib/work-unit/planning-lane-ownership.js";

describe("assessPlanningLaneOwnershipEligibility", () => {
  it("accepts guards enforced by different active mechanisms and preserves their provenance", () => {
    const result = assessPlanningLaneOwnershipEligibility({
      branchProtection: {
        state: "checked",
        requiredContext: true,
        baseCurrency: false,
      },
      rules: {
        state: "checked",
        requiredContext: false,
        baseCurrency: true,
      },
      mergeQueue: {
        state: "checked",
        requiredContext: false,
        baseCurrency: false,
      },
    });

    expect(result).toEqual({
      eligible: true,
      requiredContext: {
        satisfied: true,
        mechanisms: ["branch-protection"],
      },
      baseCurrency: {
        satisfied: true,
        mechanisms: ["rules"],
      },
      surfaces: {
        branchProtection: "configured",
        rules: "configured",
        mergeQueue: "checked-not-configured",
      },
      reasons: [],
    });
  });

  it("refuses eligibility when any enumerated surface cannot be checked", () => {
    const result = assessPlanningLaneOwnershipEligibility({
      branchProtection: { state: "checked", requiredContext: true, baseCurrency: true },
      rules: { state: "forbidden" },
      mergeQueue: { state: "checked", requiredContext: false, baseCurrency: false },
    });

    expect(result.eligible).toBe(false);
    expect(result.surfaces.rules).toBe("not-permitted-to-check");
    expect(result.reasons).toEqual(["rules:not-permitted-to-check"]);
  });

  it("reports checked but absent guards separately from refused reads", () => {
    const result = assessPlanningLaneOwnershipEligibility({
      branchProtection: { state: "checked", requiredContext: false, baseCurrency: false },
      rules: { state: "checked", requiredContext: false, baseCurrency: false },
      mergeQueue: { state: "checked", requiredContext: false, baseCurrency: false },
    });

    expect(result).toMatchObject({
      eligible: false,
      surfaces: {
        branchProtection: "checked-not-configured",
        rules: "checked-not-configured",
        mergeQueue: "checked-not-configured",
      },
      reasons: ["required-context:not-configured", "base-currency:not-configured"],
    });
  });
});

describe("applyPlanningLaneOwnershipException", () => {
  it("appends the receipt namespace to an existing trailing unowned block", () => {
    const source = [
      "* @reviewers",
      "/.arc/active/spec-*.md",
      "",
    ].join("\n");

    expect(applyPlanningLaneOwnershipException(source)).toEqual({
      state: "applied",
      content: [
        "* @reviewers",
        "/.arc/active/spec-*.md",
        "/.arc/system/.internal/retirement-receipts/*.json",
        "",
      ].join("\n"),
    });
  });

  it("leaves an existing exception in the trailing unowned block unchanged", () => {
    const source = [
      "* @reviewers",
      "/.arc/active/spec-*.md",
      "/.arc/system/.internal/retirement-receipts/*.json",
      "",
    ].join("\n");

    expect(applyPlanningLaneOwnershipException(source)).toEqual({
      state: "unchanged",
      content: source,
      reason: "receipt-namespace-already-unowned",
    });
  });

  it("refuses an exception followed by a later owning entry", () => {
    const source = [
      "* @reviewers",
      "/.arc/system/.internal/retirement-receipts/*.json",
      "/.arc/system/.internal/ @security",
      "/.arc/active/spec-*.md",
      "",
    ].join("\n");

    expect(applyPlanningLaneOwnershipException(source)).toEqual({
      state: "refused",
      content: source,
      reason: "owning-entry-follows-receipt-namespace",
    });
  });

  it("refuses an ownership file without a trailing unowned block", () => {
    const source = "* @reviewers\n/.arc/system/.internal/ @security\n";

    expect(applyPlanningLaneOwnershipException(source)).toEqual({
      state: "refused",
      content: source,
      reason: "ownership-file-has-no-trailing-unowned-block",
    });
  });
});
