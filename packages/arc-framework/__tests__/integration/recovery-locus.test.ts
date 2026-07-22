/** Integration coverage for locus-derived recovery envelope transitions. */

import { describe, expect, it } from "vitest";

import { runRecoverStatus, type SessionRecoverProbes } from "../../src/commands/status.js";
import { assertSessionRecoverProbeResult } from "../../src/commands/status/schema.js";
import type { LocusIdentityV1, LocusRowV1, LocusStateV1 } from "../../src/lib/locus/schema/index.js";

const WU_RECORD = `sha256:${"a".repeat(64)}`;
const CHILD_RECORD = `sha256:${"b".repeat(64)}`;
const CLAIM = "c".repeat(32);
const NOW = "2026-07-21T00:00:00.000Z";

function workUnit(
  sessionType: "planning" | "execution" = "execution",
  frame: "active" | "suspended" = "suspended",
): LocusRowV1 {
  const planning = sessionType === "planning";
  return {
    kind: "managed-role",
    checkoutPath: "/repo.demo",
    primary: false,
    recordId: WU_RECORD,
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
      leaseId: "d".repeat(32),
      state: "live",
      sessionHomePath: "/repo.demo",
      attachedAt: NOW,
      heartbeatAt: NOW,
    },
    frame,
    derived: {
      workflow: planning ? "planning" : "process-task-loop",
      stage: planning ? "create-spec" : null,
      sessionType,
      taskCursor: planning ? null : {
        status: "found",
        cursor: {
          section: { id: "2.1", title: "Recover", lineHint: 20 },
          leaf: { id: "2.1.a", title: "Resume", lineHint: 24 },
        },
      },
      loadSet: {
        manifestVersion: 1,
        entries: [
          { path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md", readMode: { kind: "full" } },
          ...(planning
            ? [{ path: ".arc/system/workflows/arc/create-spec.md", readMode: { kind: "full" as const } }]
            : [
                { path: ".arc/active/tasks-demo.md", readMode: { kind: "partial-strategic" as const } },
                { path: ".arc/system/workflows/arc/process-task-loop.md", readMode: { kind: "full" as const } },
              ]),
        ],
      },
    },
    diagnostics: [],
  };
}

function errand(subjectKind: "errand" | "partial-errand" = "errand"): LocusRowV1 {
  const identity: LocusIdentityV1 | null = subjectKind === "errand" ? {
    kind: "errand",
    key: "fix-one",
    claimId: CLAIM,
    protection: "full",
    branch: "chore/fix-one",
    purpose: "errand",
    origin: "description",
    originEntry: null,
    dispatchId: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  } : null;
  return {
    kind: "managed-role",
    checkoutPath: "/repo",
    primary: true,
    recordId: CHILD_RECORD,
    role: {
      kind: "errand",
      subject: { kind: subjectKind, key: "fix-one", claimId: subjectKind === "errand" ? CLAIM : null },
      parentCheckoutPath: "/repo.demo",
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
    },
    identity,
    lease: {
      leaseId: "e".repeat(32),
      state: "live",
      sessionHomePath: "/repo.demo",
      attachedAt: NOW,
      heartbeatAt: NOW,
    },
    frame: "active",
    derived: null,
    diagnostics: [],
  };
}

function housekeep(): LocusRowV1 {
  return {
    ...errand("partial-errand"),
    role: {
      kind: "housekeep",
      subject: { kind: "housekeep", key: "sweep", claimId: null },
      parentCheckoutPath: "/repo.demo",
      dispatchId: "dispatch-7",
      originEntry: null,
      routingPlanDigest: `sha256:${"f".repeat(64)}`,
    },
  };
}

function state(
  rows: LocusRowV1[],
  current: LocusStateV1["current"],
): LocusStateV1 {
  return {
    roster: { mode: "locus", ok: true, primaryPath: "/repo", rows, diagnostics: [] },
    current,
    primaryAvailability: { kind: "occupied", checkoutPath: "/repo", recordId: CHILD_RECORD, leaseState: "live" },
    inFlightIdentities: [],
    recovery: current.kind === "resolved"
      ? { kind: "resume", activeRecordId: current.activeRecordId, parentRecordId: current.parentRecordId }
      : { kind: "none" },
    reconciliation: { kind: "clean" },
  };
}

function recoverProbes(locusState: LocusStateV1): SessionRecoverProbes {
  const parent = locusState.roster.rows.find((row) => row.role?.kind === "work-unit");
  const projectedSessionType = parent?.derived?.sessionType;
  const sessionType = projectedSessionType === "planning"
    || projectedSessionType === "execution"
    || projectedSessionType === "integration"
    ? projectedSessionType
    : null;
  const planning = sessionType === "planning";
  return {
    locusState: async () => locusState,
    legacyErrand: async () => null,
    worktree: async () => ({ state: "clean", ahead: 0, behind: 0, branch: "feat/demo" }),
    worktreeIdentity: async () => ({ kind: "linked", path: "/repo.demo" }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    extensions: async () => ({ mode: "session-init", active: [], warnings: [] }),
    config: async () => ({
      mode: "session-init",
      settings: {
        "session.remote_sync": "enabled",
        "session.init_pull.worktree": "prompt",
        "session.init_pull.notes": "prompt",
        "session.init_pull.base": "prompt",
        "session.init_load.notes": "prompt",
        "user.notes_push": "on-sync",
        "branch.protection": "full",
        "pm.mode": "arc-in-git",
        "commit.format": "conventional",
        "commit.context_footer": "required",
        "commit.interlock": "manual",
        "push.interlock": "manual",
      },
      defaultsApplied: [],
      warnings: [],
    }),
    active: async () => ({
      mode: "session-init",
      layout: "full",
      resolution: "single",
      path: ".arc/active/meta-demo.md",
      candidates: [],
      sessionType,
      currentWorkflow: null,
      planningStage: planning ? "create-spec" : null,
      warnings: [],
      taskListPath: planning ? null : ".arc/active/tasks-demo.md",
      companions: { notes: ".arc/active/notes-demo.md", atomic: null },
    }),
    releaseRouting: async () => ({
      taskCommit: "raw",
      workflowCommit: "raw",
      workflowPush: "raw",
      rationale: { releaseOptedIn: false, commitInterlock: "manual", pushInterlock: "manual" },
    }),
  };
}

async function recover(locusState: LocusStateV1) {
  const result = await runRecoverStatus({
    identity: "andrew",
    role: "maintainer",
    workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    probes: recoverProbes(locusState),
  });
  assertSessionRecoverProbeResult(result);
  return result;
}

describe("locus recovery transitions", () => {
  it.each(["planning", "execution"] as const)(
    "resumes a warm %s WU Errand before restoring its parent context",
    async (sessionType) => {
      const result = await recover(state([workUnit(sessionType), errand()], {
        kind: "resolved",
        sessionHomeRecordId: WU_RECORD,
        activeRecordId: CHILD_RECORD,
        parentRecordId: WU_RECORD,
      }));

      expect(result.recoveryFrame).toMatchObject({
        ok: true,
        value: { workflow: "run-errand", sessionType, parentRecordId: WU_RECORD },
      });
      expect(result.loadSet.ok && result.loadSet.value.entries.at(-1)?.path)
        .toBe(".arc/system/workflows/arc/supplemental/run-errand.md");
      expect("taskCursor" in result).toBe(sessionType === "execution");
    },
  );

  it("recovers an identity-free partial Errand from its live machine role", async () => {
    const result = await recover(state([workUnit("execution"), errand("partial-errand")], {
      kind: "resolved",
      sessionHomeRecordId: WU_RECORD,
      activeRecordId: CHILD_RECORD,
      parentRecordId: WU_RECORD,
    }));

    expect(result.recoveryFrame).toMatchObject({ ok: true, value: { workflow: "run-errand" } });
  });

  it("moves from a live housekeep sweep through the parent boundary to its sibling Errand", async () => {
    const duringSweep = await recover(state([workUnit("execution"), housekeep()], {
      kind: "resolved",
      sessionHomeRecordId: WU_RECORD,
      activeRecordId: CHILD_RECORD,
      parentRecordId: WU_RECORD,
    }));
    const afterSweep = await recover(state([workUnit("execution", "active")], {
      kind: "resolved",
      sessionHomeRecordId: WU_RECORD,
      activeRecordId: WU_RECORD,
      parentRecordId: null,
    }));
    const sibling = await recover(state([workUnit("execution"), errand()], {
      kind: "resolved",
      sessionHomeRecordId: WU_RECORD,
      activeRecordId: CHILD_RECORD,
      parentRecordId: WU_RECORD,
    }));

    expect(duringSweep.recoveryFrame).toMatchObject({ ok: true, value: { workflow: "drain-inbox" } });
    expect(afterSweep.recoveryFrame).toMatchObject({ ok: true, value: { workflow: "process-task-loop" } });
    expect(sibling.recoveryFrame).toMatchObject({ ok: true, value: { workflow: "run-errand" } });
  });

  it("keeps an identity-only tail outside the active recovery frame", async () => {
    const tail: LocusRowV1 = {
      ...errand(),
      kind: "identity-only",
      checkoutPath: null,
      primary: null,
      recordId: null,
      role: null,
      lease: null,
      frame: "idle",
    };
    const locusState = {
      ...state([tail], { kind: "none" }),
      primaryAvailability: { kind: "free" as const, checkoutPath: "/repo" },
    };
    const result = await recover(locusState);

    expect(result.recoveryFrame).toEqual({
      ok: true,
      value: { kind: "none", workflow: null, sessionType: null },
    });
    expect(result).not.toHaveProperty("taskCursor");
  });
});
