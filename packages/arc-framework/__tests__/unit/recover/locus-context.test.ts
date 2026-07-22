/** Recovery context derivation from one reader-owned locus snapshot. */

import { describe, expect, it } from "vitest";

import {
  deriveRecoveryLocusContext,
  RecoveryLocusContextError,
} from "../../../src/lib/recover/locus-context.js";
import type { LoadSetManifest } from "../../../src/lib/load-set/types.js";
import type { LocusRowV1, LocusStateV1 } from "../../../src/lib/locus/schema/index.js";

const RECORD_WU = `sha256:${"a".repeat(64)}`;
const RECORD_CHILD = `sha256:${"b".repeat(64)}`;
const LEASE_WU = "c".repeat(32);
const LEASE_CHILD = "d".repeat(32);
const CLAIM = "e".repeat(32);
const NOW = "2026-07-21T00:00:00.000Z";

function loadSet(...paths: string[]): LoadSetManifest {
  return {
    manifestVersion: 1,
    entries: paths.map((path) => ({ path, readMode: { kind: "full" as const } })),
  };
}

function workUnitRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role",
    checkoutPath: "/repo-wu",
    primary: false,
    recordId: RECORD_WU,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: "demo", claimId: null },
      parentCheckoutPath: null,
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
    },
    identity: null,
    lease: {
      leaseId: LEASE_WU,
      state: "live",
      sessionHomePath: "/repo-wu",
      attachedAt: NOW,
      heartbeatAt: NOW,
    },
    frame: "active",
    derived: {
      workflow: "process-task-loop",
      stage: null,
      sessionType: "execution",
      taskCursor: {
        status: "found",
        cursor: {
          section: { id: "2.1", title: "Recover", lineHint: 20 },
          leaf: { id: "2.1.a", title: "Derive", lineHint: 24 },
        },
      },
      loadSet: loadSet(".arc/reference/briefs/AGENT-BRIEF.ARC.md", ".arc/system/workflows/arc/process-task-loop.md"),
    },
    diagnostics: [],
    ...overrides,
  };
}

function transientRow(
  role: "errand" | "groom" | "housekeep" = "errand",
  overrides: Partial<LocusRowV1> = {},
): LocusRowV1 {
  const identity = role === "errand"
    ? {
        kind: "errand" as const,
        key: "fix-one",
        claimId: CLAIM,
        protection: "full" as const,
        branch: "chore/fix-one",
        purpose: "errand" as const,
        origin: "description" as const,
        originEntry: null,
        dispatchId: null,
        state: "open" as const,
        savedHead: null,
        changeRequest: null,
      }
    : role === "groom"
      ? {
          kind: "groom" as const,
          key: "groom-demo",
          claimId: CLAIM,
          purpose: null,
          anchorStub: "demo",
          members: ["demo"],
          openedBaseHead: "1".repeat(40),
          protection: "full" as const,
          branch: "chore/groom-demo",
          state: "open" as const,
          savedHead: null,
          changeRequest: null,
        }
      : null;
  return {
    kind: "managed-role",
    checkoutPath: "/repo-child",
    primary: true,
    recordId: RECORD_CHILD,
    role: {
      kind: role,
      subject: role === "errand"
        ? { kind: "errand", key: "fix-one", claimId: CLAIM }
        : role === "groom"
          ? { kind: "groom", key: "groom-demo", claimId: CLAIM }
          : { kind: "housekeep", key: "sweep", claimId: null },
      parentCheckoutPath: "/repo-wu",
      dispatchId: role === "housekeep" ? "dispatch-1" : null,
      originEntry: null,
      routingPlanDigest: role === "housekeep" ? `sha256:${"f".repeat(64)}` : null,
    },
    identity,
    lease: {
      leaseId: LEASE_CHILD,
      state: "live",
      sessionHomePath: "/repo-wu",
      attachedAt: NOW,
      heartbeatAt: NOW,
    },
    frame: "active",
    derived: null,
    diagnostics: [],
    ...overrides,
  };
}

function state(rows: LocusRowV1[], current: LocusStateV1["current"]): LocusStateV1 {
  return {
    roster: { mode: "locus", ok: true, primaryPath: "/repo", rows, diagnostics: [] },
    current,
    primaryAvailability: { kind: "occupied", checkoutPath: "/repo", recordId: rows[0]?.recordId ?? RECORD_WU, leaseState: "live" },
    inFlightIdentities: [],
    recovery: current.kind === "resolved"
      ? { kind: "resume", activeRecordId: current.activeRecordId, parentRecordId: current.parentRecordId }
      : current.kind === "ambiguous"
        ? { kind: "stop", reasons: current.reasons }
        : { kind: "none" },
    reconciliation: { kind: "clean" },
  };
}

describe("deriveRecoveryLocusContext", () => {
  it("uses the selected WU row's derived workflow, load set, and cursor", () => {
    const wu = workUnitRow();
    const result = deriveRecoveryLocusContext({
      state: state([wu], { kind: "resolved", sessionHomeRecordId: RECORD_WU, activeRecordId: RECORD_WU, parentRecordId: null }),
      identity: "andrew",
      workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    });

    expect(result.frame).toEqual({
      kind: "resolved",
      workflow: "process-task-loop",
      sessionType: "execution",
      activeRecordId: RECORD_WU,
      parentRecordId: null,
    });
    expect(result.loadSet).toEqual(wu.derived?.loadSet);
    expect(result.taskCursor).toEqual(wu.derived?.taskCursor);
  });

  it("resumes a warm transient first while retaining its suspended WU context", () => {
    const parent = workUnitRow({ frame: "suspended" });
    const child = transientRow();
    const result = deriveRecoveryLocusContext({
      state: state([parent, child], {
        kind: "resolved",
        sessionHomeRecordId: RECORD_WU,
        activeRecordId: RECORD_CHILD,
        parentRecordId: RECORD_WU,
      }),
      identity: "andrew",
      workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    });

    expect(result.frame).toMatchObject({ kind: "resolved", workflow: "run-errand", parentRecordId: RECORD_WU });
    expect(result.loadSet.entries.at(-1)).toEqual({
      path: ".arc/system/workflows/arc/supplemental/run-errand.md",
      readMode: { kind: "full" },
    });
    expect(result.taskCursor).toEqual(parent.derived?.taskCursor);
  });

  it("derives a cold transient from its null-parent row without active-meta probes", () => {
    const child = transientRow("errand", {
      role: { ...transientRow().role!, parentCheckoutPath: null },
      lease: { ...transientRow().lease!, sessionHomePath: "/repo-child" },
    });
    const result = deriveRecoveryLocusContext({
      state: state([child], {
        kind: "resolved",
        sessionHomeRecordId: RECORD_CHILD,
        activeRecordId: RECORD_CHILD,
        parentRecordId: null,
      }),
      identity: "andrew",
      workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    });

    expect(result.frame).toMatchObject({ kind: "resolved", workflow: "run-errand", parentRecordId: null });
    expect(result.taskCursor).toBeNull();
    expect(result.loadSet.entries.map(({ path }) => path)).toContain(
      ".arc/system/workflows/arc/supplemental/run-errand.md",
    );
  });

  it.each([
    ["groom", "draft-design", ".arc/system/workflows/arc/draft-design.md"],
    ["housekeep", "drain-inbox", ".arc/system/workflows/arc/supplemental/drain-inbox.md"],
  ] as const)("maps a cold %s role to its governing workflow", (role, workflow, path) => {
    const initial = transientRow(role);
    const child = transientRow(role, {
      role: { ...initial.role!, parentCheckoutPath: null },
      lease: { ...initial.lease!, sessionHomePath: "/repo-child" },
    });
    const result = deriveRecoveryLocusContext({
      state: state([child], {
        kind: "resolved",
        sessionHomeRecordId: RECORD_CHILD,
        activeRecordId: RECORD_CHILD,
        parentRecordId: null,
      }),
      identity: "andrew",
      workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    });

    expect(result.frame).toMatchObject({ kind: "resolved", workflow });
    expect(result.loadSet.entries.at(-1)?.path).toBe(path);
  });

  it("treats an identity-only tail as between-work-unit context", () => {
    const identityOnly: LocusRowV1 = {
      ...transientRow(),
      kind: "identity-only",
      checkoutPath: null,
      primary: null,
      recordId: null,
      role: null,
      lease: null,
      frame: "idle",
    };
    const result = deriveRecoveryLocusContext({
      state: state([identityOnly], { kind: "none" }),
      identity: "andrew",
      workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    });

    expect(result.frame).toEqual({ kind: "none", workflow: null, sessionType: null });
    expect(result.taskCursor).toBeNull();
    expect(result.loadSet.entries.at(-1)?.path).toBe("/users/andrew/WORKING-MEMORY.md");
  });

  it.each([
    ["ambiguous current", state([workUnitRow(), transientRow()], {
      kind: "ambiguous", recordIds: [RECORD_WU, RECORD_CHILD], reasons: ["role-conflict"],
    })],
    ["missing selected row", state([workUnitRow()], {
      kind: "resolved", sessionHomeRecordId: RECORD_WU, activeRecordId: RECORD_CHILD, parentRecordId: null,
    })],
    ["duplicate selected row", state([transientRow(), transientRow()], {
      kind: "resolved", sessionHomeRecordId: RECORD_CHILD, activeRecordId: RECORD_CHILD, parentRecordId: null,
    })],
    ["changed recovery token", {
      ...state([workUnitRow()], {
        kind: "resolved", sessionHomeRecordId: RECORD_WU, activeRecordId: RECORD_WU, parentRecordId: null,
      }),
      recovery: { kind: "resume" as const, activeRecordId: RECORD_CHILD, parentRecordId: null },
    }],
    ["malformed selected projection", state([workUnitRow({ derived: null })], {
      kind: "resolved", sessionHomeRecordId: RECORD_WU, activeRecordId: RECORD_WU, parentRecordId: null,
    })],
    ["dead selected lease", state([workUnitRow({ lease: { ...workUnitRow().lease!, state: "dead" }, frame: "residue" })], {
      kind: "resolved", sessionHomeRecordId: RECORD_WU, activeRecordId: RECORD_WU, parentRecordId: null,
    })],
    ["unknown residue", {
      ...state([transientRow("errand", { lease: { ...transientRow().lease!, state: "unknown" }, frame: "residue" })], { kind: "none" }),
      recovery: { kind: "stop" as const, reasons: ["lease-unknown" as const] },
    }],
  ])("refuses %s without selecting a fallback", (_name, invalid) => {
    expect(() => deriveRecoveryLocusContext({
      state: invalid,
      identity: "andrew",
      workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    })).toThrow(RecoveryLocusContextError);
  });
});
