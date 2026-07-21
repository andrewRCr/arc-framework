/** Deterministic locus frame and current-state derivation. */

import { describe, expect, it } from "vitest";

import { assembleLocusState, deriveLocusFrames } from "../../../src/lib/locus/state.js";
import type { ProvisionalLocusRow } from "../../../src/lib/locus/roster.js";
import type { LocusProcessAnchor } from "../../../src/lib/locus/schema/index.js";

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
      .toEqual(["idle", "residue", "residue", "residue", "idle", null]);
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
