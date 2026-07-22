/** Authority-derived locus role minting through a faithful record-store seam. */

import { describe, expect, it } from "vitest";

import {
  attachLocusLease,
  createLocusMutationResult,
  mintDurableLocusRole,
  popOwnedLocusRole,
  popLocusRole,
  refreshLocusLeaseHeartbeat,
  releaseLocusLease,
  resumeDeadTransientLease,
  updateLocusRole,
  type LocusLeaseMutationIO,
  type LocusRolePopIO,
  type LocusRoleAuthority,
  type LocusRoleMintIO,
} from "../../../src/lib/locus/mutation.js";
import type { LocusRecordReadResult } from "../../../src/lib/locus/record-store.js";
import type { LocusIdentityV1, LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";

function memoryIO(initial: LocusRecordReadResult = { kind: "absent" }): {
  io: LocusRoleMintIO & LocusLeaseMutationIO & LocusRolePopIO;
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
      remove: async (expectedBytes) => {
        if (value.kind !== "valid" || !value.bytes.equals(expectedBytes)) {
          return { kind: "generation-mismatch" };
        }
        value = { kind: "absent" };
        return { kind: "removed" };
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
    ? { ...common, purpose, origin: "description", originEntry: null }
    : {
        ...common,
        purpose,
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
          originEntry: null,
        },
        lease: null,
      } satisfies Partial<LocusRecordV1>,
    });
  });

  it("derives full and partial transient role pairs with exact claim and context fields", async () => {
    const cases: Array<{
      authority: LocusRoleAuthority;
      expected: Pick<NonNullable<LocusRecordV1["role"]>, "kind" | "subject" | "originEntry">;
    }> = [
      {
        authority: { kind: "identity", identity: errandIdentity("errand") },
        expected: {
          kind: "errand",
          subject: { kind: "errand", key: "demo", claimId: "2".repeat(32) },
          originEntry: null,
        },
      },
      {
        authority: { kind: "identity", identity: groomIdentity() },
        expected: {
          kind: "groom",
          subject: { kind: "groom", key: "groom-demo", claimId: "5".repeat(32) },
          originEntry: null,
        },
      },
      {
        authority: { kind: "identity", identity: errandIdentity("housekeep-routing") },
        expected: {
          kind: "housekeep",
          subject: { kind: "errand", key: "inbox-drain", claimId: "3".repeat(32) },
          originEntry: null,
        },
      },
      {
        authority: {
          kind: "partial-errand",
          key: "demo",
          originEntry: null,
        },
        expected: {
          kind: "errand",
          subject: { kind: "partial-errand", key: "demo", claimId: null },
          originEntry: null,
        },
      },
      {
        authority: {
          kind: "partial-errand",
          key: "demo",
          originEntry: "Inbox entry",
        },
        expected: {
          kind: "errand",
          subject: { kind: "partial-errand", key: "demo", claimId: null },
          originEntry: "Inbox entry",
        },
      },
      {
        authority: {
          kind: "partial-housekeep",
          key: "inbox-drain",
        },
        expected: {
          kind: "housekeep",
          subject: { kind: "housekeep", key: "inbox-drain", claimId: null },
          originEntry: null,
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

  it("releases only the requested lease generation and replays an already-cleared release", async () => {
    const seeded = async () => {
      const store = memoryIO();
      await mintDurableLocusRole({
        ...BASE,
        authority: { kind: "work-unit", key: "demo" },
        io: store.io,
      });
      await attachLocusLease({
        recordId: BASE.recordId,
        sessionHomePath: BASE.checkoutPath,
        anchor: {
          kind: "process",
          pid: 42,
          startToken: "start",
          inspector: "test",
          selector: "codex",
        },
        leaseId: "a".repeat(32),
        attachedAt: "2026-07-20T01:00:00.000Z",
        heartbeatAt: "2026-07-20T01:00:00.000Z",
        observedLiveness: null,
        io: store.io,
      });
      return store;
    };
    const mismatch = await seeded();
    expect(await releaseLocusLease({
      recordId: BASE.recordId,
      leaseId: "b".repeat(32),
      io: mismatch.io,
    })).toEqual({ kind: "refused", reason: "lease-generation-mismatch" });
    expect(mismatch.current()).toMatchObject({ record: { lease: { leaseId: "a".repeat(32) } } });

    const exact = await seeded();
    expect(await releaseLocusLease({
      recordId: BASE.recordId,
      leaseId: "a".repeat(32),
      io: exact.io,
    })).toMatchObject({ kind: "applied", record: { lease: null } });
    expect(await releaseLocusLease({
      recordId: BASE.recordId,
      leaseId: "a".repeat(32),
      io: exact.io,
    })).toMatchObject({ kind: "idempotent", record: { lease: null } });
  });

  it("replaces only the exact dead transient lease generation", async () => {
    const store = memoryIO();
    await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "identity", identity: errandIdentity("errand") },
      io: store.io,
    });
    const originalAnchor = {
      kind: "process" as const,
      pid: 42,
      startToken: "old",
      inspector: "test",
      selector: "codex",
    };
    await attachLocusLease({
      recordId: BASE.recordId,
      sessionHomePath: BASE.checkoutPath,
      anchor: originalAnchor,
      leaseId: "a".repeat(32),
      attachedAt: "2026-07-20T01:00:00.000Z",
      heartbeatAt: "2026-07-20T01:00:00.000Z",
      observedLiveness: null,
      io: store.io,
    });
    const request = {
      recordId: BASE.recordId,
      expectedLeaseId: "a".repeat(32),
      sessionHomePath: BASE.checkoutPath,
      anchor: { ...originalAnchor, pid: 43, startToken: "new" },
      leaseId: "b".repeat(32),
      attachedAt: "2026-07-20T02:00:00.000Z",
      heartbeatAt: "2026-07-20T02:00:00.000Z",
      observedLiveness: "dead" as const,
      io: store.io,
    };

    expect(await resumeDeadTransientLease(request)).toMatchObject({
      kind: "applied",
      record: { lease: { leaseId: "b".repeat(32), anchor: request.anchor } },
    });
    expect(await resumeDeadTransientLease(request))
      .toEqual({ kind: "refused", reason: "lease-generation-mismatch" });
    expect(await resumeDeadTransientLease({
      ...request,
      expectedLeaseId: "b".repeat(32),
      observedLiveness: "live",
    })).toEqual({ kind: "refused", reason: "lease-live" });
  });

  it("updates a directed role and parent only from the exact prior role generation", async () => {
    const store = memoryIO();
    const identity = errandIdentity("errand");
    await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "identity", identity },
      io: store.io,
    });
    const initial = store.current();
    if (initial.kind !== "valid") throw new Error("expected seeded record");
    const request = {
      recordId: BASE.recordId,
      checkoutPath: BASE.checkoutPath,
      expectedRole: initial.record.role,
      authority: { kind: "identity" as const, identity },
      parentCheckoutPath: "/parent",
      establishedAt: BASE.establishedAt,
      io: store.io,
    };

    expect(await updateLocusRole(request)).toMatchObject({
      kind: "applied",
      record: { checkoutPath: BASE.checkoutPath, role: { parentCheckoutPath: "/parent" } },
    });
    expect(await updateLocusRole(request)).toMatchObject({
      kind: "idempotent",
      record: { role: { parentCheckoutPath: "/parent" } },
    });
    expect(await updateLocusRole({
      ...request,
      expectedRole: { ...initial.record.role, subject: { ...initial.record.role.subject, key: "other" } },
      parentCheckoutPath: "/new-parent",
    })).toEqual({ kind: "refused", reason: "role-conflict" });
  });

  it("rebases a live lease session home atomically with a directed role transition", async () => {
    const store = memoryIO();
    const identity = errandIdentity("errand");
    await mintDurableLocusRole({
      ...BASE,
      parentCheckoutPath: "/parent-wu",
      authority: { kind: "identity", identity },
      io: store.io,
    });
    await attachLocusLease({
      recordId: BASE.recordId,
      sessionHomePath: "/parent-wu",
      anchor: { kind: "process", pid: 101, startToken: "start", inspector: "test", selector: "codex" },
      leaseId: "a".repeat(32),
      attachedAt: BASE.establishedAt,
      heartbeatAt: BASE.establishedAt,
      observedLiveness: null,
      io: store.io,
    });
    const current = store.current();
    if (current.kind !== "valid") throw new Error("expected seeded record");

    expect(await updateLocusRole({
      recordId: BASE.recordId,
      checkoutPath: BASE.checkoutPath,
      expectedRole: current.record.role,
      authority: { kind: "work-unit", key: "promoted" },
      parentCheckoutPath: null,
      sessionHomePath: BASE.checkoutPath,
      establishedAt: BASE.establishedAt,
      io: store.io,
    })).toMatchObject({
      kind: "applied",
      record: {
        role: { kind: "work-unit", parentCheckoutPath: null },
        lease: { leaseId: "a".repeat(32), sessionHomePath: BASE.checkoutPath },
      },
    });
  });

  it("pops the exact unleased role generation and replays an already-absent pop", async () => {
    const store = memoryIO();
    await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "work-unit", key: "demo" },
      io: store.io,
    });
    const current = store.current();
    if (current.kind !== "valid") throw new Error("expected seeded record");
    const request = {
      operation: "locus-resolve" as const,
      recommendedPromptText: "Role removed.",
      recordId: BASE.recordId,
      checkoutPath: BASE.checkoutPath,
      expectedRole: current.record.role,
      expectedLeaseId: null,
      observedLiveness: null,
      duplicate: false,
      io: store.io,
    };

    expect(await popLocusRole(request)).toMatchObject({
      outcome: "applied",
      operation: "locus-resolve",
      recordId: BASE.recordId,
      allocation: null,
      identity: null,
      nextOffer: null,
    });
    expect(store.current()).toEqual({ kind: "absent" });
    expect(await popLocusRole(request)).toMatchObject({
      outcome: "idempotent",
      recordId: BASE.recordId,
    });
  });

  it("pops a live transient role only for its exact entering lease anchor", async () => {
    const store = memoryIO();
    await mintDurableLocusRole({
      ...BASE,
      authority: { kind: "identity", identity: errandIdentity("errand") },
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

    expect(await popOwnedLocusRole({
      operation: "errand-leave",
      recommendedPromptText: "Errand occupancy removed.",
      recordId: BASE.recordId,
      checkoutPath: BASE.checkoutPath,
      expectedSubject: { kind: "errand", key: "demo", claimId: "2".repeat(32) },
      expectedLeaseId: "a".repeat(32),
      enteringAnchor: anchor,
      io: store.io,
    })).toMatchObject({ outcome: "applied", recordId: BASE.recordId });
    expect(store.current()).toEqual({ kind: "absent" });
  });

  it("refuses duplicate, newer role/lease, and live or unknown pop targets", async () => {
    const seeded = async () => {
      const store = memoryIO();
      await mintDurableLocusRole({
        ...BASE,
        authority: { kind: "work-unit", key: "demo" },
        io: store.io,
      });
      const beforeLease = store.current();
      if (beforeLease.kind !== "valid") throw new Error("expected seeded role");
      await attachLocusLease({
        recordId: BASE.recordId,
        sessionHomePath: BASE.checkoutPath,
        anchor: {
          kind: "process",
          pid: 42,
          startToken: "start",
          inspector: "test",
          selector: "codex",
        },
        leaseId: "a".repeat(32),
        attachedAt: "2026-07-20T01:00:00.000Z",
        heartbeatAt: "2026-07-20T01:00:00.000Z",
        observedLiveness: null,
        io: store.io,
      });
      return { store, role: beforeLease.record.role };
    };
    const common = {
      operation: "locus-resolve" as const,
      recommendedPromptText: "Resolve the role conflict.",
      recordId: BASE.recordId,
      checkoutPath: BASE.checkoutPath,
      expectedLeaseId: "a".repeat(32),
      duplicate: false,
    };

    const duplicate = await seeded();
    expect(await popLocusRole({
      ...common,
      expectedRole: duplicate.role,
      observedLiveness: "dead",
      duplicate: true,
      io: duplicate.store.io,
    })).toMatchObject({ outcome: "refused", reason: "duplicate-locus" });

    const newerRole = await seeded();
    expect(await popLocusRole({
      ...common,
      expectedRole: { ...newerRole.role, subject: { ...newerRole.role.subject, key: "older" } },
      observedLiveness: "dead",
      io: newerRole.store.io,
    })).toMatchObject({ outcome: "refused", reason: "role-conflict" });

    const newerLease = await seeded();
    expect(await popLocusRole({
      ...common,
      expectedRole: newerLease.role,
      expectedLeaseId: "b".repeat(32),
      observedLiveness: "dead",
      io: newerLease.store.io,
    })).toMatchObject({ outcome: "refused", reason: "lease-generation-mismatch" });

    for (const liveness of ["live", "unknown"] as const) {
      const occupied = await seeded();
      expect(await popLocusRole({
        ...common,
        expectedRole: occupied.role,
        observedLiveness: liveness,
        io: occupied.store.io,
      })).toMatchObject({
        outcome: "refused",
        reason: liveness === "live" ? "lease-live" : "lease-unknown",
      });
    }
  });

  it("schema-validates every public mutation result arm", async () => {
    expect(() => createLocusMutationResult({
      outcome: "applied",
      operation: "locus-resolve",
      recommendedPromptText: "Incomplete success.",
    })).toThrow();
    const error = await popLocusRole({
      operation: "locus-resolve",
      recommendedPromptText: "Retry after inspecting the record store.",
      recordId: BASE.recordId,
      checkoutPath: BASE.checkoutPath,
      expectedRole: {
        kind: "work-unit",
        subject: { kind: "work-unit", key: "demo", claimId: null },
        establishedAt: BASE.establishedAt,
        parentCheckoutPath: null,
        originEntry: null,
      },
      expectedLeaseId: null,
      observedLiveness: null,
      duplicate: false,
      io: {
        read: async () => { throw new Error("store unavailable"); },
        remove: async () => ({ kind: "removed" }),
      },
    });
    expect(error).toMatchObject({
      outcome: "error",
      error: { code: "locus.record-pop.failed", message: "store unavailable" },
    });
  });
});
