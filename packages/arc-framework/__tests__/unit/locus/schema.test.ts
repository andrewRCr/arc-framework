/** Runtime-contract coverage for the locus schema family. */

import { describe, expect, it } from "vitest";

import {
  LocusEnvelopeV1Schema,
  LocusIdentityV1Schema,
  LocusMutationResultV1Schema,
  LocusRecordV1Schema,
  LocusStateV1Schema,
} from "../../../src/lib/locus/schema/index.js";

const timestamp = "2026-07-18T00:00:00.000Z";
const claimId = "0123456789abcdef0123456789abcdef";
const digest = `sha256:${"a".repeat(64)}`;

function record(role: unknown = {
  kind: "work-unit",
  subject: { kind: "work-unit", key: "session-locus-model", claimId: null },
  establishedAt: timestamp,
  parentCheckoutPath: null,
  dispatchId: null,
  originEntry: null,
  routingPlanDigest: null,
}): unknown {
  return {
    schemaVersion: 1,
    recordId: digest,
    checkoutPath: "/repo-worktree",
    role,
    lease: {
      leaseId: claimId,
      sessionHomePath: "/repo-worktree",
      anchor: {
        kind: "process",
        pid: 42,
        startToken: "opaque-start-token",
        inspector: "future-inspector",
        selector: "codex",
      },
      attachedAt: timestamp,
      heartbeatAt: timestamp,
    },
  };
}

describe("locus record schema", () => {
  it("accepts exact records with opaque future role and inspector vocabulary", () => {
    const value = record({
      kind: "future-role",
      subject: { kind: "future-subject", key: "opaque-key", claimId: null },
      establishedAt: timestamp,
      parentCheckoutPath: null,
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
    });
    expect(LocusRecordV1Schema.parse(value)).toEqual(value);
  });

  it("enforces claim generations for known identity-backed role pairs", () => {
    const errand = {
      kind: "errand",
      subject: { kind: "errand", key: "fix-output", claimId },
      establishedAt: timestamp,
      parentCheckoutPath: "/repo-worktree",
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
    };
    expect(LocusRecordV1Schema.safeParse(record(errand)).success).toBe(true);
    expect(LocusRecordV1Schema.safeParse(record({
      ...errand,
      subject: { ...errand.subject, claimId: null },
    })).success).toBe(false);
    expect(LocusRecordV1Schema.safeParse(record({
      ...errand,
      kind: "work-unit",
      subject: { kind: "work-unit", key: "wu", claimId },
    })).success).toBe(false);
  });

  it("enforces partial execution-context pairings and exact keys", () => {
    const partial = {
      kind: "errand",
      subject: { kind: "partial-errand", key: "fix-output", claimId: null },
      establishedAt: timestamp,
      parentCheckoutPath: null,
      dispatchId: "dispatch-1",
      originEntry: "Fix output",
      routingPlanDigest: null,
    };
    expect(LocusRecordV1Schema.safeParse(record(partial)).success).toBe(true);
    expect(LocusRecordV1Schema.safeParse(record({ ...partial, originEntry: null })).success).toBe(false);
    expect(LocusRecordV1Schema.safeParse({ ...(record() as object), extra: true }).success).toBe(false);
  });
});

describe("locus identity schema", () => {
  it("round-trips ordinary errands, routing sweeps, and grooms", () => {
    const values = [
      {
        kind: "errand", key: "fix-output", claimId, protection: "full", branch: "chore/fix-output",
        purpose: "errand", origin: "description", originEntry: null, dispatchId: null,
        state: "open", savedHead: null, changeRequest: null,
      },
      {
        kind: "errand", key: "inbox-drain", claimId, protection: "full", branch: "chore/inbox-drain",
        purpose: "housekeep-routing", routingLane: "reviewed", dispatchId: "dispatch-1",
        routingPlanDigest: digest, state: "open", savedHead: null, changeRequest: null,
      },
      {
        kind: "groom", key: "groom-alpha", claimId, purpose: null, anchorStub: "alpha",
        members: ["alpha", "beta"], openedBaseHead: "a".repeat(40), protection: "partial",
        branch: null, state: "open", savedHead: null, changeRequest: null,
      },
    ];
    for (const value of values) expect(LocusIdentityV1Schema.parse(value)).toEqual(value);
  });

  it("rejects illegal lifecycle and canonical-member combinations", () => {
    expect(LocusIdentityV1Schema.safeParse({
      kind: "groom", key: "groom-alpha", claimId, purpose: null, anchorStub: "alpha",
      members: ["beta", "alpha"], openedBaseHead: "a".repeat(40), protection: "partial",
      branch: null, state: "open", savedHead: null, changeRequest: null,
    }).success).toBe(false);
  });
});

describe("locus public value schemas", () => {
  it("keeps computed envelopes and state versionless", () => {
    const roster = { mode: "locus", ok: true, primaryPath: "/repo", rows: [], diagnostics: [] };
    const state = {
      roster,
      current: { kind: "none" },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      inFlightIdentities: [],
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    };
    expect(LocusEnvelopeV1Schema.parse(roster)).not.toHaveProperty("schemaVersion");
    expect(LocusStateV1Schema.parse(state)).not.toHaveProperty("schemaVersion");
  });

  it("distinguishes applied, refused, and operational-error mutations", () => {
    const common = { operation: "errand-open", recommendedPromptText: "Continue." };
    const values = [
      {
        ...common, outcome: "applied", allocation: { kind: "primary", checkoutPath: "/repo" },
        recordId: digest, leaseId: claimId, activeLocusPath: "/repo", sessionHomePath: "/repo",
        identity: null, originEntry: null, dispatchId: null, routingPlanDigest: null,
        restoredParent: null, nextOffer: null,
      },
      { ...common, outcome: "refused", reason: "routing-plan-mismatch" },
      { ...common, outcome: "error", error: { code: "locus.persistence.read", message: "read failed" } },
    ];
    for (const value of values) expect(LocusMutationResultV1Schema.parse(value)).toEqual(value);
  });

  it("requires both directed path coordinates on successful open results", () => {
    const openSuccess = {
      outcome: "applied",
      operation: "plan-open",
      allocation: { kind: "primary", checkoutPath: "/repo" },
      recordId: digest,
      leaseId: claimId,
      activeLocusPath: "/repo",
      sessionHomePath: "/session-home",
      identity: null,
      originEntry: null,
      dispatchId: null,
      routingPlanDigest: null,
      restoredParent: null,
      nextOffer: null,
      recommendedPromptText: "Continue.",
    };

    expect(LocusMutationResultV1Schema.safeParse({ ...openSuccess, activeLocusPath: null }).success).toBe(false);
    expect(LocusMutationResultV1Schema.safeParse({ ...openSuccess, sessionHomePath: null }).success).toBe(false);
    expect(LocusMutationResultV1Schema.safeParse(openSuccess).success).toBe(true);
  });
});
