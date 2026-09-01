import { describe, expect, it, vi } from "vitest";

import {
  classifyDeliveryReviewFixReviewStatusStop,
  driveDeliveryReviewFixContinuation,
  type DeliveryReviewFixDriveDispatchAction,
  type DeliveryReviewFixDriveProgress,
} from "../../../src/lib/delivery/review-fix-driver.js";

const progress: DeliveryReviewFixDriveProgress = {
  stateRevision: 7,
  operationId: null,
  boundaryVersion: "boundary-1",
  relevantHeads: ["1".repeat(40), "2".repeat(40)],
};

describe("delivery review-fix driver", () => {
  it.each([
    ["respond-to-findings", "finding-disposition"],
    ["obtain-ceiling-override", "review-spend"],
    ["review-hosted-request", "review-spend"],
    ["resolve-review-applicability", "review-spend"],
    ["rerun-checkpoint", "external-wait"],
    ["continue-reconcile", "integration"],
    ["stop", "blocked"],
  ] as const)("classifies review status %s as %s", (nextAction, stopKind) => {
    expect(classifyDeliveryReviewFixReviewStatusStop(nextAction)).toBe(stopKind);
  });

  it("executes deterministic actions in-process until the first attended stop", async () => {
    const publish: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-review-fix-publish" };
    const refresh: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-refresh-execute" };
    const project = vi.fn()
      .mockResolvedValueOnce({
        step: { status: "dispatch", action: publish, recommendedActionText: "Publish." },
        progress,
      })
      .mockResolvedValueOnce({
        step: { status: "dispatch", action: refresh, recommendedActionText: "Refresh." },
        progress: { ...progress, stateRevision: 8, operationId: "refresh-1" },
      })
      .mockResolvedValueOnce({
        step: {
          status: "verification-required",
          nextAction: "verify-review-fix",
          selectedDeliverableId: `sha256:${"a".repeat(64)}`,
        },
        progress: { ...progress, stateRevision: 9, operationId: null },
      });
    const execute = vi.fn()
      .mockResolvedValueOnce({ status: "published" })
      .mockResolvedValueOnce({ status: "applied" });

    await expect(driveDeliveryReviewFixContinuation({ project, execute })).resolves.toEqual({
      status: "verification-required",
      nextAction: "verify-review-fix",
      selectedDeliverableId: `sha256:${"a".repeat(64)}`,
      effectLog: [
        { kind: "dispatch", actionKind: "delivery-review-fix-publish", resultStatus: "published" },
        { kind: "dispatch", actionKind: "delivery-refresh-execute", resultStatus: "applied" },
      ],
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("refuses a repeated action at an unchanged progress fingerprint", async () => {
    const action: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-reconcile" };
    const project = vi.fn().mockResolvedValue({
      step: { status: "dispatch", action, recommendedActionText: "Reconcile." },
      progress,
    });
    const execute = vi.fn().mockResolvedValue({ status: "position" });

    await expect(driveDeliveryReviewFixContinuation({ project, execute })).resolves.toEqual({
      status: "refused",
      reason: "delivery-review-fix-no-progress",
      actionKind: "delivery-reconcile",
      progress,
      effectLog: [
        { kind: "dispatch", actionKind: "delivery-reconcile", resultStatus: "position" },
      ],
      recommendedActionText:
        "The correction returned the same action at the same canonical position. Inspect the retained operation before retrying.",
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("discloses an idempotent action replay without inventing another mutation", async () => {
    const action: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-review-fix-acknowledge" };
    const project = vi.fn()
      .mockResolvedValueOnce({
        step: { status: "dispatch", action, recommendedActionText: "Acknowledge." },
        progress,
      })
      .mockResolvedValueOnce({
        step: { status: "authority-required", authority: "hosted-review" },
        progress: { ...progress, stateRevision: 8 },
      });
    const execute = vi.fn().mockResolvedValue({ status: "already-acknowledged", replayed: true });

    await expect(driveDeliveryReviewFixContinuation({ project, execute })).resolves.toEqual({
      status: "authority-required",
      authority: "hosted-review",
      effectLog: [{
        kind: "no-op-replay",
        actionKind: "delivery-review-fix-acknowledge",
        resultStatus: "already-acknowledged",
      }],
    });
  });

  it("carries a stale same-Candidate boundary internally before re-entering hosted status", async () => {
    const project = vi.fn()
      .mockResolvedValueOnce({
        step: {
          status: "boundary-carry-required",
          planId: "plan-1",
          stateRevision: 8,
        },
        progress,
      })
      .mockResolvedValueOnce({
        step: { status: "review-status-required", nextAction: "respond-to-findings" },
        progress: { ...progress, boundaryVersion: "boundary-2" },
      });
    const carryBoundary = vi.fn().mockResolvedValue({
      status: "carried",
      path: ".arc/active/integration-boundary.json",
      candidateId: `sha256:${"a".repeat(64)}`,
      stateRevision: 8,
    });

    await expect(driveDeliveryReviewFixContinuation({
      project,
      execute: vi.fn(),
      carryBoundary,
    })).resolves.toEqual({
      status: "review-status-required",
      nextAction: "respond-to-findings",
      effectLog: [{
        kind: "boundary-carry",
        path: ".arc/active/integration-boundary.json",
        candidateId: `sha256:${"a".repeat(64)}`,
        stateRevision: 8,
      }],
    });
    expect(carryBoundary).toHaveBeenCalledWith({ planId: "plan-1", stateRevision: 8 });
  });

  it("settles machine-owned record commits and pushes before returning an attended stop", async () => {
    const project = vi.fn().mockResolvedValue({
      step: { status: "review-status-required", nextAction: "respond-to-findings" },
      progress,
    });
    const settleRecordEffects = vi.fn()
      .mockResolvedValueOnce({
        status: "settled",
        effects: [
          { kind: "commit", recordClass: "boundary-projection", head: "3".repeat(40) },
          {
            kind: "push",
            ref: "refs/heads/feat/example",
            beforeHead: "2".repeat(40),
            afterHead: "3".repeat(40),
          },
        ],
      })
      .mockResolvedValueOnce({ status: "idle", effects: [] });

    await expect(driveDeliveryReviewFixContinuation({
      project,
      execute: vi.fn(),
      settleRecordEffects,
    })).resolves.toEqual({
      status: "review-status-required",
      nextAction: "respond-to-findings",
      effectLog: [
        { kind: "commit", recordClass: "boundary-projection", head: "3".repeat(40) },
        {
          kind: "push",
          ref: "refs/heads/feat/example",
          beforeHead: "2".repeat(40),
          afterHead: "3".repeat(40),
        },
      ],
    });
    expect(project).toHaveBeenCalledOnce();
  });

  it("returns exact conflict preparation and a submit-ready correction resume", async () => {
    const action: DeliveryReviewFixDriveDispatchAction = {
      kind: "delivery-refresh-execute",
      input: { repository: "owner/repo", remote: "origin" },
    };
    const conflictPreparation = {
      topRef: "refs/heads/feat/example",
      logicalMergeBase: "1".repeat(40),
      parents: { top: "2".repeat(40), refreshedPredecessor: "3".repeat(40) },
      mergeTree: {
        argv: [
          "git", "merge-tree", "--write-tree", "--merge-base", "1".repeat(40),
          "--name-only", "-z", "--no-messages", "2".repeat(40), "3".repeat(40),
        ],
      },
    };
    const project = vi.fn().mockResolvedValue({
      step: { status: "dispatch", action, recommendedActionText: "Refresh." },
      progress,
    });
    const execute = vi.fn().mockResolvedValue({
      status: "blocked",
      reason: "content-conflict",
      paths: ["shared.txt"],
      conflictPreparation,
    });

    await expect(driveDeliveryReviewFixContinuation({ project, execute })).resolves.toEqual({
      status: "conflict-required",
      stopKind: "conflict",
      paths: ["shared.txt"],
      conflictPreparation,
      resumeAction: {
        argv: ["arc", "delivery", "review-fix", "continue", "-", "--json"],
        input: { repository: "owner/repo", remote: "origin" },
      },
      effectLog: [{
        kind: "dispatch",
        actionKind: "delivery-refresh-execute",
        resultStatus: "blocked",
      }],
      recommendedActionText:
        "Record the exact prepared two-parent merge on conflictPreparation.topRef locally without pushing it, "
        + "then submit the returned correction resume unchanged.",
    });
  });
});
