import { describe, expect, it } from "vitest";

import { validateDeliveryTaskCoverage } from "../../../src/lib/delivery/coverage.js";

function coverageInput(overrides: Partial<Parameters<typeof validateDeliveryTaskCoverage>[0]> = {}) {
  return {
    entry: "from-tasks" as const,
    predecessorEntry: null,
    implementationTaskIds: ["1.1", "1.2"],
    verificationTaskId: "2.1",
    memberTaskIds: [["1.1"]],
    ...overrides,
  };
}

describe("validateDeliveryTaskCoverage", () => {
  it("refuses an uncovered implementation task under from-tasks", () => {
    const result = validateDeliveryTaskCoverage(coverageInput());

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "uncovered-implementation-task", taskId: "1.2" }],
    });
  });

  it("advises on an uncovered implementation task under from-branch", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({ entry: "from-branch" }));

    expect(result).toEqual({
      status: "valid",
      advisories: [{ kind: "uncovered-implementation-task", taskId: "1.2" }],
    });
  });

  it.each(["from-tasks", "from-branch"] as const)(
    "refuses verification assignment under %s",
    (entry) => {
      const result = validateDeliveryTaskCoverage(coverageInput({
        entry,
        memberTaskIds: [["1.1", "1.2", "2.1"]],
      }));

      expect(result).toEqual({
        status: "refused",
        issues: [{ kind: "verification-task-assigned", memberIndex: 0 }],
      });
    },
  );

  it("refuses a revision that changes its authoring entry", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      entry: "from-branch",
      predecessorEntry: "from-tasks",
      memberTaskIds: [["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "entry-changed" }],
    });
  });
});
