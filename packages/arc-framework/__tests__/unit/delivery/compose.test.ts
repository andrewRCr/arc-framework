import { describe, expect, it } from "vitest";

import {
  validateDeliveryCompositionCoverage,
  validateDeliveryContributionPartition,
} from "../../../src/lib/delivery/compose.js";

describe("delivery composition checks", () => {
  it("accepts an ordered contiguous contribution partition", () => {
    expect(validateDeliveryContributionPartition({
      contributionStepIds: ["a", "b", "c"],
      members: [
        { chunkKey: "first", contributionStepIds: ["a", "b"] },
        { chunkKey: "second", contributionStepIds: ["c"] },
      ],
    })).toEqual({ status: "valid" });
  });

  it("refuses contribution steps covered more than once", () => {
    expect(validateDeliveryContributionPartition({
      contributionStepIds: ["a", "b", "c"],
      members: [
        { chunkKey: "first", contributionStepIds: ["a", "b"] },
        { chunkKey: "second", contributionStepIds: ["b", "c"] },
      ],
    })).toEqual({
      status: "refused",
      reason: "contribution-step-covered-more-than-once",
      stepId: "b",
    });
  });

  it("refuses a non-contiguous member", () => {
    expect(validateDeliveryContributionPartition({
      contributionStepIds: ["a", "b", "c"],
      members: [
        { chunkKey: "first", contributionStepIds: ["a", "c"] },
        { chunkKey: "second", contributionStepIds: ["b"] },
      ],
    })).toEqual({
      status: "refused",
      reason: "member-contribution-noncontiguous",
      chunkKey: "first",
    });
  });

  it("refuses contribution steps authored out of inventory order", () => {
    expect(validateDeliveryContributionPartition({
      contributionStepIds: ["a", "b"],
      members: [{ chunkKey: "first", contributionStepIds: ["b", "a"] }],
    })).toEqual({
      status: "refused",
      reason: "member-contribution-order-mismatch",
      chunkKey: "first",
    });
  });

  it("refuses missing and unknown contribution steps", () => {
    expect(validateDeliveryContributionPartition({
      contributionStepIds: ["a", "b"],
      members: [{ chunkKey: "first", contributionStepIds: ["a"] }],
    })).toEqual({ status: "refused", reason: "contribution-step-uncovered", stepId: "b" });
    expect(validateDeliveryContributionPartition({
      contributionStepIds: ["a"],
      members: [{ chunkKey: "first", contributionStepIds: ["a", "outside"] }],
    })).toEqual({ status: "refused", reason: "contribution-step-unknown", stepId: "outside" });
  });

  it("refuses uncovered authored tasks and advises with an adjacent member on retrofit", () => {
    const members = [
      { chunkKey: "first", taskIds: ["1.1"] },
      { chunkKey: "second", taskIds: ["1.3"] },
    ];
    expect(validateDeliveryCompositionCoverage({
      entry: "from-tasks",
      tasks: [
        { taskId: "1.1", role: { kind: "verification" as const, scope: "member" } },
        { taskId: "1.2", role: { kind: "implementation" as const } },
        { taskId: "1.3", role: { kind: "verification" as const, scope: "member" } },
      ],
      members,
    })).toEqual({
      status: "refused",
      issues: [{ kind: "uncovered-assignable-task", taskId: "1.2" }],
    });
    expect(validateDeliveryCompositionCoverage({
      entry: "from-branch",
      tasks: [
        { taskId: "1.1", role: { kind: "verification" as const, scope: "member" } },
        { taskId: "1.2", role: { kind: "implementation" as const } },
        { taskId: "1.3", role: { kind: "verification" as const, scope: "member" } },
      ],
      members,
    })).toEqual({
      status: "valid",
      advisories: [{
        kind: "uncovered-assignable-task",
        taskId: "1.2",
        adjacentMemberChunkKey: "first",
      }],
    });
  });

  it("accepts fully covered authored tasks without advisories", () => {
    expect(validateDeliveryCompositionCoverage({
      entry: "from-tasks",
      tasks: ["1.1", "1.2"].map((taskId) => ({
        taskId,
        role: { kind: "verification" as const, scope: "member" },
      })),
      members: [
        { chunkKey: "first", taskIds: ["1.1"] },
        { chunkKey: "second", taskIds: ["1.2"] },
      ],
    })).toEqual({ status: "valid", advisories: [] });
  });

  it("refuses an adjacent pair that shares one closing member verifier", () => {
    expect(validateDeliveryCompositionCoverage({
      entry: "from-tasks",
      tasks: [
        { taskId: "1.1", role: { kind: "implementation" as const } },
        { taskId: "1.2", role: { kind: "verification" as const, scope: "member" } },
      ],
      members: [
        { chunkKey: "first", taskIds: ["1.1", "1.2"] },
        { chunkKey: "second", taskIds: ["1.2"] },
      ],
    })).toEqual({
      status: "refused",
      issues: [{ kind: "member-verification-task-boundary", memberIndices: [0, 1] }],
    });
  });

  it("refuses a member with no closing task even when all tasks are covered elsewhere", () => {
    expect(validateDeliveryCompositionCoverage({
      entry: "from-branch",
      tasks: [{ taskId: "1.1", role: { kind: "verification", scope: "member" } }],
      members: [
        { chunkKey: "attributed", taskIds: ["1.1"] },
        { chunkKey: "review-fixes", taskIds: [] },
      ],
    })).toEqual({
      status: "refused",
      issues: [{ kind: "member-task-order", memberIndices: [1] }],
    });
  });
});
