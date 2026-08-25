import { describe, expect, it } from "vitest";

import { validateDeliveryTaskCoverage } from "../../../src/lib/delivery/coverage.js";

function taskRoles(taskIds: readonly string[]) {
  return [
    ...taskIds.map((taskId) => ({ taskId, role: { kind: "implementation" as const } })),
    { taskId: "2.1", role: { kind: "verification" as const, scope: "work-unit" } },
  ];
}

function coverageInput(overrides: Partial<Parameters<typeof validateDeliveryTaskCoverage>[0]> = {}) {
  return {
    entry: "from-tasks" as const,
    predecessorEntry: null,
    tasks: taskRoles(["1.1", "1.2"]),
    memberTaskIds: [["1.1"]],
    ...overrides,
  };
}

describe("validateDeliveryTaskCoverage", () => {
  it("accepts contiguous member ranges that follow task-list order", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3", "1.4"]),
      memberTaskIds: [["1.1", "1.2"], ["1.3", "1.4"]],
    }));

    expect(result).toEqual({ status: "valid", advisories: [] });
  });

  it("refuses interleaved member ranges with their indices", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3", "1.4"]),
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
      tasks: taskRoles(["1.1", "1.2", "1.3"]),
      memberTaskIds: [["1.1", "1.3"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0] }],
    });
  });

  it("refuses contiguous ranges ordered against member order", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3", "1.4"]),
      memberTaskIds: [["1.3", "1.4"], ["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0, 1] }],
    });
  });

  it("allows one task shared by adjacent members", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3"]),
      memberTaskIds: [["1.1", "1.2"], ["1.2", "1.3"]],
    }));

    expect(result).toEqual({ status: "valid", advisories: [] });
  });

  it("refuses one task shared by non-adjacent members", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1"]),
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
        { kind: "work-unit-verification-task-assigned", memberIndex: 1 },
        { kind: "member-task-order", memberIndices: [0, 1] },
      ],
    });
  });

  it("refuses an uncovered assignable task under from-tasks", () => {
    const result = validateDeliveryTaskCoverage(coverageInput());

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "uncovered-assignable-task", taskId: "1.2" }],
    });
  });

  it("advises on an uncovered assignable task under from-branch", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({ entry: "from-branch" }));

    expect(result).toEqual({
      status: "valid",
      advisories: [{ kind: "uncovered-assignable-task", taskId: "1.2" }],
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
        issues: [{ kind: "work-unit-verification-task-assigned", memberIndex: 0 }],
      });
    },
  );

  it("admits member-scope verification into the member partition", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: [
        ...taskRoles(["1.1", "1.2"]).slice(0, -1),
        { taskId: "1.3", role: { kind: "verification", scope: "member" } },
        { taskId: "2.1", role: { kind: "verification", scope: "work-unit" } },
      ],
      memberTaskIds: [["1.1", "1.2", "1.3"]],
    }));

    expect(result).toEqual({ status: "valid", advisories: [] });
  });

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
