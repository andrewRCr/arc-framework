import { describe, expect, it } from "vitest";

import {
  validateDeliveryTaskCoverage,
  type DeliveryTaskCoverageInput,
} from "../../../src/lib/delivery/coverage.js";

function taskRoles(
  taskIds: readonly string[],
  memberVerificationTaskIds: readonly string[] = [],
): DeliveryTaskCoverageInput["tasks"] {
  const memberVerification = new Set(memberVerificationTaskIds);
  return [
    ...taskIds.map((taskId) => ({
      taskId,
      role: memberVerification.has(taskId)
        ? { kind: "verification" as const, scope: "member" as const }
        : { kind: "implementation" as const },
    })),
    { taskId: "2.1", role: { kind: "verification" as const, scope: "work-unit" as const } },
  ];
}

function coverageInput(
  overrides: Partial<DeliveryTaskCoverageInput> = {},
): DeliveryTaskCoverageInput {
  return {
    entry: "from-tasks" as const,
    predecessorEntry: null,
    tasks: taskRoles(["1.1", "1.2"], ["1.1"]),
    memberTaskIds: [["1.1"]],
    ...overrides,
  };
}

describe("validateDeliveryTaskCoverage", () => {
  it("refuses a member range without a member-scope verification boundary", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      memberTaskIds: [["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [
        { kind: "member-verification-task-boundary", memberIndices: [0] },
        { kind: "member-verification-task-unbound", taskIds: ["1.1"] },
      ],
    });
  });

  it("refuses a member verifier followed by later implementation work in the same range", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: [
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "1.2", role: { kind: "verification", scope: "member" } },
        { taskId: "1.3", role: { kind: "implementation" } },
        { taskId: "2.1", role: { kind: "verification", scope: "work-unit" } },
      ],
      memberTaskIds: [["1.1", "1.2", "1.3"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [
        { kind: "member-verification-task-boundary", memberIndices: [0] },
        { kind: "member-verification-task-unbound", taskIds: ["1.2"] },
      ],
    });
  });

  it("refuses a member verifier that closes none of its owning members", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: [
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "1.2", role: { kind: "verification", scope: "member" } },
        { taskId: "1.3", role: { kind: "implementation" } },
        { taskId: "1.4", role: { kind: "verification", scope: "member" } },
        { taskId: "2.1", role: { kind: "verification", scope: "work-unit" } },
      ],
      memberTaskIds: [["1.1", "1.2", "1.3", "1.4"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [
        { kind: "member-verification-task-boundary", memberIndices: [0] },
        { kind: "member-verification-task-unbound", taskIds: ["1.2"] },
      ],
    });
  });

  it("refuses a member range closed by a verification task with another scope", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: [
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "1.2", role: { kind: "verification", scope: "segment" } },
        { taskId: "2.1", role: { kind: "verification", scope: "work-unit" } },
      ],
      memberTaskIds: [["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-verification-task-boundary", memberIndices: [0] }],
    });
  });

  it("accepts contiguous member ranges that follow task-list order", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3", "1.4"], ["1.2", "1.4"]),
      memberTaskIds: [["1.1", "1.2"], ["1.3", "1.4"]],
    }));

    expect(result).toEqual({ status: "valid", advisories: [] });
  });

  it("refuses interleaved member ranges with their indices", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3", "1.4"], ["1.3", "1.4"]),
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
      tasks: taskRoles(["1.1", "1.2", "1.3"], ["1.3"]),
      memberTaskIds: [["1.1", "1.3"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0] }],
    });
  });

  it("refuses contiguous ranges ordered against member order", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3", "1.4"], ["1.2", "1.4"]),
      memberTaskIds: [["1.3", "1.4"], ["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [0, 1] }],
    });
  });

  it("refuses one member verifier shared by adjacent members", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3"], ["1.2", "1.3"]),
      memberTaskIds: [["1.1", "1.2"], ["1.2", "1.3"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-verification-task-boundary", memberIndices: [0, 1] }],
    });
  });

  it("refuses a member verifier assigned outside the member it closes", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2", "1.3", "1.4"], ["1.2", "1.4"]),
      memberTaskIds: [["1.1", "1.2"], ["1.2", "1.3", "1.4"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "member-verification-task-boundary", memberIndices: [0, 1] }],
    });
  });

  it("refuses one task shared by non-adjacent members", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1"], ["1.1"]),
      memberTaskIds: [["1.1"], [], ["1.1"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [
        { kind: "member-task-order", memberIndices: [0, 1, 2] },
        { kind: "member-verification-task-boundary", memberIndices: [0, 2] },
      ],
    });
  });

  it("refuses an empty member range because it has no closing task", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2"], ["1.2"]),
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
        tasks: taskRoles(["1.1", "1.2"], ["1.1", "1.2"]),
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
      tasks: taskRoles(["1.1", "1.2"], ["1.1", "1.2"]),
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
        tasks: taskRoles(["1.1", "1.2"], ["1.2"]),
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

  it("keeps a member verifier final when it immediately follows a segment verifier", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: [
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "1.2", role: { kind: "verification", scope: "segment" } },
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
      tasks: taskRoles(["1.1", "1.2"], ["1.2"]),
      memberTaskIds: [["1.1", "1.2"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "entry-changed" }],
    });
  });

  it("refuses a member reference absent from the task inventory", () => {
    const result = validateDeliveryTaskCoverage(coverageInput({
      tasks: taskRoles(["1.1", "1.2"], ["1.2"]),
      memberTaskIds: [["1.1", "1.2", "9.9"]],
    }));

    expect(result).toEqual({
      status: "refused",
      issues: [{ kind: "unknown-task-reference", taskId: "9.9", memberIndex: 0 }],
    });
  });
});
