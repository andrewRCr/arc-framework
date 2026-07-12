import { describe, expect, it } from "vitest";

import type { AuthorizedReviewCommandEvent } from "../../../../../src/scripts/review-gate/core/command-ingestion.js";
import {
  COMMAND_RECEIPT_SOURCE,
  createDirectCommandReceipt,
  planCommandRefresh,
} from "../../../../../src/scripts/review-gate/core/command-receipts.js";

const changeRequest = {
  schemaVersion: 1 as const,
  repositoryId: "100",
  changeRequestId: "PR_node",
  hostRef: "github:o/r/pull/7",
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: "b".repeat(40),
  headSha: "c".repeat(40),
  changeSetId: "d".repeat(64),
};

const requirement = {
  schemaVersion: 1 as const,
  id: "analysis",
  kind: "independent-analysis" as const,
  obligation: "recommended" as const,
  acceptableSources: [{ sourceKind: "agent" as const, qualifier: "independent-analysis/v1" }],
  count: 1,
  initialAdmission: "automatic" as const,
  policyVersion: "e".repeat(64),
  rubricVersion: "independent-analysis/v1",
  reasons: ["routine"],
  changeSetId: changeRequest.changeSetId,
  headSha: changeRequest.headSha,
};

function event(overrides: Partial<AuthorizedReviewCommandEvent> = {}): AuthorizedReviewCommandEvent {
  return {
    eventId: "command:IC_1:2026-07-11T20:00:00Z:body",
    commentNodeId: "IC_1",
    actorIdentity: "7",
    actorLogin: "alice",
    permission: "write",
    command: { kind: "require", requirementId: "analysis", reason: "request independent review" },
    durableRef: "https://github.test/pull/7#issuecomment-1",
    createdAt: "2026-07-11T20:00:00Z",
    updatedAt: "2026-07-11T20:00:00Z",
    ...overrides,
  };
}

describe("command receipt planning", () => {
  it("turns an authorized require command into a current durable override receipt", () => {
    const result = createDirectCommandReceipt({
      event: event(),
      changeRequest,
      requirement,
      expectedLedgerVersion: 3,
      priorReceipts: [],
    });

    expect(result).toMatchObject({
      ok: true,
      replay: false,
      receipt: {
        eventId: "command:IC_1:2026-07-11T20:00:00Z:body",
        previousLedgerVersion: 3,
        action: "required",
        reason: "request independent review",
        evidenceUrlOrId: "https://github.test/pull/7#issuecomment-1",
        request: {
          requirementId: "analysis",
          sourceIdentity: COMMAND_RECEIPT_SOURCE,
          actorIdentity: "7",
          semanticsVersion: "review-gate/v1",
          requestMechanism: "authorized-command",
          requiredActorIdentity: "7",
        },
        payload: { kind: "decision" },
      },
    });
  });

  it("replays only a byte-equivalent direct command receipt", () => {
    const first = createDirectCommandReceipt({
      event: event({ command: { kind: "waive", requirementId: "analysis", reason: "accepted risk" } }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 3,
      priorReceipts: [],
    });
    expect(first).toMatchObject({ ok: true, replay: false });
    if (!first.ok) throw new Error("expected direct receipt");

    const replay = createDirectCommandReceipt({
      event: event({ command: { kind: "waive", requirementId: "analysis", reason: "accepted risk" } }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 7,
      priorReceipts: [first.receipt],
    });
    const conflict = createDirectCommandReceipt({
      event: event({ command: { kind: "waive", requirementId: "analysis", reason: "changed reason" } }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 7,
      priorReceipts: [first.receipt],
    });

    expect(replay).toMatchObject({ ok: true, replay: true, receipt: first.receipt });
    expect(conflict).toEqual({ ok: false, error: "conflicting-command-replay" });
  });

  it("preserves the named source and finding when planning a dismissal", () => {
    const result = createDirectCommandReceipt({
      event: event({
        permission: "maintain",
        command: {
          kind: "dismiss",
          requirementId: "analysis",
          sourceIdentity: "agent-1",
          findingId: "finding-1",
          reason: "not applicable to this review",
        },
      }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 3,
      priorReceipts: [],
    });

    expect(result).toMatchObject({
      ok: true,
      receipt: {
        action: "dismissed",
        findingIds: ["finding-1"],
        request: { sourceIdentity: "agent-1", actorIdentity: "7" },
        reason: "not applicable to this review",
      },
    });
  });

  it("plans an authorized full refresh as the normal reservation protocol", () => {
    const result = planCommandRefresh({
      event: event({
        command: {
          kind: "refresh",
          requirementId: "analysis",
          sourceIdentity: "agent-1",
          coverage: "full",
          reason: "run the full change again",
        },
      }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 3,
      priorReceipts: [],
      qualifiedSourceIdentities: ["agent-1"],
      reviewedChainHead: null,
      controllerActorIdentity: "99",
    });

    expect(result).toMatchObject({
      ok: true,
      replay: false,
      request: {
        sourceIdentity: "agent-1",
        coverage: "full",
        coverageFromSha: changeRequest.diffBaseSha,
        coverageThroughSha: changeRequest.headSha,
        generation: 0,
        actorIdentity: "7",
        semanticsVersion: "review-gate/v1",
        requestMechanism: "authorized-command",
        requiredActorIdentity: "99",
      },
      reservation: {
        eventId: "command:IC_1:2026-07-11T20:00:00Z:body",
        action: "reserved",
        reason: "run the full change again",
        payload: { kind: "reservation" },
      },
    });
  });

  it("requires an exact reviewed head for incremental refresh and advances generation", () => {
    const first = planCommandRefresh({
      event: event({
        command: {
          kind: "refresh",
          requirementId: "analysis",
          sourceIdentity: "agent-1",
          coverage: "full",
          reason: "review again",
        },
      }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 3,
      priorReceipts: [],
      qualifiedSourceIdentities: ["agent-1"],
      reviewedChainHead: null,
      controllerActorIdentity: "99",
    });
    expect(first).toMatchObject({ ok: true, replay: false });
    if (!first.ok) throw new Error("expected initial reservation");

    const missingHead = planCommandRefresh({
      event: event({
        eventId: "command:IC_2:incremental",
        command: {
          kind: "refresh",
          requirementId: "analysis",
          sourceIdentity: "agent-1",
          coverage: "incremental",
          reason: "review the delta",
        },
      }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 4,
      priorReceipts: [first.reservation],
      qualifiedSourceIdentities: ["agent-1"],
      reviewedChainHead: null,
      controllerActorIdentity: "99",
    });
    const incremental = planCommandRefresh({
      event: event({
        eventId: "command:IC_2:incremental",
        command: {
          kind: "refresh",
          requirementId: "analysis",
          sourceIdentity: "agent-1",
          coverage: "incremental",
          reason: "review the delta",
        },
      }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 4,
      priorReceipts: [first.reservation],
      qualifiedSourceIdentities: ["agent-1"],
      reviewedChainHead: "f".repeat(40),
      controllerActorIdentity: "99",
    });

    expect(missingHead).toEqual({ ok: false, error: "incremental-chain-head-missing" });
    expect(incremental).toMatchObject({
      ok: true,
      request: { coverage: "incremental", coverageFromSha: "f".repeat(40), generation: 1 },
    });

    const replay = planCommandRefresh({
      event: event({
        command: {
          kind: "refresh",
          requirementId: "analysis",
          sourceIdentity: "agent-1",
          coverage: "full",
          reason: "review again",
        },
      }),
      changeRequest,
      requirement,
      expectedLedgerVersion: 9,
      priorReceipts: [first.reservation],
      qualifiedSourceIdentities: [],
      reviewedChainHead: null,
      controllerActorIdentity: "99",
    });
    expect(replay).toMatchObject({ ok: true, replay: true, reservation: first.reservation });
  });
});
