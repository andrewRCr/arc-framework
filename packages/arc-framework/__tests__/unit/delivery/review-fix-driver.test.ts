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
    ["review-hosted-await", "external-wait"],
    ["resolve-review-applicability", "review-spend"],
    ["rerun-checkpoint", "external-wait"],
    ["continue-reconcile", "integration"],
    ["stop", "blocked"],
  ] as const)("classifies review status %s as %s", (nextAction, stopKind) => {
    expect(classifyDeliveryReviewFixReviewStatusStop(nextAction)).toBe(stopKind);
  });

  it("executes deterministic actions in-process until the first attended stop", async () => {
    const publish: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-review-fix-publish" };
    const response: DeliveryReviewFixDriveDispatchAction = { kind: "review-respond" };
    const refresh: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-refresh-execute" };
    const project = vi.fn()
      .mockResolvedValueOnce({
        step: { status: "dispatch", action: publish, recommendedActionText: "Publish." },
        progress,
      })
      .mockResolvedValueOnce({
        step: { status: "dispatch", action: response, recommendedActionText: "Replay response." },
        progress: { ...progress, stateRevision: 8 },
      })
      .mockResolvedValueOnce({
        step: { status: "dispatch", action: refresh, recommendedActionText: "Refresh." },
        progress: { ...progress, stateRevision: 9, operationId: "refresh-1" },
      })
      .mockResolvedValueOnce({
        step: {
          status: "verification-required",
          nextAction: "verify-review-fix",
          selectedDeliverableId: `sha256:${"a".repeat(64)}`,
        },
        progress: { ...progress, stateRevision: 10, operationId: null },
      });
    const execute = vi.fn()
      .mockResolvedValueOnce({ status: "published" })
      .mockResolvedValueOnce({ status: "delivery-correction-required" })
      .mockResolvedValueOnce({ status: "applied" });

    await expect(driveDeliveryReviewFixContinuation({ project, execute })).resolves.toEqual({
      status: "verification-required",
      nextAction: "verify-review-fix",
      selectedDeliverableId: `sha256:${"a".repeat(64)}`,
      effectLog: [
        { kind: "dispatch", actionKind: "delivery-review-fix-publish", resultStatus: "published" },
        { kind: "dispatch", actionKind: "review-respond", resultStatus: "delivery-correction-required" },
        { kind: "dispatch", actionKind: "delivery-refresh-execute", resultStatus: "applied" },
      ],
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("continues after an exact durable delivery-member response replay", async () => {
    const response: DeliveryReviewFixDriveDispatchAction = { kind: "review-respond" };
    const project = vi.fn()
      .mockResolvedValueOnce({
        step: { status: "dispatch", action: response, recommendedActionText: "Replay response." },
        progress,
      })
      .mockResolvedValueOnce({
        step: { status: "review-status-required", nextAction: "review-hosted-request" },
        progress,
      });

    await expect(driveDeliveryReviewFixContinuation({
      project,
      execute: async () => ({ status: "delivery-member-current" }),
    })).resolves.toMatchObject({
      status: "review-status-required",
      effectLog: [{
        kind: "dispatch",
        actionKind: "review-respond",
        resultStatus: "delivery-member-current",
      }],
    });
    expect(project).toHaveBeenCalledTimes(2);
  });

  it("returns the exact remaining hosted settlement instead of replaying a disposition", async () => {
    const responsePlan = { source: { kind: "hosted", attemptRef: "attempt-1" } };
    const responseRequest = { schemaVersion: 1, source: responsePlan.source, dispositions: {} };
    const response: DeliveryReviewFixDriveDispatchAction = {
      kind: "review-respond",
      input: responseRequest,
      responsePlan,
    };

    await expect(driveDeliveryReviewFixContinuation({
      project: async () => ({
        step: { status: "dispatch", action: response, recommendedActionText: "Replay response." },
        progress,
      }),
      execute: async () => ({
        status: "delivery-member-current",
        schemaVersion: 1,
        mode: "review-respond",
        state: "delivery-member-current",
        nextAction: "reduce",
        diagnostics: [],
        payload: {
          operationId: "attempt-1",
          dispositionRecordRef: "record-1",
          hostedSettlementPlan: {
            beforeFixFindingIds: [],
            afterFixFindingIds: ["finding-1"],
          },
        },
      }),
    })).resolves.toMatchObject({
      status: "hosted-settlement-required",
      stopKind: "finding-settlement",
      nextAction: "review-hosted-settle",
      responsePlan,
      responseRequest,
      response: { state: "delivery-member-current" },
      effectLog: [{
        kind: "dispatch",
        actionKind: "review-respond",
        resultStatus: "delivery-member-current",
      }],
    });
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

  it("drives private gate rematerialization and discloses its exact replay", async () => {
    const action: DeliveryReviewFixDriveDispatchAction = {
      kind: "delivery-review-fix-authoring-rematerialize",
    };
    const project = vi.fn()
      .mockResolvedValueOnce({
        step: { status: "dispatch", action, recommendedActionText: "Prepare the gate." },
        progress,
      })
      .mockResolvedValueOnce({
        step: { status: "authoring-required", nextAction: "author-correction" },
        progress,
      });

    await expect(driveDeliveryReviewFixContinuation({
      project,
      execute: async () => ({ status: "already-rematerialized", replayed: true }),
    })).resolves.toEqual({
      status: "authoring-required",
      nextAction: "author-correction",
      effectLog: [{
        kind: "no-op-replay",
        actionKind: "delivery-review-fix-authoring-rematerialize",
        resultStatus: "already-rematerialized",
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

  it("refuses a repeated identical record settlement without spinning", async () => {
    const effect = { kind: "commit" as const, recordClass: "boundary-projection", head: "3".repeat(40) };
    const settleRecordEffects = vi.fn().mockResolvedValue({ status: "settled", effects: [effect] });

    await expect(driveDeliveryReviewFixContinuation({
      project: vi.fn(),
      execute: vi.fn(),
      settleRecordEffects,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "delivery-review-fix-no-progress",
      actionKind: "record-settlement",
      effectLog: [effect, effect],
    });
    expect(settleRecordEffects).toHaveBeenCalledTimes(2);
  });

  it("bounds an advancing correction that never reaches an attended stop", async () => {
    let revision = 0;
    const action: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-reconcile" };
    const project = vi.fn(async () => ({
      step: { status: "dispatch" as const, action, recommendedActionText: "Reconcile." },
      progress: { ...progress, stateRevision: revision += 1 },
    }));
    const execute = vi.fn().mockResolvedValue({ status: "position" });

    await expect(driveDeliveryReviewFixContinuation({ project, execute })).resolves.toMatchObject({
      status: "refused",
      reason: "delivery-review-fix-drive-limit",
      effectLog: expect.arrayContaining([
        { kind: "dispatch", actionKind: "delivery-reconcile", resultStatus: "position" },
      ]),
    });
    expect(execute).toHaveBeenCalledTimes(16);
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
      workspace: {
        path: "/repo/.git/arc/delivery-resolutions/plan/member",
        head: "2".repeat(40),
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
        "Resolve the reported paths in conflictPreparation.workspace, record the exact prepared two-parent "
        + "merge there without pushing it, "
        + "then submit the returned correction resume unchanged.",
    });
  });
});
