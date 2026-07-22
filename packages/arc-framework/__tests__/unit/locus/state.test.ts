/** Deterministic locus frame and current-state derivation. */

import { describe, expect, it } from "vitest";

import {
  assembleLocusState,
  deriveLocusFrames,
  deriveLocusOperationalState,
} from "../../../src/lib/locus/state.js";
import type { ProvisionalLocusRow } from "../../../src/lib/locus/roster.js";
import type { LocusIdentityV1, LocusProcessAnchor } from "../../../src/lib/locus/schema/index.js";

const ANCHOR: LocusProcessAnchor = {
  kind: "process", pid: 42, startToken: "start", inspector: "test", selector: "codex",
};

function row(options: {
  id: string;
  path?: string;
  role?: "work-unit" | "errand";
  lease?: "live" | "dead" | "unknown" | null;
  parent?: string | null;
  anchor?: LocusProcessAnchor;
  kind?: ProvisionalLocusRow["kind"];
}): ProvisionalLocusRow {
  const role = options.role ?? "work-unit";
  return {
    kind: options.kind ?? "managed-role",
    checkoutPath: options.path ?? `/${options.id}`,
    primary: false,
    recordId: `sha256:${options.id.repeat(64)}`,
    role: {
      kind: role,
      subject: { kind: role, key: options.id, claimId: role === "errand" ? "a".repeat(32) : null },
      parentCheckoutPath: options.parent ?? null,
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
    },
    identity: null,
    lease: options.lease === null || options.lease === undefined ? null : {
      leaseId: "b".repeat(32),
      state: options.lease,
      sessionHomePath: options.parent ?? options.path ?? `/${options.id}`,
      attachedAt: "2026-07-20T00:00:00.000Z",
      heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
    leaseAnchor: options.lease === null || options.lease === undefined ? null : options.anchor ?? ANCHOR,
    frame: null,
    derived: null,
    diagnostics: [],
  };
}

function errandIdentity(key: string, state: "open" | "paused" | "awaiting-merge"): LocusIdentityV1 {
  const common = {
    kind: "errand" as const,
    key,
    claimId: key.padEnd(32, "a"),
    protection: "full" as const,
    branch: `chore/${key}`,
    purpose: "errand" as const,
    origin: "description" as const,
    originEntry: null,
    dispatchId: null,
  };
  if (state === "paused") {
    return { ...common, state, savedHead: "a".repeat(40), changeRequest: null };
  }
  if (state === "awaiting-merge") {
    return {
      ...common,
      state,
      savedHead: null,
      changeRequest: {
        repositoryRef: "owner/repo",
        hostRef: "github",
        baseRef: "main",
        headRef: `chore/${key}`,
        headSha: "b".repeat(40),
      },
    };
  }
  return { ...common, state, savedHead: null, changeRequest: null };
}

describe("locus frame derivation", () => {
  it("prefers a matching live transient and suspends its one live WU parent", () => {
    const parent = row({ id: "1", path: "/parent", lease: "live" });
    const child = row({ id: "2", path: "/child", role: "errand", lease: "live", parent: "/parent" });
    const result = deriveLocusFrames({ rows: [parent, child], enteringAnchor: ANCHOR });
    expect(result.rows.map(({ recordId, frame }) => ({ recordId, frame }))).toEqual([
      { recordId: parent.recordId, frame: "suspended" },
      { recordId: child.recordId, frame: "active" },
    ]);
    expect(result.current).toEqual({
      kind: "resolved",
      sessionHomeRecordId: parent.recordId,
      activeRecordId: child.recordId,
      parentRecordId: parent.recordId,
    });
  });

  it("assembles one public envelope and strips private lease anchors", () => {
    const managed = row({ id: "1", path: "/repo", lease: "live" });
    const state = assembleLocusState({
      primaryPath: "/repo",
      rows: [managed],
      diagnostics: [],
      enteringAnchor: ANCHOR,
      primaryAvailability: { kind: "occupied", checkoutPath: "/repo", recordId: managed.recordId ?? "", leaseState: "live" },
      inFlightIdentities: [],
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    });
    expect(state.roster).toMatchObject({ mode: "locus", ok: true, primaryPath: "/repo" });
    expect(state.roster.ok && state.roster.rows[0]).not.toHaveProperty("leaseAnchor");
  });

  it("classifies null, dead, unknown, identity-only, and unmanaged frames", () => {
    const identityOnly = {
      ...row({ id: "5", kind: "identity-only", lease: null }),
      recordId: null,
      role: null,
      checkoutPath: null,
    } satisfies ProvisionalLocusRow;
    const unmanaged = {
      ...row({ id: "6", kind: "unmanaged-checkout", lease: null }),
      recordId: null,
      role: null,
    } satisfies ProvisionalLocusRow;
    const rows = [
      row({ id: "1", lease: null }),
      row({ id: "2", role: "errand", lease: null }),
      row({ id: "3", lease: "dead" }),
      row({ id: "4", lease: "unknown" }),
      identityOnly,
      unmanaged,
    ];
    expect(deriveLocusFrames({ rows, enteringAnchor: ANCHOR }).rows.map((item) => item.frame))
      .toEqual(["idle", "residue", "idle", "residue", "idle", null]);
  });

  it("resolves a live transient through its leaseless WU parent", () => {
    const parent = row({ id: "1", path: "/parent", lease: null });
    const child = row({ id: "2", path: "/child", role: "errand", lease: "live", parent: "/parent" });
    const result = deriveLocusFrames({ rows: [parent, child], enteringAnchor: ANCHOR });

    expect(result.rows.map(({ recordId, frame }) => ({ recordId, frame }))).toEqual([
      { recordId: parent.recordId, frame: "suspended" },
      { recordId: child.recordId, frame: "active" },
    ]);
    expect(result.current).toEqual({
      kind: "resolved",
      sessionHomeRecordId: parent.recordId,
      activeRecordId: child.recordId,
      parentRecordId: parent.recordId,
    });
  });

  it("returns none, cold transient, WU, and ambiguous current states without choosing siblings", () => {
    const otherAnchor = { ...ANCHOR, pid: 99 };
    expect(deriveLocusFrames({
      rows: [row({ id: "1", lease: "live", anchor: otherAnchor })],
      enteringAnchor: ANCHOR,
    }).current).toEqual({ kind: "none" });

    const cold = row({ id: "2", role: "errand", lease: "live" });
    expect(deriveLocusFrames({ rows: [cold], enteringAnchor: ANCHOR }).current)
      .toMatchObject({ kind: "resolved", activeRecordId: cold.recordId, parentRecordId: null });

    const workUnit = row({ id: "3", lease: "live" });
    expect(deriveLocusFrames({ rows: [workUnit], enteringAnchor: ANCHOR }).current)
      .toMatchObject({ kind: "resolved", activeRecordId: workUnit.recordId });

    const left = row({ id: "4", role: "errand", lease: "live" });
    const right = row({ id: "5", role: "errand", lease: "live" });
    expect(deriveLocusFrames({ rows: [left, right], enteringAnchor: ANCHOR }).current)
      .toEqual({
        kind: "ambiguous",
        recordIds: [left.recordId, right.recordId],
        reasons: ["role-conflict"],
      });

    const middle = row({ id: "6", path: "/middle", role: "errand", lease: "live", anchor: otherAnchor });
    const invalidDepth = row({ id: "7", role: "errand", lease: "live", parent: "/middle" });
    expect(deriveLocusFrames({ rows: [middle, invalidDepth], enteringAnchor: ANCHOR }).current)
      .toEqual({ kind: "ambiguous", recordIds: [invalidDepth.recordId], reasons: ["role-conflict"] });
  });
});

describe("locus operational derivation", () => {
  it("makes only a record-free clean primary on base available", () => {
    const primary = {
      ...row({ id: "1", path: "/repo", kind: "free-primary", lease: null }),
      primary: true,
      recordId: null,
      role: null,
    } satisfies ProvisionalLocusRow;
    const frames = deriveLocusFrames({ rows: [primary], enteringAnchor: ANCHOR });

    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: frames.rows,
      current: frames.current,
      primarySafety: { kind: "complete", clean: true, onBase: true, branch: "main" },
      primaryLock: "absent",
    }).primaryAvailability).toEqual({ kind: "free", checkoutPath: "/repo" });

    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: frames.rows,
      current: frames.current,
      primarySafety: { kind: "complete", clean: false, onBase: false, branch: "feature" },
      primaryLock: "absent",
    }).primaryAvailability).toEqual({
      kind: "unsafe",
      checkoutPath: "/repo",
      reasons: ["primary-dirty", "primary-off-base"],
    });
  });

  it("keeps an exact in-place WU occupied across every lease state", () => {
    for (const lease of [null, "live", "dead", "unknown"] as const) {
      const primary = { ...row({ id: "1", path: "/repo", lease }), primary: true };
      const frames = deriveLocusFrames({ rows: [primary], enteringAnchor: ANCHOR });
      expect(deriveLocusOperationalState({
        primaryPath: "/repo",
        rows: frames.rows,
        current: frames.current,
        primarySafety: { kind: "complete", clean: false, onBase: false, branch: "feat/demo" },
        primaryLock: "absent",
      }).primaryAvailability).toEqual({
        kind: "occupied",
        checkoutPath: "/repo",
        recordId: primary.recordId,
        leaseState: lease ?? "absent",
      });
    }
  });

  it("fails primary allocation closed for unsafe safety, role, lock, and alias evidence", () => {
    const unresolved = {
      ...row({ id: "1", path: "/repo", lease: null }),
      primary: true,
      diagnostics: [{
        code: "subject-unresolved" as const,
        source: { kind: "record" as const, key: "1" },
        message: "Role and branch disagree",
      }],
    };
    const unresolvedFrames = deriveLocusFrames({ rows: [unresolved], enteringAnchor: ANCHOR });
    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: unresolvedFrames.rows,
      current: unresolvedFrames.current,
      primarySafety: { kind: "complete", clean: true, onBase: false, branch: "wrong" },
      primaryLock: "live",
    }).primaryAvailability).toEqual({
      kind: "unsafe",
      checkoutPath: "/repo",
      reasons: ["lock-live", "subject-unresolved"],
    });

    const duplicate = { ...unresolved, kind: "duplicate-locus" as const, diagnostics: [] };
    const duplicateFrames = deriveLocusFrames({ rows: [duplicate], enteringAnchor: ANCHOR });
    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: duplicateFrames.rows,
      current: duplicateFrames.current,
      primarySafety: { kind: "complete", clean: true, onBase: true, branch: "main" },
      primaryLock: "unknown",
    }).primaryAvailability).toEqual({
      kind: "unsafe",
      checkoutPath: "/repo",
      reasons: ["lock-unknown", "duplicate-locus"],
    });

    const malformed = {
      ...unresolved,
      kind: "malformed-record" as const,
      role: null,
      diagnostics: [{
        code: "record-malformed" as const,
        source: { kind: "record" as const, key: "1" },
        message: "Record cannot be parsed",
      }],
    };
    const malformedFrames = deriveLocusFrames({ rows: [malformed], enteringAnchor: ANCHOR });
    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: malformedFrames.rows,
      current: malformedFrames.current,
      primarySafety: { kind: "complete", clean: true, onBase: true, branch: "main" },
      primaryLock: "absent",
    }).primaryAvailability).toEqual({
      kind: "unsafe",
      checkoutPath: "/repo",
      reasons: ["record-malformed"],
    });
  });

  it("projects every identity lifecycle action set in stable identity order", () => {
    const primary = {
      ...row({ id: "1", path: "/repo", kind: "free-primary", lease: null }),
      primary: true,
      recordId: null,
      role: null,
    } satisfies ProvisionalLocusRow;
    const identities = [
      errandIdentity("zeta", "awaiting-merge"),
      errandIdentity("alpha", "open"),
      errandIdentity("middle", "paused"),
    ].map((identity) => ({
      ...row({ id: identity.key, kind: "identity-only", lease: null }),
      checkoutPath: null,
      recordId: null,
      role: null,
      identity,
    } satisfies ProvisionalLocusRow));
    const frames = deriveLocusFrames({ rows: [primary, ...identities], enteringAnchor: ANCHOR });

    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: frames.rows,
      current: frames.current,
      primarySafety: { kind: "complete", clean: true, onBase: true, branch: "main" },
      primaryLock: "absent",
    }).inFlightIdentities.map(({ identity, actions }) => ({ key: identity.key, actions }))).toEqual([
      { key: "alpha", actions: ["resume", "abandon"] },
      { key: "middle", actions: ["resume", "abandon"] },
      { key: "zeta", actions: ["resume", "wait", "finalize", "abandon"] },
    ]);
  });

  it("requires an explicit choice for dead transient residue", () => {
    const primary = {
      ...row({ id: "1", path: "/repo", kind: "free-primary", lease: null }),
      primary: true,
      recordId: null,
      role: null,
    } satisfies ProvisionalLocusRow;
    const residue = row({ id: "2", path: "/errand", role: "errand", lease: "dead" });
    const frames = deriveLocusFrames({ rows: [primary, residue], enteringAnchor: ANCHOR });

    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: frames.rows,
      current: frames.current,
      primarySafety: { kind: "complete", clean: true, onBase: true, branch: "main" },
      primaryLock: "absent",
    }).recovery).toEqual({
      kind: "residue",
      recordId: residue.recordId,
      actions: ["resume", "abandon"],
    });
  });

  it("resumes the entering frame, replaces dead WU leases, and stops on unknown liveness", () => {
    const primary = {
      ...row({ id: "1", path: "/repo", kind: "free-primary", lease: null }),
      primary: true,
      recordId: null,
      role: null,
    } satisfies ProvisionalLocusRow;
    const derive = (subject: ProvisionalLocusRow) => {
      const frames = deriveLocusFrames({ rows: [primary, subject], enteringAnchor: ANCHOR });
      return deriveLocusOperationalState({
        primaryPath: "/repo",
        rows: frames.rows,
        current: frames.current,
        primarySafety: { kind: "complete", clean: true, onBase: true, branch: "main" },
        primaryLock: "absent",
      }).recovery;
    };

    const active = row({ id: "2", lease: "live" });
    expect(derive(active)).toEqual({
      kind: "resume",
      activeRecordId: active.recordId,
      parentRecordId: null,
    });
    expect(derive(row({ id: "3", lease: "dead" }))).toEqual({ kind: "none" });
    expect(derive(row({ id: "5", lease: "live", anchor: { ...ANCHOR, pid: 99 } })))
      .toEqual({ kind: "none" });
    expect(derive(row({ id: "4", lease: "unknown" }))).toEqual({
      kind: "stop",
      reasons: ["lease-unknown"],
    });

    const unknown = row({ id: "6", lease: "unknown" });
    const mixedFrames = deriveLocusFrames({ rows: [primary, active, unknown], enteringAnchor: ANCHOR });
    expect(deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: mixedFrames.rows,
      current: mixedFrames.current,
      primarySafety: { kind: "complete", clean: true, onBase: true, branch: "main" },
      primaryLock: "absent",
    }).recovery).toEqual({ kind: "stop", reasons: ["lease-unknown"] });
  });

  it("resumes an exact live entering frame while the separate primary is unavailable", () => {
    const primary = {
      ...row({ id: "1", path: "/repo", kind: "free-primary", lease: null }),
      primary: true,
      recordId: null,
      role: null,
    } satisfies ProvisionalLocusRow;
    const active = row({ id: "2", path: "/repo.active", lease: "live" });
    const frames = deriveLocusFrames({ rows: [primary, active], enteringAnchor: ANCHOR });

    const state = deriveLocusOperationalState({
      primaryPath: "/repo",
      rows: frames.rows,
      current: frames.current,
      primarySafety: { kind: "complete", clean: false, onBase: false, branch: "feat/unrelated" },
      primaryLock: "absent",
    });

    expect(state.primaryAvailability).toEqual({
      kind: "unsafe",
      checkoutPath: "/repo",
      reasons: ["primary-dirty", "primary-off-base"],
    });
    expect(state.recovery).toEqual({
      kind: "resume",
      activeRecordId: active.recordId,
      parentRecordId: null,
    });
  });
});
