import { describe, expect, it, vi } from "vitest";

import type { NeedsUserTriggerAction, ReviewGateAction } from "../../../../../src/scripts/review-gate/core/next-action.js";
import type { ReceiptEnvelope, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  ReconcileNextActionReader,
  runNextAction,
  runPerformAction,
  type DeveloperActionPort,
  type NextActionReader,
} from "../../../../../src/scripts/review-gate/runtime/action-main.js";
import type { ReconcileRuntime } from "../../../../../src/scripts/review-gate/runtime/reconcile.js";

const HEAD = "a".repeat(40);
const REQUEST_KEY = "b".repeat(64);
const NOW = new Date("2026-07-12T20:00:00.000Z");

function action(overrides: Partial<NeedsUserTriggerAction> = {}): NeedsUserTriggerAction {
  return {
    schemaVersion: 1,
    kind: "needs-user-trigger",
    repositoryId: "100",
    changeRequestId: "PR_node",
    headSha: HEAD,
    requestKey: REQUEST_KEY,
    providerIdentity: "codex-pr",
    generation: 0,
    command: "@codex review the exact head",
    requiredActorIdentity: "7",
    ...overrides,
  };
}

function reader(value: ReviewGateAction = action()): NextActionReader {
  return { read: async () => value };
}

function port(overrides: Partial<DeveloperActionPort> = {}): DeveloperActionPort {
  return {
    currentActorIdentity: async () => "7",
    postComment: async (input) => ({
      kind: "created",
      comment: {
        commentId: "IC_1",
        actorIdentity: "7",
        body: input.body,
        createdAt: NOW.toISOString(),
      },
    }),
    findComments: async () => [],
    dispatchReconcile: async () => undefined,
    ...overrides,
  };
}

const input = {
  repositoryId: "100",
  changeRequestId: "PR_node",
  repositoryRef: "o/r",
  pullRequestNumber: 7,
  headSha: HEAD,
  requestKey: REQUEST_KEY,
  generation: 0,
};

describe("typed review-gate actions", () => {
  it("re-reduces exact canonical runtime state without exposing write operations", async () => {
    const target = action();
    const runtime: ReconcileRuntime = {
      read: async () => ({
        repositoryId: 100,
        pullRequestNumber: 7,
        headSha: HEAD,
        policyVersion: "p1",
        permissionVersion: "m1",
        ledgerVersion: 1,
      }),
      reduce: async () => ({
        request: {} as ReviewRequest,
        projection: {} as never,
        action: target,
        reservationEnvelope: {} as ReceiptEnvelope,
      }),
      reserve: async () => null,
      confirmPending: async () => true,
      execute: async () => ({ status: "acknowledged", invoked: true }),
      publish: async () => undefined,
    };
    const canonical = new ReconcileNextActionReader(runtime, () => NOW);
    await expect(canonical.read(input)).resolves.toEqual(target);
    const unconfirmed = new ReconcileNextActionReader({ ...runtime, confirmPending: async () => false }, () => NOW);
    await expect(unconfirmed.read(input)).resolves.toMatchObject({ kind: "waiting" });
    await expect(canonical.read({ ...input, headSha: "c".repeat(40) })).rejects.toThrow(/state moved/u);
  });

  it("returns only an exact canonical action scope", async () => {
    await expect(runNextAction(input, reader())).resolves.toEqual(action());
    await expect(runNextAction(input, reader(action({ headSha: "c".repeat(40) }))))
      .rejects.toThrow(/scope changed/u);
  });

  it("posts the exact command once and dispatches reconciliation", async () => {
    const target = port();
    const post = vi.spyOn(target, "postComment");
    const dispatch = vi.spyOn(target, "dispatchReconcile");

    await expect(runPerformAction(input, { reader: reader(), port: target, now: () => NOW })).resolves.toEqual({
      schemaVersion: 1,
      status: "posted",
      commentId: "IC_1",
      requestKey: REQUEST_KEY,
      generation: 0,
    });
    expect(post).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ headSha: HEAD }));
  });

  it("adopts only one exact actor/body/time match after ambiguous delivery", async () => {
    const matching = {
      commentId: "IC_2",
      actorIdentity: "7",
      body: action().command,
      createdAt: NOW.toISOString(),
    };
    const target = port({
      postComment: async () => ({ kind: "ambiguous" }),
      findComments: async () => [matching],
    });
    await expect(runPerformAction(input, { reader: reader(), port: target, now: () => NOW }))
      .resolves.toMatchObject({ status: "adopted", commentId: "IC_2" });

    target.findComments = async () => [matching, { ...matching, commentId: "IC_3" }];
    await expect(runPerformAction(input, { reader: reader(), port: target, now: () => NOW }))
      .rejects.toThrow(/could not be adopted exactly/u);
  });

  it("compares adopted comment timestamps by instant rather than string form", async () => {
    const target = port({
      postComment: async () => ({ kind: "ambiguous" }),
      findComments: async () => [{
        commentId: "IC_2",
        actorIdentity: "7",
        body: action().command,
        createdAt: "2026-07-12T15:00:00-05:00",
      }],
    });
    await expect(runPerformAction(input, { reader: reader(), port: target, now: () => NOW }))
      .resolves.toMatchObject({ status: "adopted", commentId: "IC_2" });
  });

  it("rejects wrong actors, changed generations, and no-longer-triggerable state", async () => {
    await expect(runPerformAction(input, {
      reader: reader(),
      port: port({ currentActorIdentity: async () => "8" }),
      now: () => NOW,
    })).rejects.toThrow(/actor mismatch/u);
    await expect(runPerformAction({ ...input, generation: 1 }, {
      reader: reader(),
      port: port(),
      now: () => NOW,
    })).rejects.toThrow(/stale/u);
    await expect(runPerformAction(input, {
      reader: reader({
        schemaVersion: 1,
        kind: "waiting",
        repositoryId: "100",
        changeRequestId: "PR_node",
        headSha: HEAD,
        summary: "provider running",
      }),
      port: port(),
      now: () => NOW,
    })).rejects.toThrow(/stale/u);
  });

  it("revalidates each consumption so a completed action cannot post twice", async () => {
    const waiting: ReviewGateAction = {
      schemaVersion: 1,
      kind: "waiting",
      repositoryId: "100",
      changeRequestId: "PR_node",
      headSha: HEAD,
      summary: "trigger already observed",
    };
    const actions = [action(), waiting];
    const changingReader: NextActionReader = { read: async () => actions.shift() ?? waiting };
    const target = port();
    const post = vi.spyOn(target, "postComment");

    await expect(runPerformAction(input, { reader: changingReader, port: target, now: () => NOW })).resolves.toBeTruthy();
    await expect(runPerformAction(input, { reader: changingReader, port: target, now: () => NOW }))
      .rejects.toThrow(/stale/u);
    expect(post).toHaveBeenCalledOnce();
  });

  it("surfaces dispatch failure after the exact post without retrying the mutation", async () => {
    const target = port({ dispatchReconcile: async () => { throw new Error("dispatch failed"); } });
    const post = vi.spyOn(target, "postComment");
    await expect(runPerformAction(input, { reader: reader(), port: target, now: () => NOW }))
      .rejects.toThrow("dispatch failed");
    expect(post).toHaveBeenCalledOnce();
  });
});
