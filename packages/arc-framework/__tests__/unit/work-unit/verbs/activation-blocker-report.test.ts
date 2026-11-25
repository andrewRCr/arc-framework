/** Blocker advice is limited to exact quoted names that activation actually discharged. */
import { describe, expect, it } from "vitest";
import { activationBlockerReport } from "../../../../src/lib/work-unit/verbs/activation-blocker-report.js";

describe("activation blocker report", () => {
  it.each([
    { name: "an absent Blockers value", blockers: null, discharged: ["done"] },
    { name: "an empty Blockers sentinel", blockers: "[none]", discharged: ["done"] },
    { name: "a name that was not discharged", blockers: "`done` must land.", discharged: [] },
    { name: "an unquoted mention", blockers: "done must land.", discharged: ["done"] },
    { name: "a longer quoted name", blockers: "`done-later` must land.", discharged: ["done"] },
    { name: "a different quoted name", blockers: "`live` must land.", discharged: ["done"] },
  ])("leaves $name alone", ({ blockers, discharged }) => {
    expect(activationBlockerReport(blockers, discharged)).toEqual([]);
  });

  it("groups several discharged mentions in one advisory while preserving their text", () => {
    const blockers = "`done` and `settled` must land; `live` has another role.";
    const report = activationBlockerReport(blockers, ["done", "settled"]);
    expect(report).toHaveLength(1);
    expect(report[0]).toContain("discharged dependencies: `done`, `settled`.");
    expect(report[0]).toContain("Clear or restate");
    expect(report[0]).toContain(`left unchanged: ${blockers}`);
  });
});
