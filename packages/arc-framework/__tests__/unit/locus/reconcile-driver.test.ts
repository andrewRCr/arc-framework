/** Proof-revalidated application of one locus reconciliation action. */

import { describe, expect, it } from "vitest";

import {
  applyLocusReconciliationAction,
  type LocusReconcileDriverIO,
} from "../../../src/lib/locus/reconcile-driver.js";
import type {
  LocusTransientAdoptionAuthority,
  LocusInternalReconcileAction,
  LocusReconciliationPlan,
} from "../../../src/lib/locus/reconciliation.js";
import type { LocusRecordReadResult } from "../../../src/lib/locus/record-store.js";
import type { LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";

const RECORD_ID = `sha256:${"1".repeat(64)}`;
const ACTION: LocusInternalReconcileAction = {
  summary: { kind: "adopt-work-unit", checkoutPath: "/wu", recordId: RECORD_ID },
  proof: { kind: "record-absent", path: "/loci/wu.json" },
  authority: { kind: "work-unit", marker: "verified", subjectKey: "demo", identityKey: null },
};

const TRANSIENT_AUTHORITY: LocusTransientAdoptionAuthority = {
  kind: "transient",
  marker: {
    bytes: Buffer.from("ready-marker"),
    subject: { kind: "errand", slug: "errand", claimId: "2".repeat(32) },
  },
  checkout: { head: "a".repeat(40), branch: "chore/errand" },
  identity: {
    kind: "errand",
    key: "errand",
    claimId: "2".repeat(32),
    protection: "full",
    branch: "chore/errand",
    purpose: "errand",
    origin: "description",
    originEntry: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  },
};

const TRANSIENT_ACTION: LocusInternalReconcileAction = {
  summary: { kind: "adopt-transient", checkoutPath: "/errand", recordId: RECORD_ID },
  proof: { kind: "record-absent", path: "/loci/errand.json" },
  authority: TRANSIENT_AUTHORITY,
};

function defaultIO(plan: LocusReconciliationPlan): LocusReconcileDriverIO {
  return {
    readPlan: async () => plan,
    acquireRecordLock: async (recordId) => ({ kind: "acquired", handle: { recordId, token: "lock" } }),
    releaseRecordLock: async () => undefined,
    readRecord: async () => ({ kind: "absent" }),
    mintRecord: async () => ({ kind: "exists" }),
    removeRecord: async () => ({ kind: "generation-mismatch" }),
    verifyWorkUnitAuthority: async () => false,
    recheckTransientAuthority: async () => ({ kind: "changed", evidence: { kind: "identity-only" } }),
    breakDeadLock: async () => ({ kind: "generation-mismatch" }),
  };
}

function planFor(action: LocusInternalReconcileAction): LocusReconciliationPlan {
  return {
    reconciliation: { kind: "apply", actions: [action.summary] },
    internalActions: [action],
  };
}

describe("locus reconciliation driver", () => {
  it("adopts only the unchanged transient authority generation under its record lock", async () => {
    let record: LocusRecordReadResult = { kind: "absent" };
    let lockHeld = false;
    const base = defaultIO(planFor(TRANSIENT_ACTION));
    const io: LocusReconcileDriverIO = {
      ...base,
      acquireRecordLock: async (recordId) => {
        lockHeld = true;
        return { kind: "acquired", handle: { recordId, token: "lock" } };
      },
      releaseRecordLock: async () => { lockHeld = false; },
      readRecord: async () => record,
      mintRecord: async (_path, value) => {
        if (!lockHeld || record.kind !== "absent") return { kind: "exists" };
        const bytes = Buffer.from(JSON.stringify(value));
        record = { kind: "valid", record: value, bytes };
        return { kind: "created", bytes };
      },
      recheckTransientAuthority: async () => lockHeld
        ? { kind: "matched", authority: TRANSIENT_AUTHORITY }
        : { kind: "changed", evidence: { kind: "identity-only" } },
    };

    expect(await applyLocusReconciliationAction({
      expected: TRANSIENT_ACTION,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io,
    })).toEqual({ kind: "applied" });
    expect(record).toMatchObject({
      kind: "valid",
      record: {
        checkoutPath: "/errand",
        role: { kind: "errand", subject: { key: "errand", claimId: "2".repeat(32) } },
      },
    });
    expect(lockHeld).toBe(false);
  });

  it("replays exact adoption and refuses changed authority or raced role generations", async () => {
    let record: LocusRecordReadResult = { kind: "absent" };
    let authority: LocusTransientAdoptionAuthority | null = TRANSIENT_AUTHORITY;
    const base = defaultIO(planFor(TRANSIENT_ACTION));
    const io: LocusReconcileDriverIO = {
      ...base,
      readRecord: async () => record,
      mintRecord: async (_path, value) => {
        if (record.kind !== "absent") return { kind: "exists" };
        const bytes = Buffer.from(JSON.stringify(value));
        record = { kind: "valid", record: value, bytes };
        return { kind: "created", bytes };
      },
      recheckTransientAuthority: async () => authority === null
        ? { kind: "changed", evidence: { kind: "identity-only" } }
        : { kind: "matched", authority },
    };
    const apply = () => applyLocusReconciliationAction({
      expected: TRANSIENT_ACTION,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io,
    });

    expect(await apply()).toEqual({ kind: "applied" });
    expect(await apply()).toEqual({ kind: "idempotent" });

    authority = { ...TRANSIENT_AUTHORITY, checkout: { ...TRANSIENT_AUTHORITY.checkout, head: "b".repeat(40) } };
    expect(await apply()).toMatchObject({
      kind: "refused",
      reason: "authority-changed",
      evidence: { kind: "marker-record-mismatch" },
    });

    authority = TRANSIENT_AUTHORITY;
    const current = await io.readRecord("/loci/errand.json", { recordId: RECORD_ID, token: "inspect" });
    if (current.kind !== "valid") throw new Error("expected adopted record");
    const raced = {
      ...current.record,
      role: {
        ...current.record.role,
        subject: { ...current.record.role.subject, claimId: "3".repeat(32) },
      },
    };
    record = { kind: "valid", record: raced, bytes: Buffer.from(JSON.stringify(raced)) };
    expect(await apply()).toMatchObject({
      kind: "refused",
      reason: "authority-changed",
      evidence: { kind: "marker-record-mismatch", recordBytes: expect.any(Buffer) },
    });
  });

  it.each([
    [{ kind: "identity-only" as const }],
    [{ kind: "pending-marker" as const, markerBytes: Buffer.from("pending") }],
    [{ kind: "marker-record-mismatch" as const, markerBytes: Buffer.from("changed"), recordBytes: null }],
  ])("preserves transient reconciliation evidence when owned-lock authority changes", async (evidence) => {
    let recordReads = 0;
    const base = defaultIO(planFor(TRANSIENT_ACTION));
    const result = await applyLocusReconciliationAction({
      expected: TRANSIENT_ACTION,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io: {
        ...base,
        readRecord: async () => { recordReads += 1; return { kind: "absent" }; },
        recheckTransientAuthority: async () => ({ kind: "changed", evidence }),
      },
    });

    expect(result).toEqual({ kind: "refused", reason: "authority-changed", evidence });
    expect(recordReads).toBe(0);
  });

  it("reruns the plan and adopts a verified WU under its directed record lock", async () => {
    let record: LocusRecordReadResult = { kind: "absent" };
    let lockHeld = false;
    let released = false;
    const plan: LocusReconciliationPlan = {
      reconciliation: { kind: "apply", actions: [ACTION.summary] },
      internalActions: [ACTION],
    };
    const io: LocusReconcileDriverIO = {
      readPlan: async () => plan,
      acquireRecordLock: async (recordId) => {
        lockHeld = true;
        return { kind: "acquired", handle: { recordId, token: "lock" } };
      },
      releaseRecordLock: async () => { lockHeld = false; released = true; },
      readRecord: async () => record,
      mintRecord: async (_path, value) => {
        if (!lockHeld || record.kind !== "absent") return { kind: "exists" };
        const bytes = Buffer.from(JSON.stringify(value));
        record = { kind: "valid", record: value, bytes };
        return { kind: "created", bytes };
      },
      removeRecord: async () => ({ kind: "generation-mismatch" }),
      verifyWorkUnitAuthority: async () => lockHeld,
      recheckTransientAuthority: async () => ({ kind: "changed", evidence: { kind: "identity-only" } }),
      breakDeadLock: async () => ({ kind: "generation-mismatch" }),
    };

    expect(await applyLocusReconciliationAction({
      expected: ACTION,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io,
    })).toEqual({ kind: "applied" });
    expect(record).toMatchObject({
      kind: "valid",
      record: {
        checkoutPath: "/wu",
        role: { kind: "work-unit", subject: { key: "demo", claimId: null } },
      },
    });
    expect({ lockHeld, released }).toEqual({ lockHeld: false, released: true });
  });

  it("reaps only unchanged stale-record bytes and treats an already-absent retry as idempotent", async () => {
    const record: LocusRecordV1 = {
      schemaVersion: 1,
      recordId: RECORD_ID,
      checkoutPath: "/gone",
      role: {
        kind: "work-unit",
        subject: { kind: "work-unit", key: "demo", claimId: null },
        establishedAt: "2026-07-20T00:00:00.000Z",
        parentCheckoutPath: null,
        originEntry: null,
      },
      lease: null,
    };
    const bytes = Buffer.from(JSON.stringify(record));
    const action: LocusInternalReconcileAction = {
      summary: { kind: "reap-stale-record", checkoutPath: "/gone", recordId: RECORD_ID },
      proof: { kind: "record-present", path: "/loci/gone.json", bytes },
      authority: null,
    };
    let current: LocusRecordReadResult = { kind: "valid", record, bytes };
    const base = defaultIO(planFor(action));
    const io: LocusReconcileDriverIO = {
      ...base,
      readRecord: async () => current,
      removeRecord: async () => { current = { kind: "absent" }; return { kind: "removed" }; },
    };

    expect(await applyLocusReconciliationAction({
      expected: action,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io,
    })).toEqual({ kind: "applied" });
    expect(await applyLocusReconciliationAction({
      expected: action,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io,
    })).toEqual({ kind: "idempotent" });

    current = { kind: "valid", record, bytes: Buffer.from("changed") };
    expect(await applyLocusReconciliationAction({
      expected: action,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io,
    })).toEqual({ kind: "refused", reason: "generation-mismatch" });
  });

  it("breaks dead locks without acquiring the main lock and refuses changed, live, or unknown holders", async () => {
    const proof = {
      kind: "lock-present" as const,
      path: "/locks/dead.lock",
      bytes: Buffer.from("holder"),
      token: "a".repeat(32),
      anchor: {
        kind: "process" as const,
        pid: 42,
        startToken: "start",
        inspector: "test",
        selector: "codex",
      },
    };
    const action: LocusInternalReconcileAction = {
      summary: { kind: "break-dead-lock", checkoutPath: null, recordId: RECORD_ID },
      proof,
      authority: null,
    };
    let mainLockAcquisitions = 0;
    let breakResult: "broken" | "generation-mismatch" | "live" | "unknown" = "broken";
    const base = defaultIO(planFor(action));
    const io: LocusReconcileDriverIO = {
      ...base,
      acquireRecordLock: async () => {
        mainLockAcquisitions += 1;
        return { kind: "refused", reason: "unknown" };
      },
      breakDeadLock: async () => ({ kind: breakResult }),
    };

    expect(await applyLocusReconciliationAction({
      expected: action,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io,
    })).toEqual({ kind: "applied" });
    for (const [value, reason] of [
      ["generation-mismatch", "generation-mismatch"],
      ["live", "lock-live"],
      ["unknown", "lock-unknown"],
    ] as const) {
      breakResult = value;
      expect(await applyLocusReconciliationAction({
        expected: action,
        establishedAt: "2026-07-20T00:00:00.000Z",
        io,
      })).toEqual({ kind: "refused", reason });
    }
    expect(mainLockAcquisitions).toBe(0);
  });

  it("refuses a changed reader proof or WU authority before mutation", async () => {
    const changed: LocusInternalReconcileAction = {
      ...ACTION,
      proof: { kind: "record-absent", path: "/loci/changed.json" },
    };
    expect(await applyLocusReconciliationAction({
      expected: ACTION,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io: defaultIO(planFor(changed)),
    })).toEqual({ kind: "refused", reason: "action-changed" });
    expect(await applyLocusReconciliationAction({
      expected: ACTION,
      establishedAt: "2026-07-20T00:00:00.000Z",
      io: defaultIO(planFor(ACTION)),
    })).toEqual({ kind: "refused", reason: "authority-changed" });
  });
});
