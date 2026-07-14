import { describe, expect, it } from "vitest";

import type {
  ReceiptEnvelope,
  ReviewRequest,
  ReviewReceipt,
  SourceCapacity,
} from "../../../../../src/scripts/review-gate/core/execution.js";
import { parseReviewReceipt } from "../../../../../src/scripts/review-gate/core/execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { validateReceiptLedger } from "../../../../../src/scripts/review-gate/core/receipt-ledger.js";
import {
  planExplicitFlightAbandonment,
  planSourceSupersession,
} from "../../../../../src/scripts/review-gate/core/source-supersession.js";

const NOW = new Date("2026-07-12T20:00:00Z");

function request(sourceIdentity = "coderabbit-pr"): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "100",
    changeRequestId: "PR_1",
    changeSetId: "a".repeat(64),
    policyVersion: "b".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "independent-analysis",
    sourceIdentity,
    coverage: "full",
    coverageFromSha: "c".repeat(40),
    coverageThroughSha: "d".repeat(40),
    generation: 0,
    actorIdentity: "302312524",
    requestMechanism: "automatic",
    requiredActorIdentity: "302312524",
    requestCommand: null,
  };
}

function reserved(prior = request()): ReviewReceipt {
  return createReceipt({
    eventId: "reserved", previousLedgerVersion: 0, action: "reserved", request: prior,
    result: null, evidenceUrlOrId: null, findingIds: [],
    payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
  });
}

function failure(prior: ReviewRequest, reason: string | null, terminalAt: string | null): ReviewReceipt {
  return createReceipt({
    eventId: "failure", previousLedgerVersion: 1, action: "terminal-failure", request: prior,
    result: "unavailable", reason, evidenceUrlOrId: terminalAt === null ? null : "provider:terminal",
    findingIds: [],
    payload: { kind: "terminal-evidence", terminalAt, evidenceRefs: [], findingIds: [] },
  });
}

describe("durable source supersession", () => {
  it("plans fallback after a proven pre-effect rejection and converges on replay", () => {
    const prior = request();
    const history = [reserved(prior), failure(prior, "pre-effect-rejection:rate-limited", null)];
    const planned = planSourceSupersession({
      priorRequest: prior,
      alternateSourceIdentity: "codex-pr",
      actorIdentity: "302312524",
      proof: { kind: "pre-effect-rejection", receipt: history[1]! },
      receipts: history,
      expectedLedgerVersion: 2,
      supersededAt: NOW,
      reason: "provider rejected before effect",
    });
    expect(planned).toMatchObject({
      ok: true,
      replay: false,
      receipt: {
        action: "source-superseded",
        request: { sourceIdentity: "coderabbit-pr", generation: 0 },
        payload: {
          kind: "source-supersession",
          priorSourceIdentity: "coderabbit-pr",
          alternateSourceIdentity: "codex-pr",
          proofKind: "pre-effect-rejection",
        },
      },
    });
    if (!planned.ok) throw new Error(planned.error);
    expect(parseReviewReceipt(planned.receipt)).toEqual(planned.receipt);
    const envelopes: ReceiptEnvelope[] = [...history, planned.receipt].map((receipt, index) => ({
      schemaVersion: 1,
      durableRecordId: `record-${index + 1}`,
      recordedAt: `2026-07-12T20:0${index}:00Z`,
      lastModifiedAt: `2026-07-12T20:0${index}:00Z`,
      ledgerVersion: index + 1,
      receipt,
    }));
    expect(validateReceiptLedger({ envelopes, anchorVersion: 3, anchorCount: 3 })).toMatchObject({
      valid: true,
      errors: [],
    });
    expect(planSourceSupersession({
      priorRequest: prior,
      alternateSourceIdentity: "codex-pr",
      actorIdentity: "302312524",
      proof: { kind: "pre-effect-rejection", receipt: history[1]! },
      receipts: [...history, planned.receipt],
      expectedLedgerVersion: 3,
      supersededAt: NOW,
      reason: "provider rejected before effect",
    })).toMatchObject({ ok: true, replay: true, receipt: planned.receipt });
  });

  it("admits explicit exhausted capacity only before any provider effect", () => {
    const prior = request();
    const capacity: SourceCapacity = {
      schemaVersion: 1,
      sourceIdentity: "coderabbit-pr",
      status: "exhausted",
      reason: "provider-reported",
      provenance: "quota endpoint",
      observedAt: NOW.toISOString(),
    };
    expect(planSourceSupersession({
      priorRequest: prior,
      alternateSourceIdentity: "codex-pr",
      actorIdentity: "302312524",
      proof: { kind: "capacity-exhausted", capacity },
      receipts: [],
      expectedLedgerVersion: 0,
      supersededAt: NOW,
      reason: "capacity exhausted",
    })).toMatchObject({ ok: true, receipt: { action: "source-superseded" } });
    expect(planSourceSupersession({
      priorRequest: prior,
      alternateSourceIdentity: "codex-pr",
      actorIdentity: "302312524",
      proof: { kind: "capacity-exhausted", capacity },
      receipts: [reserved(prior)],
      expectedLedgerVersion: 1,
      supersededAt: NOW,
      reason: "capacity exhausted",
    })).toEqual({ ok: false, error: "capacity-proof-after-effect" });
  });

  it("rejects effect-ambiguous failure without terminal proof", () => {
    const prior = request();
    const ambiguous = failure(prior, null, null);
    expect(planSourceSupersession({
      priorRequest: prior,
      alternateSourceIdentity: "codex-pr",
      actorIdentity: "302312524",
      proof: { kind: "terminal-failure", receipt: ambiguous },
      receipts: [reserved(prior), ambiguous],
      expectedLedgerVersion: 2,
      supersededAt: NOW,
      reason: "try fallback",
    })).toEqual({ ok: false, error: "terminal-proof-missing" });
  });

  it("rejects a pre-effect proof recorded after acknowledgement", () => {
    const prior = request();
    const preEffect = failure(prior, "pre-effect-rejection:rate-limited", null);
    const acknowledged = createReceipt({
      eventId: "acknowledged",
      previousLedgerVersion: 1,
      action: "acknowledged",
      request: prior,
      result: null,
      reason: null,
      evidenceUrlOrId: "comment-1",
      findingIds: [],
      payload: {
        kind: "acknowledgement",
        acknowledgedAt: NOW.toISOString(),
        acknowledgementRef: "comment-1",
        trigger: {
          mechanism: "automatic",
          eventKind: "label",
          eventId: "comment-1",
          actorIdentity: prior.requiredActorIdentity,
          occurredAt: NOW.toISOString(),
          headSha: prior.coverageThroughSha,
          contentDigest: "d".repeat(64),
        },
      },
    });
    expect(planSourceSupersession({
      priorRequest: prior,
      alternateSourceIdentity: "codex-pr",
      actorIdentity: "302312524",
      proof: { kind: "pre-effect-rejection", receipt: preEffect },
      receipts: [reserved(prior), acknowledged, preEffect],
      expectedLedgerVersion: 3,
      supersededAt: NOW,
      reason: "try fallback",
    })).toEqual({ ok: false, error: "pre-effect-proof-after-acknowledgement" });
  });

  it("requires an authorized durable abandonment before explicit ambiguous-effect repair", () => {
    const prior = request();
    expect(planExplicitFlightAbandonment({
      request: prior,
      actorIdentity: "other",
      authorizedActorIdentities: ["302312524"],
      evidenceRef: "repair:operator-1",
      reason: "provider confirmed cancellation out of band",
      expectedLedgerVersion: 1,
      observedAt: NOW,
    })).toEqual({ ok: false, error: "unauthorized" });
    const repair = planExplicitFlightAbandonment({
      request: prior,
      actorIdentity: "302312524",
      authorizedActorIdentities: ["302312524"],
      evidenceRef: "repair:operator-1",
      reason: "provider confirmed cancellation out of band",
      expectedLedgerVersion: 1,
      observedAt: NOW,
    });
    expect(repair).toMatchObject({ ok: true, receipt: { action: "abandoned" } });
    if (!repair.ok) throw new Error(repair.error);
    expect(planSourceSupersession({
      priorRequest: prior,
      alternateSourceIdentity: "codex-pr",
      actorIdentity: "302312524",
      proof: { kind: "explicit-repair", receipt: repair.receipt },
      receipts: [reserved(prior), repair.receipt],
      expectedLedgerVersion: 2,
      supersededAt: NOW,
      reason: "explicit repaired fallback",
    })).toMatchObject({ ok: true, receipt: { action: "source-superseded" } });
  });
});
