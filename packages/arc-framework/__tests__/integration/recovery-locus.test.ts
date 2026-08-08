/** Integration coverage for checkout-derived recovery envelope transitions. */

import { describe, expect, it } from "vitest";

import { runRecoverStatus, type SessionRecoverProbes } from "../../src/commands/status.js";
import { assertSessionRecoverProbeResult } from "../../src/commands/status/schema.js";
import type { DerivedCheckoutRow } from "../../src/lib/locus/derived-roster.js";
import type { DerivedLocusFrame } from "../../src/lib/locus/derived-reader.js";

const CLAIM = "c".repeat(32);
const LOAD_SET = {
  manifestVersion: 1 as const,
  entries: [
    { path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md", readMode: { kind: "full" as const } },
    { path: ".arc/active/tasks-demo.md", readMode: { kind: "partial-strategic" as const } },
    { path: ".arc/system/workflows/arc/process-task-loop.md", readMode: { kind: "full" as const } },
  ],
};
const CURSOR = {
  status: "found" as const,
  cursor: {
    section: { id: "2.5", title: "Recover", lineHint: 20 },
    leaf: { id: "2.5.a", title: "Resume", lineHint: 24 },
  },
};

function workUnit(): DerivedCheckoutRow {
  return {
    kind: "work-unit",
    checkout: { path: "/repo.demo", head: "a".repeat(40), branch: "feat/demo", detached: false, primary: false },
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: {
      kind: "resolved",
      metaPath: ".arc/active/meta-demo.md",
      owner: "andrew",
      branch: "feat/demo",
      sessionType: "execution",
      workflow: "process-task-loop",
      stage: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskCursor: CURSOR,
      cohortDocPath: null,
      loadSet: LOAD_SET,
    },
    lifecycleLocation: "active",
    diagnostics: [],
    subject: { kind: "work-unit", key: "demo" },
  };
}

function transient(kind: "errand" | "partial-errand" | "housekeep" = "errand"): DerivedCheckoutRow {
  const identity = kind === "errand"
    ? {
        kind: "errand" as const,
        key: "fix-one",
        claimId: CLAIM,
        protection: "full" as const,
        branch: "errand/fix-one",
        purpose: "errand" as const,
        origin: "description" as const,
        originEntry: null,
        state: "open" as const,
        savedHead: null,
        changeRequest: null,
      }
    : kind === "housekeep"
      ? {
          kind: "errand" as const,
          key: "fix-one",
          claimId: CLAIM,
          protection: "full" as const,
          branch: "errand/fix-one",
          purpose: "housekeep-routing" as const,
          state: "open" as const,
          savedHead: null,
          changeRequest: null,
        }
      : null;
  return {
    kind: "transient",
    checkout: { path: "/repo", head: "b".repeat(40), branch: "errand/fix-one", detached: false, primary: true },
    markerGeneration: `sha256:${"d".repeat(64)}`,
    parentCheckoutPath: "/repo.demo",
    origin: null,
    identity,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: kind === "partial-errand"
      ? { kind, key: "fix-one", claimId: null }
      : { kind, key: "fix-one", claimId: CLAIM },
  };
}

function frame(entering: DerivedCheckoutRow, siblings: readonly DerivedCheckoutRow[] = []): DerivedLocusFrame {
  return {
    roster: [entering, ...siblings],
    entering: { kind: "selected", row: entering },
    primaryAvailability: { kind: "occupied", checkoutPath: "/repo", subject: entering.subject! },
    identityDiscovery: { kind: "absent" },
    active: entering.kind === "work-unit" && entering.subject.kind === "work-unit" && entering.context !== null
      ? { checkoutPath: entering.checkout.path, subject: entering.subject, context: entering.context }
      : null,
  };
}

function recoverProbes(state: DerivedLocusFrame): SessionRecoverProbes {
  return {
    derivedLocusState: async () => state,
    worktree: async () => ({
      state: "clean",
      ahead: 0,
      behind: 0,
      branch: "feat/demo",
      remoteEvidence: "exact",
    }),
    worktreeIdentity: async () => ({ kind: "linked", path: state.entering.kind === "selected"
      ? state.entering.row.checkout.path
      : state.entering.checkoutPath }),
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
    releaseRouting: async () => ({
      taskCommit: "raw",
      workflowCommit: "raw",
      workflowPush: "raw",
      rationale: { releaseOptedIn: false, commitInterlock: "manual", pushInterlock: "manual" },
    }),
  };
}

async function recover(state: DerivedLocusFrame) {
  const result = await runRecoverStatus({
    identity: "andrew",
    role: "maintainer",
    workingMemoryPath: "/users/andrew/WORKING-MEMORY.md",
    probes: recoverProbes(state),
  });
  assertSessionRecoverProbeResult(result);
  return result;
}

describe("checkout-derived recovery transitions", () => {
  it.each(["errand", "partial-errand", "housekeep"] as const)(
    "resumes a warm %s before restoring parent WU context",
    async (kind) => {
      const result = await recover(frame(transient(kind), [workUnit()]));
      expect(result.recoveryFrame).toMatchObject({
        ok: true,
        value: {
          subject: { kind },
          checkoutPath: "/repo",
          parentCheckoutPath: "/repo.demo",
          workflow: kind === "housekeep" ? "drain-inbox" : "run-errand",
          sessionType: "execution",
        },
      });
      expect("taskCursor" in result).toBe(true);
    },
  );

  it("recovers the current WU directly after a transient leaves", async () => {
    const result = await recover(frame(workUnit()));
    expect(result.recoveryFrame).toMatchObject({
      ok: true,
      value: { subject: { kind: "work-unit", key: "demo" }, workflow: "process-task-loop" },
    });
  });

  it("falls back to base when a warm parent path no longer resolves", async () => {
    const result = await recover(frame(transient()));
    expect(result.recoveryFrame).toMatchObject({
      ok: true,
      value: { parentCheckoutPath: "/repo.demo", sessionType: null },
    });
    expect(result.locusGuidance).toMatchObject({ kind: "ready" });
    if (result.locusGuidance.kind === "ready") {
      expect(result.locusGuidance.recovery).toContain("return to base");
    }
  });

  it("narrates return to base when the named parent has no resumable workflow", async () => {
    const resolvedParent = workUnit();
    const parent: DerivedCheckoutRow = {
      ...resolvedParent,
      context: { ...resolvedParent.context!, workflow: null },
    };
    const result = await recover(frame(transient(), [parent]));
    expect(result.recoveryFrame).toMatchObject({
      ok: true,
      value: { parentCheckoutPath: "/repo.demo", sessionType: null },
    });
    expect(result.locusGuidance).toMatchObject({
      kind: "ready",
      recovery: expect.stringContaining("return to base"),
    });
  });

  it("keeps malformed siblings outside the active recovery frame", async () => {
    const malformed: DerivedCheckoutRow = {
      ...workUnit(),
      kind: "unresolved-checkout",
      checkout: { path: "/bad", head: "e".repeat(40), branch: null, detached: true, primary: false },
      context: null,
      subject: null,
      diagnostics: [{ code: "marker-unreadable", message: "bad sibling" }],
    };
    const result = await recover(frame(workUnit(), [malformed]));
    expect(result.recoveryFrame).toMatchObject({ ok: true, value: { checkoutPath: "/repo.demo" } });
  });
});
