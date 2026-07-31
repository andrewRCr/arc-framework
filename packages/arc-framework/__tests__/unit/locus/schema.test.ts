/** Runtime-contract coverage for the locus schema family. */

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  LocusEnvelopeV1Schema,
  LocusIdentityV1Schema,
  LocusMutationResultV1Schema,
  LocusRecordV1Schema,
  LocusStateV1Schema,
  LocusTimestampSchema,
  type LocusEnvelopeV1,
  type LocusStateV1,
} from "../../../src/lib/locus/schema/index.js";

const timestamp = "2026-07-18T00:00:00.000Z";
const claimId = "0123456789abcdef0123456789abcdef";
const digest = `sha256:${"a".repeat(64)}`;

function record(role: unknown = {
  kind: "work-unit",
  subject: { kind: "work-unit", key: "session-locus-model", claimId: null },
  establishedAt: timestamp,
  parentCheckoutPath: null,
  originEntry: null,
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
      originEntry: null,
    });
    expect(LocusRecordV1Schema.parse(value)).toEqual(value);
  });

  it("enforces claim generations for known identity-backed role pairs", () => {
    const errand = {
      kind: "errand",
      subject: { kind: "errand", key: "fix-output", claimId },
      establishedAt: timestamp,
      parentCheckoutPath: "/repo-worktree",
      originEntry: null,
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

  it("limits capture bindings to partial errands and pending promotion settlement", () => {
    const partial = {
      kind: "errand",
      subject: { kind: "partial-errand", key: "fix-output", claimId: null },
      establishedAt: timestamp,
      parentCheckoutPath: null,
      originEntry: "Fix output",
      originEntrySourceDigest: `sha256:${"b".repeat(64)}`,
    };
    expect(LocusRecordV1Schema.safeParse(record(partial)).success).toBe(true);
    expect(LocusRecordV1Schema.safeParse(record({
      ...partial,
      originEntry: null,
      originEntrySourceDigest: undefined,
    })).success).toBe(true);
    expect(LocusRecordV1Schema.safeParse(record({
      ...partial,
      originEntrySourceDigest: undefined,
    })).success).toBe(false);
    expect(LocusRecordV1Schema.safeParse(record({
      ...partial,
      originEntry: null,
    })).success).toBe(false);
    expect(LocusRecordV1Schema.safeParse(record({
      ...partial,
      subject: { kind: "errand", key: "fix-output", claimId },
    })).success).toBe(false);
    const promoted = {
      ...partial,
      kind: "work-unit",
      subject: { kind: "work-unit", key: "fix-output", claimId: null },
    };
    expect(LocusRecordV1Schema.safeParse(record(promoted)).success).toBe(true);
    expect(LocusRecordV1Schema.safeParse(record({
      ...promoted,
      originEntrySourceDigest: undefined,
    })).success).toBe(false);
    expect(LocusRecordV1Schema.safeParse(record({
      ...promoted,
      originEntry: null,
    })).success).toBe(false);
    expect(LocusRecordV1Schema.safeParse(record({ ...partial, dispatchId: "legacy" })).success).toBe(false);
    expect(LocusRecordV1Schema.safeParse({ ...(record() as object), extra: true }).success).toBe(false);
  });
});

describe("locus identity schema", () => {
  it("round-trips ordinary errands, routing sweeps, and grooms", () => {
    const values = [
      {
        kind: "errand", key: "fix-output", claimId, protection: "full", branch: "chore/fix-output",
        purpose: "errand", origin: "description", originEntry: null,
        state: "open", savedHead: null, changeRequest: null,
      },
      {
        kind: "errand", key: "inbox-drain", claimId, protection: "full", branch: "chore/inbox-drain",
        purpose: "housekeep-routing", state: "open", savedHead: null, changeRequest: null,
      },
      {
        kind: "groom", key: "groom-alpha", claimId, purpose: null, anchorStub: "alpha",
        members: ["alpha", "beta"], openedBaseHead: "a".repeat(40), protection: "partial",
        branch: null, state: "open", savedHead: null, changeRequest: null,
      },
    ];
    for (const value of values) expect(LocusIdentityV1Schema.parse(value)).toEqual(value);
    expect(LocusIdentityV1Schema.safeParse({ ...values[1], dispatchId: "legacy" }).success).toBe(false);
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
    expectTypeOf<LocusStateV1["roster"]>()
      .toEqualTypeOf<Extract<LocusEnvelopeV1, { ok: true }>>();
  });

  it("distinguishes applied, refused, and operational-error mutations", () => {
    const common = { operation: "errand-open", recommendedPromptText: "Continue." };
    const values = [
      {
        ...common, outcome: "applied", allocation: { kind: "primary", checkoutPath: "/repo" },
        recordId: digest, leaseId: claimId, activeLocusPath: "/repo", sessionHomePath: "/repo",
        identity: null, originEntry: null,
        restoredParent: null, nextOffer: null,
      },
      { ...common, outcome: "refused", reason: "identity-conflict" },
      { ...common, outcome: "error", error: { code: "locus.persistence.read", message: "read failed" } },
    ];
    for (const value of values) expect(LocusMutationResultV1Schema.parse(value)).toEqual(value);
  });

  it("requires every authority coordinate on successful open results", () => {
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
      restoredParent: null,
      nextOffer: null,
      recommendedPromptText: "Continue.",
    };

    const coordinates = [
      "allocation",
      "recordId",
      "leaseId",
      "activeLocusPath",
      "sessionHomePath",
    ] as const;
    for (const operation of ["errand-open", "plan-open", "housekeep-open"] as const) {
      for (const outcome of ["applied", "idempotent"] as const) {
        const result = { ...openSuccess, operation, outcome };
        for (const coordinate of coordinates) {
          expect(LocusMutationResultV1Schema.safeParse({ ...result, [coordinate]: null }).success).toBe(false);
        }
        expect(LocusMutationResultV1Schema.safeParse(result).success).toBe(true);
      }
    }
    expect(LocusMutationResultV1Schema.safeParse({ ...openSuccess, dispatchId: "legacy" }).success).toBe(false);
  });
});

describe("locus timestamp schema", () => {
  it("accepts canonical UTC and rejects an equivalent non-Z offset", () => {
    expect(LocusTimestampSchema.safeParse(timestamp).success).toBe(true);
    expect(LocusTimestampSchema.safeParse("2026-07-17T19:00:00.000-05:00").success).toBe(false);
  });
});
