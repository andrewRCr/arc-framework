/** Housekeeping occupancy selectors must distinguish absent from untrusted. */

import { describe, expect, it } from "vitest";

import type { HousekeepIdentityRecord } from "../../../src/lib/errand/identity-claims.js";
import { exactHousekeepRow, exactPartialHousekeepRow } from "../../../src/lib/housekeep/open-runtime.js";
import type { LocusDiagnosticV1, LocusRowV1 } from "../../../src/lib/locus/schema/index.js";
import { locusStateFixture } from "../../fixtures/locus-state.js";

const CLAIM_ID = "c".repeat(32);

function record(): HousekeepIdentityRecord {
  return {
    version: 3,
    kind: "errand",
    purpose: "housekeep-routing",
    slug: "drain-inbox",
    claimId: CLAIM_ID,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    branch: "chore/drain-inbox",
    state: "open",
    savedHead: null,
    changeRequest: null,
  } as HousekeepIdentityRecord;
}

function diagnostic(code: LocusDiagnosticV1["code"]): LocusDiagnosticV1 {
  return { code, source: { kind: "record", key: "drain-inbox" }, message: code };
}

function housekeepRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role",
    checkoutPath: "/repo/sweep",
    primary: false,
    recordId: `sha256:${"a".repeat(64)}`,
    role: {
      kind: "housekeep",
      subject: { kind: "errand", key: "drain-inbox", claimId: CLAIM_ID },
      parentCheckoutPath: null,
      originEntry: null,
    },
    identity: null,
    lease: {
      leaseId: "b".repeat(32), selfHeld: false,
      state: "live",
      sessionHomePath: "/repo/sweep",
      attachedAt: "2026-07-24T00:00:00.000Z",
      heartbeatAt: "2026-07-24T00:00:00.000Z",
    },
    frame: "active",
    derived: null,
    diagnostics: [],
    ...overrides,
  };
}

function partialRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return housekeepRow({
    role: {
      kind: "housekeep",
      subject: { kind: "housekeep", key: "drain-inbox", claimId: null },
      parentCheckoutPath: null,
      originEntry: null,
    },
    ...overrides,
  });
}

describe("exactHousekeepRow", () => {
  it("reports absent when no row carries the exact subject", () => {
    expect(exactHousekeepRow(locusStateFixture(), record())).toEqual({ kind: "absent" });
  });

  it("reports the trusted row with its narrowed coordinates", () => {
    const result = exactHousekeepRow(locusStateFixture({ rows: [housekeepRow()] }), record());

    expect(result.kind).toBe("trusted");
    if (result.kind !== "trusted") return;
    expect(result.value.checkoutPath).toBe("/repo/sweep");
    expect(result.value.role.subject.claimId).toBe(CLAIM_ID);
  });

  it.each(["cross-identity", "marker-missing", "subject-unresolved"] as const)(
    "reports untrusted rather than absent for a %s row",
    (code) => {
      const rows = [housekeepRow({ diagnostics: [diagnostic(code)] })];

      // Absent would fall through to allocation and provision over live occupancy; the reasons
      // must survive so the caller can refuse and say why.
      expect(exactHousekeepRow(locusStateFixture({ rows }), record()))
        .toEqual({ kind: "untrusted", reasons: [code] });
    },
  );

  it("reports untrusted for unverifiable lease liveness", () => {
    const rows = [housekeepRow({ diagnostics: [diagnostic("lease-unknown")] })];

    expect(exactHousekeepRow(locusStateFixture({ rows }), record()))
      .toEqual({ kind: "untrusted", reasons: ["lease-unknown"] });
  });

  it("reports untrusted rather than absent when the subject is ambiguous", () => {
    const rows = [housekeepRow(), housekeepRow({ checkoutPath: "/repo/other" })];

    expect(exactHousekeepRow(locusStateFixture({ rows }), record()))
      .toEqual({ kind: "untrusted", reasons: ["duplicate-locus"] });
  });

  it("does not match a row whose claim generation differs", () => {
    const rows = [housekeepRow({
      role: {
        kind: "housekeep",
        subject: { kind: "errand", key: "drain-inbox", claimId: "d".repeat(32) },
        parentCheckoutPath: null,
        originEntry: null,
      },
    })];

    expect(exactHousekeepRow(locusStateFixture({ rows }), record())).toEqual({ kind: "absent" });
  });

  it("still reports a dead lease as trusted so settlement can act on it", () => {
    const rows = [housekeepRow({
      lease: {
        leaseId: "b".repeat(32), selfHeld: false,
        state: "dead",
        sessionHomePath: "/repo/sweep",
        attachedAt: "2026-07-24T00:00:00.000Z",
        heartbeatAt: "2026-07-24T00:00:00.000Z",
      },
      diagnostics: [diagnostic("lease-dead")],
    })];

    expect(exactHousekeepRow(locusStateFixture({ rows }), record()).kind).toBe("trusted");
  });
});

describe("exactPartialHousekeepRow", () => {
  it("reports absent when no row carries the exact slug", () => {
    expect(exactPartialHousekeepRow(locusStateFixture(), "drain-inbox")).toEqual({ kind: "absent" });
  });

  it("reports the trusted row for a claimless partial subject", () => {
    const result = exactPartialHousekeepRow(locusStateFixture({ rows: [partialRow()] }), "drain-inbox");

    expect(result.kind).toBe("trusted");
    if (result.kind !== "trusted") return;
    expect(result.value.role.subject.claimId).toBeNull();
  });

  it("reports untrusted rather than absent for a marker-missing row", () => {
    const rows = [partialRow({ diagnostics: [diagnostic("marker-missing")] })];

    expect(exactPartialHousekeepRow(locusStateFixture({ rows }), "drain-inbox"))
      .toEqual({ kind: "untrusted", reasons: ["marker-missing"] });
  });

  it("refuses a stale record carrying an otherwise complete partial subject", () => {
    const rows = [partialRow({ kind: "stale-record" })];

    expect(exactPartialHousekeepRow(locusStateFixture({ rows }), "drain-inbox"))
      .toEqual({ kind: "untrusted", reasons: ["record-malformed"] });
  });
});
