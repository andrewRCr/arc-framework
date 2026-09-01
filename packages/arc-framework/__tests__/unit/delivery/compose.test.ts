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
      implementationTaskIds: ["1.1", "1.2", "1.3"],
      verificationTaskId: "2.1",
      members,
    })).toEqual({
      status: "refused",
      issues: [{ kind: "uncovered-implementation-task", taskId: "1.2" }],
    });
    expect(validateDeliveryCompositionCoverage({
      entry: "from-branch",
      implementationTaskIds: ["1.1", "1.2", "1.3"],
      verificationTaskId: "2.1",
      members,
    })).toEqual({
      status: "valid",
      advisories: [{
        kind: "uncovered-implementation-task",
        taskId: "1.2",
        adjacentMemberChunkKey: "first",
      }],
    });
  });

  it("accepts fully covered authored tasks without advisories", () => {
    expect(validateDeliveryCompositionCoverage({
      entry: "from-tasks",
      implementationTaskIds: ["1.1", "1.2"],
      verificationTaskId: "2.1",
      members: [
        { chunkKey: "first", taskIds: ["1.1"] },
        { chunkKey: "second", taskIds: ["1.2"] },
      ],
    })).toEqual({ status: "valid", advisories: [] });
  });

  it("refuses a member with no closing task even when all tasks are covered elsewhere", () => {
    expect(validateDeliveryCompositionCoverage({
      entry: "from-branch",
      implementationTaskIds: ["1.1"],
      verificationTaskId: "2.1",
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
