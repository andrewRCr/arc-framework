/** Occupancy authority over the exact Errand close finalizes. */

import { describe, expect, it } from "vitest";

import { classifyErrandCloseOccupancy } from "../../../src/lib/errand/close-occupancy.js";
import type {
  LocusIdentityV1,
  LocusRowV1,
  LocusStateV1,
} from "../../../src/lib/locus/schema/index.js";

const SLUG = "done";
const CLAIM_ID = "c".repeat(32);
const CHECKOUT = "/repo-errand";
const RECORD_ID = `sha256:${"1".repeat(64)}`;
const ERRAND_IDENTITY: Extract<LocusIdentityV1, { kind: "errand"; purpose: "errand" }> = {
  kind: "errand", key: SLUG, claimId: CLAIM_ID, protection: "full",
  branch: `chore/${SLUG}`, purpose: "errand", origin: "description", originEntry: null,
  state: "open", savedHead: null, changeRequest: null,
};

function errandRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role", checkoutPath: CHECKOUT, primary: false, recordId: RECORD_ID,
    role: {
      kind: "errand", subject: { kind: "errand", key: SLUG, claimId: CLAIM_ID },
      parentCheckoutPath: null, originEntry: "Done capture",
    },
    identity: null,
    lease: {
      leaseId: "3".repeat(32), selfHeld: false, state: "live", sessionHomePath: CHECKOUT,
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
    frame: "active", derived: null, diagnostics: [],
    ...overrides,
  };
}

function removedErrandRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return errandRow({
    kind: "stale-record",
    primary: null,
    lease: { ...errandRow().lease, selfHeld: true } as LocusRowV1["lease"],
    frame: null,
    ...overrides,
  });
}

function identityRow(identity: LocusIdentityV1 = ERRAND_IDENTITY): LocusRowV1 {
  return {
    kind: "identity-only", checkoutPath: null, primary: null, recordId: null, role: null,
    identity, lease: null, frame: "idle", derived: null, diagnostics: [],
  };
}

function freePrimaryRow(): LocusRowV1 {
  return {
    kind: "free-primary", checkoutPath: CHECKOUT, primary: true, recordId: null,
    role: null, identity: null, lease: null, frame: null, derived: null, diagnostics: [],
  };
}

function state(rows: LocusRowV1[], current: LocusStateV1["current"] = { kind: "none" }): LocusStateV1 {
  const inFlightIdentities: LocusStateV1["inFlightIdentities"] = rows.flatMap((row) =>
    row.identity === null ? [] : [{ identity: row.identity, actions: ["resume", "abandon"] }]);
  return {
    roster: { mode: "locus", ok: true, primaryPath: CHECKOUT, rows, diagnostics: [] },
    current,
    primaryAvailability: { kind: "free", checkoutPath: CHECKOUT },
    inFlightIdentities,
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
  } as LocusStateV1;
}

function classify(
  value: LocusStateV1,
  claimId: string | null = CLAIM_ID,
  baseCheckoutProof: Parameters<typeof classifyErrandCloseOccupancy>[0]["baseCheckoutProof"] = null,
): ReturnType<typeof classifyErrandCloseOccupancy> {
  return classifyErrandCloseOccupancy({ state: value, slug: SLUG, claimId, baseCheckoutProof });
}

const BASE_CHECKOUT_PROOF: NonNullable<Parameters<typeof classifyErrandCloseOccupancy>[0]["baseCheckoutProof"]> = {
  recordId: RECORD_ID,
  checkoutPath: CHECKOUT,
  identity: ERRAND_IDENTITY,
};

describe("classifyErrandCloseOccupancy", () => {
  it("clears an Errand no checkout claims", () => {
    expect(classify(state([]))).toEqual({ kind: "clear", authority: "unclaimed" });
  });

  it("retains base-checkout authority after the exact claim row is removed", () => {
    expect(classify(state([freePrimaryRow(), identityRow()]), CLAIM_ID, BASE_CHECKOUT_PROOF)).toEqual({
      kind: "clear",
      authority: "base-checkout",
    });
  });

  it("clears the caller's exact self-held occupancy so an in-place close still finalizes", () => {
    const owned = errandRow({
      lease: { ...errandRow().lease, selfHeld: true } as LocusRowV1["lease"],
    });
    const resolved = classify(state([owned], {
      kind: "resolved", activeRecordId: RECORD_ID, parentRecordId: null, sessionHomeRecordId: null,
    }));

    expect(resolved).toEqual({ kind: "clear", authority: "current-checkout" });
  });

  it("clears an exact self-held stale record after spawned checkout removal", () => {
    const removed = removedErrandRow();

    expect(classify(state([removed, identityRow()]))).toEqual({
      kind: "clear",
      authority: "removed-checkout",
    });
  });

  it("refuses stale-record replay without the exact identity or self-held lease", () => {
    const foreign = removedErrandRow({
      lease: { ...removedErrandRow().lease, selfHeld: false } as LocusRowV1["lease"],
    });

    expect(classify(state([removedErrandRow()]))).toMatchObject({
      kind: "refused",
      reason: "record-malformed",
    });
    expect(classify(state([foreign, identityRow()]))).toMatchObject({
      kind: "refused",
      reason: "record-malformed",
    });
  });

  it("refuses stale-record replay with any authority diagnostic", () => {
    const unreadable = removedErrandRow({
      diagnostics: [{
        code: "path-unavailable",
        source: { kind: "record", key: RECORD_ID },
        message: "The checkout path cannot be canonicalized.",
      }],
    });

    expect(classify(state([unreadable, identityRow()]))).toMatchObject({
      kind: "refused",
      reason: "record-malformed",
    });
  });

  it("refuses current-checkout occupancy held by another live session", () => {
    const resolved = classify(state([errandRow()], {
      kind: "resolved", activeRecordId: RECORD_ID, parentRecordId: null, sessionHomeRecordId: null,
    }));

    expect(resolved).toMatchObject({ kind: "refused", reason: "lease-live" });
  });

  it("refuses resolved current-checkout occupancy whose self-held lease is no longer live", () => {
    const dead = errandRow({
      lease: { ...errandRow().lease, selfHeld: true, state: "dead" } as LocusRowV1["lease"],
      frame: "residue",
      diagnostics: [{
        code: "lease-dead",
        source: { kind: "record", key: RECORD_ID },
        message: "Lease is dead.",
      }],
    });
    const resolved = classify(state([dead], {
      kind: "resolved", activeRecordId: RECORD_ID, parentRecordId: null, sessionHomeRecordId: null,
    }));

    expect(resolved).toMatchObject({ kind: "refused", reason: "role-conflict" });
  });

  it("refuses self-held occupancy when the resolved current record is a different generation", () => {
    const owned = errandRow({
      lease: { ...errandRow().lease, selfHeld: true } as LocusRowV1["lease"],
    });
    const resolved = classify(state([owned], {
      kind: "resolved",
      activeRecordId: `sha256:${"2".repeat(64)}`,
      parentRecordId: null,
      sessionHomeRecordId: null,
    }));

    expect(resolved).toMatchObject({ kind: "refused", reason: "lease-live" });
  });

  it("clears the exact self-held checkout after it switches back to base", () => {
    const switched = errandRow({
      primary: true,
      lease: { ...errandRow().lease, selfHeld: true } as LocusRowV1["lease"],
      frame: "residue",
      diagnostics: [{
        code: "subject-unresolved",
        source: { kind: "record", key: RECORD_ID },
        message: "The checkout branch no longer matches the Errand identity.",
      }],
    });

    const switchedState = state([switched, identityRow()]);
    expect(classify(switchedState, CLAIM_ID, BASE_CHECKOUT_PROOF)).toEqual({
      kind: "clear",
      authority: "base-checkout",
    });
    expect(classify(switchedState, CLAIM_ID, null)).toMatchObject({
      kind: "refused",
      reason: "role-conflict",
    });
    expect(classify(switchedState, CLAIM_ID, {
      ...BASE_CHECKOUT_PROOF,
      recordId: `sha256:${"2".repeat(64)}`,
    })).toMatchObject({
      kind: "refused",
      reason: "role-conflict",
    });
    expect(classify(state([switched]), CLAIM_ID, BASE_CHECKOUT_PROOF)).toMatchObject({
      kind: "refused",
      reason: "role-conflict",
    });

    const malformedMarker = {
      ...switched,
      diagnostics: [
        ...switched.diagnostics,
        {
          code: "subject-unresolved" as const,
          source: { kind: "checkout" as const, key: CHECKOUT },
          message: "The worktree marker is malformed.",
        },
      ],
    };
    expect(classify(state([malformedMarker, identityRow()]), CLAIM_ID, BASE_CHECKOUT_PROOF)).toMatchObject({
      kind: "refused",
      reason: "role-conflict",
    });
  });

  it("refuses a base checkout whose persisted path is only normalization-equivalent", () => {
    const switched = errandRow({
      checkoutPath: `${CHECKOUT}/.`,
      primary: true,
      lease: { ...errandRow().lease, selfHeld: true } as LocusRowV1["lease"],
      frame: "residue",
      diagnostics: [{
        code: "subject-unresolved",
        source: { kind: "record", key: RECORD_ID },
        message: "The checkout branch or path no longer matches the Errand identity.",
      }],
    });

    expect(classify(state([switched, identityRow()]), CLAIM_ID, BASE_CHECKOUT_PROOF)).toMatchObject({
      kind: "refused",
      reason: "role-conflict",
    });
  });

  it("refuses a live foreign session's occupancy", () => {
    expect(classify(state([errandRow()]))).toMatchObject({ kind: "refused", reason: "lease-live" });
  });

  it("refuses occupancy retained without any live session", () => {
    const dead = classify(state([errandRow({
      lease: { ...errandRow().lease, state: "dead" } as LocusRowV1["lease"],
      frame: "residue",
      diagnostics: [{ code: "lease-dead", source: { kind: "record", key: RECORD_ID }, message: "Lease is dead." }],
    })]));
    const leaseless = classify(state([errandRow({ lease: null, frame: "residue" })]));

    expect(dead).toMatchObject({ kind: "refused", reason: "role-conflict" });
    expect(leaseless).toMatchObject({ kind: "refused", reason: "role-conflict" });
  });

  it("refuses occupancy whose liveness cannot be verified", () => {
    const unknown = classify(state([errandRow({
      lease: { ...errandRow().lease, state: "unknown" } as LocusRowV1["lease"],
      diagnostics: [{ code: "lease-unknown", source: { kind: "record", key: RECORD_ID }, message: "Lease is unverifiable." }],
    })]));

    expect(unknown).toMatchObject({ kind: "refused", reason: "lease-unknown" });
  });

  it("refuses an untrusted claim rather than reading it as absence", () => {
    const untrusted = classify(state([errandRow({
      lease: { ...errandRow().lease, selfHeld: true } as LocusRowV1["lease"],
      diagnostics: [{ code: "cross-identity", source: { kind: "record", key: RECORD_ID }, message: "Another identity owns the record." }],
    })]), CLAIM_ID, BASE_CHECKOUT_PROOF);

    expect(untrusted).toMatchObject({ kind: "refused", reason: "role-conflict" });
  });

  it("refuses more than one claim on the same Errand", () => {
    const ambiguous = classify(state([
      errandRow(),
      errandRow({ checkoutPath: "/repo-other", recordId: `sha256:${"2".repeat(64)}` }),
    ]));

    expect(ambiguous).toMatchObject({ kind: "refused", reason: "duplicate-locus" });
  });

  it("does not treat another generation of the same slug as the selected claim", () => {
    const otherClaim = errandRow({
      role: {
        ...errandRow().role,
        subject: { kind: "errand", key: SLUG, claimId: "d".repeat(32) },
      } as LocusRowV1["role"],
    });

    expect(classify(state([otherClaim]))).toEqual({ kind: "clear", authority: "unclaimed" });
  });

  it("classifies a legacy null-claim row when the request carries no generation", () => {
    const legacy = errandRow({
      role: {
        ...errandRow().role,
        subject: { kind: "errand", key: SLUG, claimId: null },
      } as LocusRowV1["role"],
    });

    expect(classify(state([legacy]), null)).toMatchObject({ kind: "refused", reason: "lease-live" });
  });
});
