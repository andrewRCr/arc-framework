/** Existing write-context decisions retain their caller-derived landing place and remedy. */
import { describe, expect, it } from "vitest";
import { classifyPlanningEntry, classifyWriteContext } from "../../../../src/lib/git/write-context.js";
import { checkoutRefusalFromPreflight } from "../../../../src/lib/store/write-context.js";

const base = { currentBranch: "main", baseBranch: "main", primaryWorktreePath: "/repository" };
const landing = { checkout: "/repository/planning-checkout", condition: "The current checkout cannot commit this planning write.",
  remedy: { text: "Continue in the already-selected planning checkout.", argv: ["cd", "/repository/planning-checkout"] } };

describe("write-context refusal mapping", () => {
  it("preserves base-context and admitted planning proceeds without a refusal", () => {
    const writeContext = classifyWriteContext(base);
    expect(checkoutRefusalFromPreflight(writeContext, landing)).toBeUndefined();
    expect(checkoutRefusalFromPreflight(classifyPlanningEntry({ writeContext, protection: "partial", onPlanningBranch: false,
      draftPresent: false, activeWorkUnit: false }), landing)).toBeUndefined();
  });
  it.each([
    { ...base, currentBranch: "feat/other" }, { ...base, currentBranch: null }, { ...base, baseBranch: null },
  ])("preserves the producer's $currentBranch/$baseBranch refusal as the exact landing route", (input) => {
    expect(checkoutRefusalFromPreflight(classifyWriteContext(input), landing)).toEqual({ code: "checkout-not-writable", class: "recoverable", ...landing });
  });
  it.each([
    { ...base, currentBranch: "main" }, { ...base, currentBranch: "feat/other" },
    { ...base, currentBranch: null }, { ...base, baseBranch: null },
  ])("preserves every planning redirect reason without deciding a new branch", (input) => {
    const route = classifyPlanningEntry({ writeContext: classifyWriteContext(input), protection: "full", onPlanningBranch: false,
      draftPresent: true, activeWorkUnit: true });
    expect(route.route).toBe("redirect");
    expect(checkoutRefusalFromPreflight(route, landing)).toEqual({ code: "checkout-not-writable", class: "recoverable", ...landing });
  });
});
