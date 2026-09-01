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
  it("accepts contiguous member ranges that follow task-list order", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      implementationTaskIds: ["1.1", "1.2", "1.3", "1.4"],
      memberTaskIds: [["1.1", "1.2"], ["1.3", "1.4"]],
    }));

    expect(result).toEqual({ status: "valid", advisories: [] });
  });

  it("refuses interleaved member ranges with their indices", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      implementationTaskIds: ["1.1", "1.2", "1.3", "1.4"],
      memberTaskIds: [["1.1", "1.3"], ["1.2", "1.4"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0, 1] }],
    });
  });

  it("refuses a noncontiguous member range", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      entry: "from-branch",
      implementationTaskIds: ["1.1", "1.2", "1.3"],
      memberTaskIds: [["1.1", "1.3"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0] }],
    });
  });

  it("refuses contiguous ranges ordered against member order", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      implementationTaskIds: ["1.1", "1.2", "1.3", "1.4"],
      memberTaskIds: [["1.3", "1.4"], ["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0, 1] }],
    });
  });

  it("allows one task shared by adjacent members", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      implementationTaskIds: ["1.1", "1.2", "1.3"],
      memberTaskIds: [["1.1", "1.2"], ["1.2", "1.3"]],
    }));

    expect(result).toEqual({ status: "valid", advisories: [] });
  });

  it("refuses one task shared by non-adjacent members", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      implementationTaskIds: ["1.1"],
      memberTaskIds: [["1.1"], [], ["1.1"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0, 1, 2] }],
    });
  });

  it("refuses an empty member range because it has no closing task", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      memberTaskIds: [[], ["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0] }],
    });
  });

  it.each(["from-tasks", "from-branch"] as const)(
    "blocks member task order under %s",
    (entry) => {
      const result = validateDeliveryTaskCoverage(coverageInput({
        entry,
        memberTaskIds: [["1.2"], ["1.1"]],
      }));

      expect(result).toEqual({
        status: "refused",
        issues: [{ kind: "member-task-order", memberIndices: [0, 1] }],
      });
    },
  );

  it("preserves assignment issues alongside member task order", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      memberTaskIds: [["1.2", "9.9"], ["1.1", "2.1"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [
        { kind: "unknown-task-reference", taskId: "9.9", memberIndex: 0 },
        { kind: "verification-task-assigned", memberIndex: 1 },
        { kind: "member-task-order", memberIndices: [0, 1] },
      ],
    });
  });

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

  it("refuses a member reference absent from the task inventory", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      memberTaskIds: [["1.1", "1.2", "9.9"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "unknown-task-reference", taskId: "9.9", memberIndex: 0 }],
    });
  });
});
