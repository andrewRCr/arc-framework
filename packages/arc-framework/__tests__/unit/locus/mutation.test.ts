/** Authority-derived locus role minting through a faithful record-store seam. */

import { describe, expect, it } from "vitest";

import {
  attachLocusLease,
  mintDurableLocusRole,
  refreshLocusLeaseHeartbeat,
  type LocusLeaseMutationIO,
  type LocusRoleAuthority,
  type LocusRoleMintIO,
} from "../../../src/lib/locus/mutation.js";
import type { LocusRecordReadResult } from "../../../src/lib/locus/record-store.js";
import type { LocusIdentityV1, LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";

function memoryIO(initial: LocusRecordReadResult = { kind: "absent" }): {
  io: LocusRoleMintIO & LocusLeaseMutationIO;
  current(): LocusRecordReadResult;
} {
  let value = initial;
  return {
    io: {
      read: async () => value,
      mint: async (record) => {
        if (value.kind !== "absent") return { kind: "exists" };
        const bytes = Buffer.from(JSON.stringify(record));
        value = { kind: "valid", record, bytes };
        return { kind: "created", bytes };
      },
      replace: async (expectedBytes, record) => {
        if (value.kind !== "valid" || !value.bytes.equals(expectedBytes)) {
          return { kind: "generation-mismatch" };
        }
        const bytes = Buffer.from(JSON.stringify(record));
        value = { kind: "valid", record, bytes };
        return { kind: "replaced", bytes };
      },
    },
    current: () => value,
  };
}

const BASE = {
  recordId: `sha256:${"1".repeat(64)}`,
  checkoutPath: "/repo-wt",
  parentCheckoutPath: null,
  establishedAt: "2026-07-20T00:00:00.000Z",
} as const;

function errandIdentity(purpose: "errand" | "housekeep-routing"): LocusIdentityV1 {
  const common = {
    kind: "errand" as const,
    key: purpose === "errand" ? "demo" : "inbox-drain",
    claimId: purpose === "errand" ? "2".repeat(32) : "3".repeat(32),
    protection: "full" as const,
    branch: purpose === "errand" ? "chore/demo" : "chore/inbox-drain",
    state: "open" as const,
    savedHead: null,
    changeRequest: null,
  };
  return purpose === "errand"
    ? { ...common, purpose, origin: "description", originEntry: null, dispatchId: null }
    : {
        ...common,
        purpose,
        routingLane: "auto",
        dispatchId: "dispatch-1",
        routingPlanDigest: `sha256:${"4".repeat(64)}`,
      };
}

function groomIdentity(): LocusIdentityV1 {
  return {
    kind: "groom",
    key: "groom-demo",
    claimId: "5".repeat(32),
    purpose: null,
    anchorStub: "demo",
    members: ["demo"],
    openedBaseHead: "a".repeat(40),
    protection: "partial",
    branch: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  };
}

describe("durable locus role minting", () => {
  it("mints a work-unit role only from work-unit authority", async () => {
    const store = memoryIO();
    const result = await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "work-unit", key: "demo" },
      io: store.io,
    });

    expect(result).toMatchObject({ kind: "applied" });
    expect(store.current()).toMatchObject({
      kind: "valid",
      record: {
        recordId: BASE.recordId,
        checkoutPath: BASE.checkoutPath,
        role: {
          kind: "work-unit",
          subject: { kind: "work-unit", key: "demo", claimId: null },
          establishedAt: BASE.establishedAt,
          parentCheckoutPath: null,
          dispatchId: null,
          originEntry: null,
          routingPlanDigest: null,
        },
        lease: null,
      } satisfies Partial<LocusRecordV1>,
    });
  });

  it("derives full and partial transient role pairs with exact claim and context fields", async () => {
    const cases: Array<{
      authority: LocusRoleAuthority;
      expected: Pick<NonNullable<LocusRecordV1["role"]>, "kind" | "subject" | "dispatchId" | "originEntry" | "routingPlanDigest">;
    }> = [
      {
        authority: { kind: "identity", identity: errandIdentity("errand") },
        expected: {
          kind: "errand",
          subject: { kind: "errand", key: "demo", claimId: "2".repeat(32) },
          dispatchId: null,
          originEntry: null,
          routingPlanDigest: null,
        },
      },
      {
        authority: { kind: "identity", identity: groomIdentity() },
        expected: {
          kind: "groom",
          subject: { kind: "groom", key: "groom-demo", claimId: "5".repeat(32) },
          dispatchId: null,
          originEntry: null,
          routingPlanDigest: null,
        },
      },
      {
        authority: { kind: "identity", identity: errandIdentity("housekeep-routing") },
        expected: {
          kind: "housekeep",
          subject: { kind: "errand", key: "inbox-drain", claimId: "3".repeat(32) },
          dispatchId: null,
          originEntry: null,
          routingPlanDigest: null,
        },
      },
      {
        authority: {
          kind: "partial-errand",
          key: "demo",
          originEntry: null,
          dispatchId: null,
          routingPlanDigest: null,
        },
        expected: {
          kind: "errand",
          subject: { kind: "partial-errand", key: "demo", claimId: null },
          dispatchId: null,
          originEntry: null,
          routingPlanDigest: null,
        },
      },
      {
        authority: {
          kind: "partial-errand",
          key: "demo",
          originEntry: "Inbox entry",
          dispatchId: null,
          routingPlanDigest: null,
        },
        expected: {
          kind: "errand",
          subject: { kind: "partial-errand", key: "demo", claimId: null },
          dispatchId: null,
          originEntry: "Inbox entry",
          routingPlanDigest: null,
        },
      },
      {
        authority: {
          kind: "partial-errand",
          key: "demo",
          originEntry: "Inbox entry",
          dispatchId: "dispatch-2",
          routingPlanDigest: null,
        },
        expected: {
          kind: "errand",
          subject: { kind: "partial-errand", key: "demo", claimId: null },
          dispatchId: "dispatch-2",
          originEntry: "Inbox entry",
          routingPlanDigest: null,
        },
      },
      {
        authority: {
          kind: "partial-housekeep",
          key: "inbox-drain",
          originEntry: null,
          dispatchId: "dispatch-3",
          routingPlanDigest: `sha256:${"6".repeat(64)}`,
        },
        expected: {
          kind: "housekeep",
          subject: { kind: "housekeep", key: "inbox-drain", claimId: null },
          dispatchId: "dispatch-3",
          originEntry: null,
          routingPlanDigest: `sha256:${"6".repeat(64)}`,
        },
      },
    ];

    for (const [index, value] of cases.entries()) {
      const store = memoryIO();
      const result = await mintDurableLocusRole({
        ...BASE,
        recordId: `sha256:${String(index + 2).repeat(64)}`,
        authority: value.authority,
        io: store.io,
      });
      expect(result).toMatchObject({ kind: "applied", record: { role: value.expected } });
    }
  });

  it("treats only the exact role generation as an idempotent replay", async () => {
    const store = memoryIO();
    const identity = errandIdentity("errand");
    const first = await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "identity", identity },
      io: store.io,
    });
    expect(first).toMatchObject({ kind: "applied" });
    expect(await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "identity", identity },
      io: store.io,
    })).toMatchObject({ kind: "idempotent" });
    expect(await mintDurableLocusRole({
      ...BASE,
      authority: {
        kind: "identity",
        identity: { ...identity, claimId: "9".repeat(32) },
      },
      io: store.io,
    })).toEqual({ kind: "refused", reason: "role-conflict" });
  });

  it("refuses every illegal partial dispatch, origin, and plan combination", async () => {
    const invalid = [
      {
        kind: "partial-errand",
        key: "demo",
        originEntry: null,
        dispatchId: "dispatch",
        routingPlanDigest: null,
      },
      {
        kind: "partial-errand",
        key: "demo",
        originEntry: "Inbox entry",
        dispatchId: null,
        routingPlanDigest: `sha256:${"a".repeat(64)}`,
      },
      {
        kind: "partial-housekeep",
        key: "inbox-drain",
        originEntry: "Inbox entry",
        dispatchId: "dispatch",
        routingPlanDigest: `sha256:${"a".repeat(64)}`,
      },
      {
        kind: "partial-housekeep",
        key: "inbox-drain",
        originEntry: null,
        dispatchId: null,
        routingPlanDigest: `sha256:${"a".repeat(64)}`,
      },
      {
        kind: "partial-housekeep",
        key: "inbox-drain",
        originEntry: null,
        dispatchId: "dispatch",
        routingPlanDigest: null,
      },
    ] as unknown as LocusRoleAuthority[];

    for (const authority of invalid) {
      expect(await mintDurableLocusRole({
        ...BASE,
        authority,
        io: memoryIO().io,
      })).toEqual({ kind: "refused", reason: "role-conflict" });
    }
  });

  it("attaches a minted lease to an unleased role and replays its exact token and anchor", async () => {
    const store = memoryIO();
    await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "work-unit", key: "demo" },
      io: store.io,
    });
    const anchor = {
      kind: "process" as const,
      pid: 42,
      startToken: "start",
      inspector: "test",
      selector: "codex",
    };
    const request = {
      recordId: BASE.recordId,
      sessionHomePath: "/repo-wt",
      anchor,
      leaseId: "a".repeat(32),
      attachedAt: "2026-07-20T01:00:00.000Z",
      heartbeatAt: "2026-07-20T01:00:00.000Z",
      observedLiveness: null,
      io: store.io,
    } as const;

    expect(await attachLocusLease(request)).toMatchObject({
      kind: "applied",
      record: { lease: { leaseId: "a".repeat(32), anchor } },
    });
    expect(await attachLocusLease({ ...request, observedLiveness: "live" })).toMatchObject({
      kind: "idempotent",
      record: { lease: { leaseId: "a".repeat(32), anchor } },
    });
  });

  it("mints at least 128 bits of lease-token entropy by default", async () => {
    const store = memoryIO();
    await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "work-unit", key: "demo" },
      io: store.io,
    });
    const result = await attachLocusLease({
      recordId: BASE.recordId,
      sessionHomePath: BASE.checkoutPath,
      anchor: {
        kind: "process",
        pid: 42,
        startToken: "start",
        inspector: "test",
        selector: "codex",
      },
      attachedAt: "2026-07-20T01:00:00.000Z",
      heartbeatAt: "2026-07-20T01:00:00.000Z",
      observedLiveness: null,
      io: store.io,
    });
    expect(result.kind === "applied" ? result.record.lease?.leaseId : null)
      .toMatch(/^[0-9a-f]{32,}$/u);
  });

  it("replaces only a dead WU lease and refuses live, unknown, or dead transient occupancy", async () => {
    const anchor = {
      kind: "process" as const,
      pid: 42,
      startToken: "start",
      inspector: "test",
      selector: "codex",
    };
    const seeded = async (authority: LocusRoleAuthority) => {
      const store = memoryIO();
      await mintDurableLocusRole({ ...BASE, authority, io: store.io });
      await attachLocusLease({
        recordId: BASE.recordId,
        sessionHomePath: BASE.checkoutPath,
        anchor,
        leaseId: "a".repeat(32),
        attachedAt: "2026-07-20T01:00:00.000Z",
        heartbeatAt: "2026-07-20T01:00:00.000Z",
        observedLiveness: null,
        io: store.io,
      });
      return store;
    };
    const request = {
      recordId: BASE.recordId,
      sessionHomePath: BASE.checkoutPath,
      anchor: { ...anchor, pid: 43 },
      leaseId: "b".repeat(32),
      attachedAt: "2026-07-20T02:00:00.000Z",
      heartbeatAt: "2026-07-20T02:00:00.000Z",
    } as const;

    const deadWorkUnit = await seeded({ kind: "work-unit", key: "demo" });
    expect(await attachLocusLease({ ...request, observedLiveness: "dead", io: deadWorkUnit.io }))
      .toMatchObject({ kind: "applied", record: { lease: { leaseId: "b".repeat(32) } } });
    for (const liveness of ["live", "unknown"] as const) {
      const occupied = await seeded({ kind: "work-unit", key: "demo" });
      expect(await attachLocusLease({ ...request, observedLiveness: liveness, io: occupied.io }))
        .toEqual({ kind: "refused", reason: liveness === "live" ? "lease-live" : "lease-unknown" });
    }
    const deadTransient = await seeded({ kind: "identity", identity: errandIdentity("errand") });
    expect(await attachLocusLease({ ...request, observedLiveness: "dead", io: deadTransient.io }))
      .toEqual({ kind: "refused", reason: "role-conflict" });
  });

  it("refreshes only state-touching calls with the exact lease token and anchor", async () => {
    const store = memoryIO();
    await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "work-unit", key: "demo" },
      io: store.io,
    });
    const anchor = {
      kind: "process" as const,
      pid: 42,
      startToken: "start",
      inspector: "test",
      selector: "codex",
    };
    await attachLocusLease({
      recordId: BASE.recordId,
      sessionHomePath: BASE.checkoutPath,
      anchor,
      leaseId: "a".repeat(32),
      attachedAt: "2026-07-20T01:00:00.000Z",
      heartbeatAt: "2026-07-20T01:00:00.000Z",
      observedLiveness: null,
      io: store.io,
    });
    const request = {
      recordId: BASE.recordId,
      leaseId: "a".repeat(32),
      anchor,
      heartbeatAt: "2026-07-20T02:00:00.000Z",
      io: store.io,
    } as const;

    expect(await refreshLocusLeaseHeartbeat({ ...request, stateTouching: false }))
      .toMatchObject({ kind: "idempotent", record: { lease: { heartbeatAt: "2026-07-20T01:00:00.000Z" } } });
    expect(await refreshLocusLeaseHeartbeat({ ...request, stateTouching: true }))
      .toMatchObject({ kind: "applied", record: { lease: { heartbeatAt: "2026-07-20T02:00:00.000Z" } } });
    expect(await refreshLocusLeaseHeartbeat({
      ...request,
      stateTouching: true,
      anchor: { ...anchor, pid: 99 },
    })).toEqual({ kind: "refused", reason: "lease-generation-mismatch" });
  });
});
