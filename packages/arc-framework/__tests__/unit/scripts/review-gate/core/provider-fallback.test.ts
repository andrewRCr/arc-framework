import { describe, expect, it } from "vitest";

import type { ReviewRequest, ReviewReceipt, SourceCapacity } from "../../../../../src/scripts/review-gate/core/execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { resolveProviderFallback } from "../../../../../src/scripts/review-gate/core/provider-fallback.js";

const NOW = new Date("2026-07-12T20:00:00Z");

function request(sourceIdentity: string): ReviewRequest {
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
    requestMechanism: sourceIdentity === "codex-pr" ? "user-trigger" : "automatic",
    requiredActorIdentity: sourceIdentity === "codex-pr" ? "7" : "302312524",
    requestCommand: sourceIdentity === "codex-pr" ? "@codex review" : null,
  };
}

function capacity(sourceIdentity: string, status: SourceCapacity["status"]): SourceCapacity {
  return {
    schemaVersion: 1,
    sourceIdentity,
    status,
    reason: status === "exhausted" ? "provider-reported" : "not-observable",
    provenance: `capacity:${sourceIdentity}`,
    observedAt: NOW.toISOString(),
  };
}

function receipt(
  prior: ReviewRequest,
  action: "reserved" | "acknowledged" | "terminal-failure",
  previousLedgerVersion: number,
  reason: string | null = null,
): ReviewReceipt {
  return createReceipt({
    eventId: action,
    previousLedgerVersion,
    action,
    request: prior,
    result: action === "terminal-failure" ? "unavailable" : null,
    reason,
    evidenceUrlOrId: action === "acknowledged" ? "trigger:1" : null,
    findingIds: [],
    payload: action === "reserved"
      ? { kind: "reservation", reservedAt: null, pendingProjectionRef: null }
      : action === "acknowledged"
        ? {
          kind: "acknowledgement", acknowledgedAt: NOW.toISOString(), acknowledgementRef: "trigger:1",
          trigger: {
            mechanism: prior.requestMechanism, eventKind: "label", eventId: "trigger:1",
            actorIdentity: prior.requiredActorIdentity, occurredAt: NOW.toISOString(),
            headSha: prior.coverageThroughSha, contentDigest: "e".repeat(64),
          },
        }
        : { kind: "terminal-evidence", terminalAt: null, evidenceRefs: [], findingIds: [] },
  });
}

describe("one-live-source fallback", () => {
  const coderabbit = request("coderabbit-pr");
  const codex = request("codex-pr");

  it("selects the first qualified source when capacity is unknown", () => {
    expect(resolveProviderFallback({
      orderedCandidates: [coderabbit, codex],
      capacities: [capacity("coderabbit-pr", "unknown"), capacity("codex-pr", "unknown")],
      receipts: [],
      ledgerVersion: 0,
      now: NOW,
    })).toEqual({ kind: "selected", request: coderabbit });
  });

  it("requires a durable supersession pass before selecting an exhausted source's alternate", () => {
    const first = resolveProviderFallback({
      orderedCandidates: [coderabbit, codex],
      capacities: [capacity("coderabbit-pr", "exhausted"), capacity("codex-pr", "unknown")],
      receipts: [],
      ledgerVersion: 0,
      now: NOW,
    });
    expect(first).toMatchObject({ kind: "append-supersession", receipt: { action: "source-superseded" } });
    if (first.kind !== "append-supersession") throw new Error("expected supersession");
    expect(resolveProviderFallback({
      orderedCandidates: [coderabbit, codex],
      capacities: [capacity("coderabbit-pr", "exhausted"), capacity("codex-pr", "unknown")],
      receipts: [first.receipt],
      ledgerVersion: 1,
      now: NOW,
    })).toEqual({ kind: "selected", request: codex });
  });

  it("blocks acknowledged silence and ambiguous delivery from selecting the alternate", () => {
    const history = [
      receipt(coderabbit, "reserved", 0),
      receipt(coderabbit, "acknowledged", 1),
      receipt(coderabbit, "terminal-failure", 2, "ambiguous:response-lost"),
    ];
    expect(resolveProviderFallback({
      orderedCandidates: [coderabbit, codex],
      capacities: [capacity("coderabbit-pr", "unknown"), capacity("codex-pr", "unknown")],
      receipts: history,
      ledgerVersion: 3,
      now: NOW,
    })).toMatchObject({ kind: "blocked", reason: "prior-effect-not-terminal" });
  });

  it("plans one supersession for a canonical pre-effect rejection", () => {
    const history = [
      receipt(coderabbit, "reserved", 0),
      receipt(coderabbit, "terminal-failure", 1, "pre-effect-rejection:rate-limited"),
    ];
    expect(resolveProviderFallback({
      orderedCandidates: [coderabbit, codex],
      capacities: [capacity("coderabbit-pr", "unknown"), capacity("codex-pr", "unknown")],
      receipts: history,
      ledgerVersion: 2,
      now: NOW,
    })).toMatchObject({ kind: "append-supersession", receipt: { action: "source-superseded" } });
  });
});
