/** Deterministic public reconciliation and proof-bearing internal plans. */

import { describe, expect, it } from "vitest";

import {
  deriveLocusReconciliation,
  deriveTransientAdoptionCandidate,
  type LocusAdoptionCandidate,
} from "../../../src/lib/locus/reconciliation.js";
import type { TransientIdentitySnapshot } from "../../../src/lib/errand/identity-snapshot.js";
import type {
  WorktreeMarker,
  WorktreeMarkerGenerationReadResult,
} from "../../../src/lib/git/worktree-marker.js";
import type { LockEntryEvidence, RecordEntryEvidence } from "../../../src/lib/locus/evidence.js";
import type { LocusRecordV1, LocusRowV1 } from "../../../src/lib/locus/schema/index.js";

const ANCHOR = {
  kind: "process" as const,
  pid: 42,
  startToken: "start",
  inspector: "test",
  selector: "codex",
};

function record(digit: string, checkoutPath: string): LocusRecordV1 {
  return {
    schemaVersion: 1,
    recordId: `sha256:${digit.repeat(64)}`,
    checkoutPath,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: digit, claimId: null },
      establishedAt: "2026-07-20T00:00:00.000Z",
      parentCheckoutPath: null,
      originEntry: null,
    },
    lease: {
      leaseId: "a".repeat(32),
      sessionHomePath: checkoutPath,
      anchor: ANCHOR,
      attachedAt: "2026-07-20T00:00:00.000Z",
      heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
  };
}

function staleRow(value: LocusRecordV1): LocusRowV1 {
  const { establishedAt, ...role } = value.role;
  void establishedAt;
  return {
    kind: "stale-record",
    checkoutPath: value.checkoutPath,
    primary: null,
    recordId: value.recordId,
    role,
    identity: null,
    lease: value.lease === null ? null : {
      leaseId: value.lease.leaseId,
      state: "dead",
      sessionHomePath: value.lease.sessionHomePath,
      attachedAt: value.lease.attachedAt,
      heartbeatAt: value.lease.heartbeatAt,
    },
    frame: null,
    derived: null,
    diagnostics: [],
  };
}

describe("locus reconciliation", () => {
  const transientIdentity = {
    kind: "errand" as const,
    key: "errand",
    claimId: "2".repeat(32),
    protection: "full" as const,
    branch: "chore/errand",
    purpose: "errand" as const,
    origin: "description" as const,
    originEntry: null,
    state: "open" as const,
    savedHead: null,
    changeRequest: null,
  };
  const checkout = {
    path: "/errand",
    head: "a".repeat(40),
    branch: "chore/errand",
    detached: false,
    primary: false,
  };
  const identities: TransientIdentitySnapshot = {
    kind: "complete",
    tip: "b".repeat(40),
    objects: new Map(),
    records: new Map(),
    projections: new Map([["errand", transientIdentity]]),
    diagnostics: [],
  };
  const readyMarker: WorktreeMarkerGenerationReadResult = {
    kind: "present",
    marker: {
      spawnedByArc: true,
      spawningIdentity: "andrew",
      createdAt: "2026-07-20T00:00:00.000Z",
      createdFor: { kind: "errand", slug: "errand", claimId: "2".repeat(32) },
      provisioning: "ready",
    },
    bytes: Buffer.from("ready-marker"),
  };
  const adoptionInput = {
    identity: "andrew",
    checkout,
    marker: readyMarker,
    identities,
    recordId: `sha256:${"1".repeat(64)}`,
    recordPath: "/loci/errand.json",
  };

  it("derives transient adoption only from an exact ready marker, identity, and live checkout", () => {
    expect(deriveTransientAdoptionCandidate(adoptionInput)).toMatchObject({
      kind: "applicable",
      action: "adopt-transient",
      proof: { kind: "record-absent", path: "/loci/errand.json" },
      authority: {
        marker: { bytes: Buffer.from("ready-marker"), subject: { claimId: "2".repeat(32) } },
        checkout: { head: "a".repeat(40), branch: "chore/errand" },
        identity: { key: "errand", claimId: "2".repeat(32) },
      },
    });
    expect(deriveTransientAdoptionCandidate({
      ...adoptionInput,
      marker: {
        kind: "present",
        marker: {
          spawnedByArc: true,
          spawningIdentity: "andrew",
          createdAt: "2026-07-20T00:00:00.000Z",
          createdFor: { kind: "work-unit", name: "demo" },
        },
        bytes: Buffer.from("wu-marker"),
      },
    })).toBeNull();
  });

  it.each([
    ["pending", { ...readyMarker.marker, provisioning: "pending" } as WorktreeMarker],
    ["legacy", {
      spawnedByArc: true,
      spawningIdentity: "andrew",
      createdAt: "2026-07-20T00:00:00.000Z",
      createdFor: { kind: "errand", slug: "errand" },
    }],
  ] as const)("keeps a %s transient marker diagnosable but non-adoptable", (_kind, marker) => {
    expect(deriveTransientAdoptionCandidate({
      ...adoptionInput,
      marker: { kind: "present", marker, bytes: Buffer.from("marker") },
    })).toMatchObject({ kind: "blocked", reasons: ["subject-unresolved"] });
  });

  it("blocks incomplete identity reads and exact-claim mismatches", () => {
    expect(deriveTransientAdoptionCandidate({
      ...adoptionInput,
      identities: { kind: "error", stage: "tree", message: "incomplete" },
    })).toMatchObject({ kind: "blocked", reasons: ["identity-malformed"] });
    expect(deriveTransientAdoptionCandidate({
      ...adoptionInput,
      identities: {
        ...identities,
        projections: new Map([["errand", { ...transientIdentity, claimId: "3".repeat(32) }]]),
      },
    })).toMatchObject({ kind: "blocked", reasons: ["subject-unresolved"] });
  });

  it("reports clean when the bounded snapshot needs no repair", () => {
    expect(deriveLocusReconciliation({
      primaryPath: "/repo",
      rows: [],
      diagnostics: [],
      current: { kind: "none" },
      adoptionCandidates: [],
      records: [],
      locks: [],
    })).toEqual({ reconciliation: { kind: "clean" }, internalActions: [] });
  });

  it("emits every action in stable order with its exact generation proof", () => {
    const stale = record("3", "/gone");
    const recordBytes = Buffer.from("record-generation");
    const lockBytes = Buffer.from("lock-generation");
    const wuAdoption = {
      kind: "applicable",
      action: "adopt-work-unit",
      checkoutPath: "/wu",
      recordId: `sha256:${"2".repeat(64)}`,
      proof: { kind: "record-absent", path: "/loci/wu.json" },
      marker: "verified",
      subjectKey: "demo",
      identityKey: null,
    } satisfies LocusAdoptionCandidate;
    const transientAdoption = {
      kind: "applicable",
      action: "adopt-transient",
      checkoutPath: "/errand",
      recordId: `sha256:${"1".repeat(64)}`,
      proof: { kind: "record-absent", path: "/loci/errand.json" },
      subjectKey: "errand",
      identityKey: "errand",
      authority: {
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
      },
    } satisfies LocusAdoptionCandidate;
    const adoptions = [wuAdoption, transientAdoption];
    const records = [{
      kind: "record",
      name: `locus-${"3".repeat(64)}.json`,
      digest: "3".repeat(64),
      path: "/loci/stale.json",
      result: { kind: "valid", record: stale, bytes: recordBytes },
      canonical: { kind: "resolved", path: "/gone" },
      liveness: "dead",
    }] satisfies Extract<RecordEntryEvidence, { kind: "record" }>[];
    const locks = [{
      kind: "lock",
      name: `locus-${"4".repeat(64)}.lock`,
      digest: "4".repeat(64),
      path: "/locks/dead.lock",
      result: {
        kind: "valid",
        holder: { token: "b".repeat(32), anchor: ANCHOR, createdAt: "2026-07-20T00:00:00.000Z" },
        bytes: lockBytes,
      },
      liveness: "dead",
    }] satisfies Extract<LockEntryEvidence, { kind: "lock" }>[];

    const result = deriveLocusReconciliation({
      primaryPath: "/repo",
      rows: [staleRow(stale)],
      diagnostics: [],
      current: { kind: "none" },
      adoptionCandidates: adoptions,
      records,
      locks,
    });
    expect(result.reconciliation).toEqual({
      kind: "apply",
      actions: [
        { kind: "adopt-transient", checkoutPath: "/errand", recordId: `sha256:${"1".repeat(64)}` },
        { kind: "adopt-work-unit", checkoutPath: "/wu", recordId: `sha256:${"2".repeat(64)}` },
        { kind: "break-dead-lock", checkoutPath: null, recordId: `sha256:${"4".repeat(64)}` },
        { kind: "reap-stale-record", checkoutPath: "/gone", recordId: stale.recordId },
      ],
    });
    expect(result.internalActions).toEqual([
      {
        summary: expect.objectContaining({ kind: "adopt-transient" }),
        proof: transientAdoption.proof,
        authority: transientAdoption.authority,
      },
      {
        summary: expect.objectContaining({ kind: "adopt-work-unit" }),
        proof: wuAdoption.proof,
        authority: { kind: "work-unit", marker: "verified", subjectKey: "demo", identityKey: null },
      },
      {
        summary: expect.objectContaining({ kind: "break-dead-lock" }),
        proof: {
          kind: "lock-present",
          path: "/locks/dead.lock",
          bytes: lockBytes,
          token: "b".repeat(32),
          anchor: ANCHOR,
        },
        authority: null,
      },
      {
        summary: expect.objectContaining({ kind: "reap-stale-record" }),
        proof: { kind: "record-present", path: "/loci/stale.json", bytes: recordBytes },
        authority: null,
      },
    ]);
  });

  it("stops on malformed selected evidence but ignores unrelated unmanaged checkouts", () => {
    const malformed: LocusRowV1 = {
      kind: "malformed-record",
      checkoutPath: "/broken",
      primary: false,
      recordId: `sha256:${"5".repeat(64)}`,
      role: null,
      identity: null,
      lease: null,
      frame: null,
      derived: null,
      diagnostics: [{
        code: "record-malformed",
        source: { kind: "record", key: "broken" },
        message: "Malformed selected record",
      }],
    };
    const unmanaged: LocusRowV1 = {
      ...malformed,
      kind: "unmanaged-checkout",
      checkoutPath: "/unmanaged",
      recordId: null,
      diagnostics: [{
        code: "worktree-without-role",
        source: { kind: "checkout", key: "/unmanaged" },
        message: "Checkout is unmanaged",
      }],
    };
    const common = {
      primaryPath: "/repo",
      rows: [malformed, unmanaged],
      diagnostics: [
        ...malformed.diagnostics,
        ...unmanaged.diagnostics,
        {
          code: "identity-malformed" as const,
          source: { kind: "identity" as const, key: "unrelated" },
          message: "Unrelated identity is malformed",
        },
      ],
      current: { kind: "none" as const },
      adoptionCandidates: [],
      records: [],
      locks: [],
    };

    expect(deriveLocusReconciliation(common).reconciliation).toEqual({ kind: "clean" });
    expect(deriveLocusReconciliation({
      ...common,
      selected: { recordIds: [malformed.recordId ?? ""] },
    }).reconciliation).toEqual({ kind: "stop", reasons: ["record-malformed"] });
  });

  it("stops in fixed order for unsafe targets, alias ambiguity, and malformed identity authority", () => {
    const liveRecord = record("6", "/live");
    const unknownRecord = record("7", "/unknown");
    const live = {
      ...staleRow(liveRecord),
      kind: "managed-role" as const,
      lease: { ...staleRow(liveRecord).lease!, state: "live" as const },
    };
    const unknown = {
      ...staleRow(unknownRecord),
      kind: "managed-role" as const,
      lease: { ...staleRow(unknownRecord).lease!, state: "unknown" as const },
      diagnostics: [{
        code: "unsupported-version" as const,
        source: { kind: "record" as const, key: "unknown" },
        message: "Unsupported record generation",
      }],
    };
    const duplicate = { ...live, kind: "duplicate-locus" as const, checkoutPath: "/alias" };
    const identityDiagnostic = {
      code: "identity-malformed" as const,
      source: { kind: "identity" as const, key: "errand" },
      message: "Identity is malformed",
    };
    const blocked = {
      kind: "blocked" as const,
      checkoutPath: "/blocked",
      recordId: `sha256:${"8".repeat(64)}`,
      subjectKey: "errand",
      identityKey: "errand",
      reasons: ["cross-identity", "marker-missing", "subject-unresolved"] as const,
    } satisfies LocusAdoptionCandidate;
    const locks = [
      {
        kind: "lock" as const,
        name: `locus-${"6".repeat(64)}.lock`,
        digest: "6".repeat(64),
        path: "/locks/live.lock",
        result: {
          kind: "valid" as const,
          holder: { token: "b".repeat(32), anchor: ANCHOR, createdAt: "2026-07-20T00:00:00.000Z" },
          bytes: Buffer.from("live"),
        },
        liveness: "live" as const,
      },
      {
        kind: "lock" as const,
        name: `locus-${"7".repeat(64)}.lock`,
        digest: "7".repeat(64),
        path: "/locks/unknown.lock",
        result: { kind: "unknown" as const },
        liveness: "unknown" as const,
      },
    ] satisfies Extract<LockEntryEvidence, { kind: "lock" }>[];

    expect(deriveLocusReconciliation({
      primaryPath: "/repo",
      rows: [live, unknown, duplicate],
      diagnostics: [identityDiagnostic],
      current: { kind: "none" },
      adoptionCandidates: [blocked],
      records: [],
      locks,
      selected: { recordIds: [liveRecord.recordId, unknownRecord.recordId] },
    })).toEqual({
      reconciliation: {
        kind: "stop",
        reasons: [
          "lease-live",
          "lease-unknown",
          "lock-live",
          "lock-unknown",
          "unsupported-version",
          "identity-malformed",
          "duplicate-locus",
          "cross-identity",
          "marker-missing",
          "subject-unresolved",
        ],
      },
      internalActions: [],
    });
  });
});
