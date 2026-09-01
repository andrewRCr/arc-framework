import { describe, expect, it, vi } from "vitest";

import {
  classifyDeliveryReviewFixStagedRecords,
  settleDeliveryReviewFixRecordEffects,
} from "../../../src/lib/delivery/review-fix-record-effects.js";

const workUnitId = "example-work-unit";
const candidatePath = `.arc/system/.internal/candidates/${workUnitId}.json`;
const boundaryPath = `.arc/system/.internal/candidates/${workUnitId}.boundary.json`;

describe("delivery review-fix record effects", () => {
  it("isolates exact machine-owned record paths from staged content", () => {
    expect(classifyDeliveryReviewFixStagedRecords({
      workUnitId,
      paths: [boundaryPath, candidatePath],
    })).toEqual({
      status: "ready",
      recordClass: "candidate-boundary-projection",
      paths: [boundaryPath, candidatePath],
    });
    expect(classifyDeliveryReviewFixStagedRecords({
      workUnitId,
      paths: [candidatePath, "src/content.ts"],
    })).toEqual({
      status: "ready",
      recordClass: "review-applicability-selection",
      paths: [candidatePath],
    });
    expect(classifyDeliveryReviewFixStagedRecords({
      workUnitId,
      paths: ["src/content.ts"],
    })).toEqual({
      status: "idle",
    });
  });

  it("commits and pushes one exact record batch with ordered disclosure", async () => {
    const commit = vi.fn().mockResolvedValue({ status: "committed", head: "3".repeat(40) });
    const push = vi.fn().mockResolvedValue({ status: "pushed" });
    const readRemoteHead = vi.fn()
      .mockResolvedValueOnce("2".repeat(40))
      .mockResolvedValueOnce("3".repeat(40));

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: ".arc/active/meta-example-work-unit.md (review correction)",
      ports: {
        listStagedPaths: vi.fn().mockResolvedValue([boundaryPath, candidatePath]),
        readRecoverableCommit: vi.fn().mockResolvedValue({ status: "none" }),
        readCurrentBranch: vi.fn().mockResolvedValue("feat/example"),
        readRemoteHead,
        commit,
        push,
      },
    })).resolves.toEqual({
      status: "settled",
      effects: [
        { kind: "commit", recordClass: "candidate-boundary-projection", head: "3".repeat(40) },
        {
          kind: "push",
          ref: "refs/heads/feat/example",
          beforeHead: "2".repeat(40),
          afterHead: "3".repeat(40),
        },
      ],
    });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      paths: [boundaryPath, candidatePath],
      message: expect.stringContaining("Context: .arc/active/meta-example-work-unit.md (review correction)"),
    }));
    expect(push).toHaveBeenCalledWith({ branch: "feat/example" });
  });

  it("replays the push for one exact record-only commit left ahead of the remote", async () => {
    const head = "3".repeat(40);
    const beforeHead = "2".repeat(40);
    const push = vi.fn().mockResolvedValue({ status: "pushed" });
    const commit = vi.fn();

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      ports: {
        listStagedPaths: vi.fn().mockResolvedValue([]),
        readRecoverableCommit: vi.fn().mockResolvedValue({
          status: "recoverable",
          recordClass: "candidate-boundary-projection",
          branch: "feat/example",
          head,
          beforeHead,
        }),
        readCurrentBranch: vi.fn(),
        readRemoteHead: vi.fn().mockResolvedValue(head),
        commit,
        push,
      },
    })).resolves.toEqual({
      status: "settled",
      effects: [
        {
          kind: "commit",
          recordClass: "candidate-boundary-projection",
          head,
          replayed: true,
        },
        {
          kind: "push",
          ref: "refs/heads/feat/example",
          beforeHead,
          afterHead: head,
        },
      ],
    });
    expect(commit).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ branch: "feat/example" });
  });
});
