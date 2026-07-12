import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { ReviewReceipt, SourceCapacity } from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  admitAlternate,
  admitAutomaticRequest,
  admitOutOfBandEvidence,
  admitRefresh,
} from "../../../../../src/scripts/review-gate/core/admission.js";

function requirement(overrides: Partial<ReviewRequirement> = {}): ReviewRequirement {
  return {
    schemaVersion: 1,
    id: "analysis",
    kind: "independent-analysis",
    obligation: "required",
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: "a".repeat(64),
    rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"],
    changeSetId: "b".repeat(64),
    headSha: "c".repeat(40),
    ...overrides,
  };
}

const capacity: SourceCapacity = {
  schemaVersion: 1,
  sourceIdentity: "agent-1",
  status: "available",
  reason: "provider-reported",
  provenance: "capacity:1",
  observedAt: "2026-07-10T20:00:00.000Z",
};

describe("request admission", () => {
  it("admits one ready required automatic generation-zero request", () => {
    expect(admitAutomaticRequest({
      requirement: requirement(), ready: true, draft: false, history: [], capacity,
    })).toEqual({ admit: true, generation: 0, reason: "automatic-initial" });
  });

  it.each([
    ["draft", { draft: true }],
    ["not ready", { ready: false }],
    ["recommended", { requirement: requirement({ obligation: "recommended" }) }],
    ["checkpoint", { requirement: requirement({ initialAdmission: "checkpoint" }) }],
    ["exhausted", { capacity: { ...capacity, status: "exhausted" as const } }],
    ["lookup failed", { capacity: { ...capacity, status: "unknown" as const, reason: "lookup-failed" as const } }],
  ])("suppresses automatic admission for %s", (_name, override) => {
    expect(admitAutomaticRequest({
      requirement: requirement(), ready: true, draft: false, history: [], capacity, ...override,
    }).admit).toBe(false);
  });

  it("permits unknown:not-observable for the one justified attempt", () => {
    expect(admitAutomaticRequest({
      requirement: requirement(), ready: true, draft: false, history: [],
      capacity: { ...capacity, status: "unknown", reason: "not-observable" },
    }).admit).toBe(true);
  });

  it.each(["reserved", "acknowledged", "terminal-failure"] as const)(
    "never auto-replays after %s history, including on a new head",
    (action) => {
      const history = [{ action, request: { requirementId: "analysis" } } as ReviewReceipt];
      expect(admitAutomaticRequest({
        requirement: requirement({ changeSetId: "d".repeat(64) }), ready: true, draft: false, history, capacity,
      })).toMatchObject({ admit: false, reason: "admitted-history-exists" });
    },
  );

  it.each(["required", "waived", "dismissed", "attested", "unadmitted"] as const)(
    "does not treat %s history as an admitted automatic request",
    (action) => {
      const history = [{ action, request: { requirementId: "analysis" } } as ReviewReceipt];
      expect(admitAutomaticRequest({
        requirement: requirement(), ready: true, draft: false, history, capacity,
      })).toMatchObject({ admit: true, reason: "automatic-initial" });
    },
  );

  it("advances authorized refresh generation and requires alternates to start full", () => {
    expect(admitRefresh({ authorized: true, priorGenerations: [0, 1], coverage: "incremental", chainHeadSha: "c".repeat(40), coverageFromSha: "c".repeat(40) })).toEqual({
      admit: true, generation: 2, reason: "authorized-refresh",
    });
    expect(admitAlternate({
      qualified: true, coverage: "incremental", sourceChanged: true, durableSupersession: true,
    }).admit).toBe(false);
    expect(admitAlternate({
      qualified: true, coverage: "full", sourceChanged: true, durableSupersession: false,
    })).toMatchObject({ admit: false, reason: "supersession-not-durable" });
    expect(admitAlternate({
      qualified: true, coverage: "full", sourceChanged: true, durableSupersession: true,
    }).admit).toBe(true);
  });

  it("accepts qualifying out-of-band evidence without fabricating admission", () => {
    expect(admitOutOfBandEvidence({ qualified: true, current: true, durable: true })).toEqual({
      accepted: true,
      requestSuppressed: true,
      receiptAction: "unadmitted",
    });
  });
});
