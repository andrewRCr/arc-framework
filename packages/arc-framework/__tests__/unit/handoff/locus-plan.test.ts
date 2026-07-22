/** Handoff action derivation from reader-owned locus state. */

import { describe, expect, it } from "vitest";

import { deriveHandoffLocusPlan } from "../../../src/lib/handoff/locus-plan.js";
import type { LocusRowV1, LocusStateV1 } from "../../../src/lib/locus/schema/index.js";

const WU = `sha256:${"a".repeat(64)}`;
const CHILD = `sha256:${"b".repeat(64)}`;
const CLAIM = "c".repeat(32);
const NOW = "2026-07-21T00:00:00.000Z";

function workUnit(frame: "active" | "suspended" = "active"): LocusRowV1 {
  return {
    kind: "managed-role",
    checkoutPath: "/repo.demo",
    primary: false,
    recordId: WU,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: "demo", claimId: null },
      parentCheckoutPath: null,
      originEntry: null,
    },
    identity: null,
    lease: {
      leaseId: "d".repeat(32),
      state: "live",
      sessionHomePath: "/repo.demo",
      attachedAt: NOW,
      heartbeatAt: NOW,
    },
    frame,
    derived: null,
    diagnostics: [],
  };
}

function transient(
  kind: "full" | "partial" | "groom" | "housekeep" = "full",
  warm = true,
): LocusRowV1 {
  const roleKind = kind === "groom" ? "groom" : kind === "housekeep" ? "housekeep" : "errand";
  const subject = kind === "partial"
    ? { kind: "partial-errand", key: "fix-one", claimId: null }
    : kind === "groom"
      ? { kind: "groom", key: "groom-demo", claimId: CLAIM }
      : kind === "housekeep"
        ? { kind: "housekeep", key: "sweep", claimId: null }
        : { kind: "errand", key: "fix-one", claimId: CLAIM };
  return {
    kind: "managed-role",
    checkoutPath: "/repo",
    primary: true,
    recordId: CHILD,
    role: {
      kind: roleKind,
      subject,
      parentCheckoutPath: warm ? "/repo.demo" : null,
      originEntry: null,
    },
    identity: kind === "full" ? {
      kind: "errand",
      key: "fix-one",
      claimId: CLAIM,
      protection: "full",
      branch: "chore/fix-one",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    } : kind === "groom" ? {
      kind: "groom",
      key: "groom-demo",
      claimId: CLAIM,
      purpose: null,
      anchorStub: "demo",
      members: ["demo"],
      openedBaseHead: "1".repeat(40),
      protection: "full",
      branch: "chore/groom-demo",
      state: "open",
      savedHead: null,
      changeRequest: null,
    } : null,
    lease: {
      leaseId: "e".repeat(32),
      state: "live",
      sessionHomePath: warm ? "/repo.demo" : "/repo",
      attachedAt: NOW,
      heartbeatAt: NOW,
    },
    frame: "active",
    derived: null,
    diagnostics: [],
  };
}

function state(rows: LocusRowV1[], activeRecordId: string, parentRecordId: string | null): LocusStateV1 {
  const sessionHomeRecordId = parentRecordId ?? activeRecordId;
  return {
    roster: { mode: "locus", ok: true, primaryPath: "/repo", rows, diagnostics: [] },
    current: { kind: "resolved", sessionHomeRecordId, activeRecordId, parentRecordId },
    primaryAvailability: { kind: "occupied", checkoutPath: "/repo", recordId: activeRecordId, leaseState: "live" },
    inFlightIdentities: [],
    recovery: { kind: "resume", activeRecordId, parentRecordId },
    reconciliation: { kind: "clean" },
  };
}

describe("deriveHandoffLocusPlan", () => {
  it("selects the current checkout's leaseless WU and requires no release", () => {
    const idle = { ...workUnit("active"), lease: null, frame: "idle" as const };
    const idleState: LocusStateV1 = {
      roster: { mode: "locus", ok: true, primaryPath: "/repo", rows: [idle], diagnostics: [] },
      current: { kind: "none" },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      inFlightIdentities: [],
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    };

    expect(deriveHandoffLocusPlan(idleState, "/repo.demo")).toEqual({
      kind: "release-work-unit",
      recordId: WU,
      leaseId: null,
      checkoutPath: "/repo.demo",
    });
  });

  it("directs WU-only and restored-parent handoff to the exact lease generation", () => {
    const direct = deriveHandoffLocusPlan(state([workUnit()], WU, null), "/repo.demo");
    const restored = deriveHandoffLocusPlan(state([workUnit()], WU, null), "/repo.demo");

    expect(direct).toEqual({
      kind: "release-work-unit",
      recordId: WU,
      leaseId: "d".repeat(32),
      checkoutPath: "/repo.demo",
    });
    expect(restored).toEqual(direct);
  });

  it.each([["warm", true], ["cold", false]] as const)(
    "directs a %s ordinary Errand through its subject leave driver",
    (_label, warm) => {
    const child = transient("full", warm);
    const rows = warm ? [workUnit("suspended"), child] : [child];
    const result = deriveHandoffLocusPlan(state(rows, CHILD, warm ? WU : null), "/repo");

    expect(result).toMatchObject({
      kind: "leave-errand",
      slug: "fix-one",
      claimId: CLAIM,
      recordId: CHILD,
      leaseId: "e".repeat(32),
      parentRecordId: warm ? WU : null,
      parentCheckoutPath: warm ? "/repo.demo" : null,
    });
    },
  );

  it("leaves a warm Errand whose WU parent has no lease", () => {
    const parent = { ...workUnit("suspended"), lease: null };
    const result = deriveHandoffLocusPlan(state([parent, transient("full")], CHILD, WU), "/repo");

    expect(result).toMatchObject({
      kind: "leave-errand",
      recordId: CHILD,
      parentRecordId: WU,
      parentCheckoutPath: "/repo.demo",
    });
  });

  it.each([
    ["partial", "partial-handoff-forbidden"],
    ["groom", "groom-incomplete"],
    ["housekeep", "housekeep-incomplete"],
  ] as const)("refuses an incomplete %s transient", (kind, reason) => {
    expect(deriveHandoffLocusPlan(state([workUnit("suspended"), transient(kind)], CHILD, WU), "/repo"))
      .toMatchObject({ kind: "refused", reason, recordId: CHILD });
  });

  it("treats a record-free or identity-only tail as between work units", () => {
    const empty: LocusStateV1 = {
      roster: { mode: "locus", ok: true, primaryPath: "/repo", rows: [], diagnostics: [] },
      current: { kind: "none" },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      inFlightIdentities: [],
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    };

    expect(deriveHandoffLocusPlan(empty, "/repo")).toEqual({ kind: "between-work-units" });
  });

  it("refuses changed, missing, or duplicate selected generations", () => {
    const exact = state([workUnit()], WU, null);
    const changed = {
      ...exact,
      recovery: { kind: "resume" as const, activeRecordId: CHILD, parentRecordId: null },
    };
    expect(deriveHandoffLocusPlan(changed, "/repo.demo"))
      .toMatchObject({ kind: "refused", reason: "locus-unresolved" });
    expect(deriveHandoffLocusPlan(state([], WU, null), "/repo.demo"))
      .toMatchObject({ kind: "refused", reason: "locus-unresolved" });
    expect(deriveHandoffLocusPlan(state([workUnit(), workUnit()], WU, null), "/repo.demo"))
      .toMatchObject({ kind: "refused", reason: "locus-unresolved" });
  });
});
