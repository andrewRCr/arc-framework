/**
 * Unit tests for the composite `arc status` orchestrator.
 *
 * Covers orchestration-only behavior with mocked probe helpers — all four
 * invoked, parallel via `Promise.all`, stable result ordering, per-probe
 * error isolation, and identity-missing short-circuit on the user slot.
 *
 * Real I/O behavior of the individual probes is covered by their own
 * integration tests; the end-to-end composite wiring is covered by
 * `__tests__/integration/status.test.ts`.
 */

import { describe, it, expect, vi } from "vitest";

import {
  runSessionHandoffStatus,
  runSessionInitStatus,
  runStatus,
} from "../../../src/commands/status.js";
import type {
  HandoffSyncInterlock,
  SessionHandoffProbes,
  SessionInitProbes,
  StatusProbes,
} from "../../../src/commands/status.js";
import type {
  ActiveSessionInitResult,
  ActiveStatusResult,
} from "../../../src/commands/active/types.js";
import type {
  ConfigSessionInitResult,
  ConfigStatusResult,
} from "../../../src/commands/config/types.js";
import type { DomainRulesSessionInitResult } from "../../../src/commands/constitution/types.js";
import type {
  ExtensionsSessionInitResult,
  ExtensionsStatusResult,
} from "../../../src/commands/extensions/types.js";
import type {
  UserIOContext,
  UserSessionInitStatusResult,
  UserStatusResult,
} from "../../../src/commands/user/types.js";
import { runUserSessionInitStatus } from "../../../src/commands/user.js";
import type { DirtyStateResult } from "../../../src/lib/git/dirty-state.js";
import type { HeadHashResult } from "../../../src/lib/git/head-hash.js";
import type { PushabilityResult } from "../../../src/lib/git/pushability.js";
import type { WorktreeSyncStatusResult } from "../../../src/lib/git/worktree-sync.js";
import type { WorktreeRosterResult } from "../../../src/lib/git/worktree-roster.js";
import type { WorktreeIdentity } from "../../../src/lib/git/worktree-identity.js";
import type { CascadeResolution } from "../../../src/lib/session-init/branch-gone-cascade.js";
import type { StaleWorktreeSweepResult } from "../../../src/lib/session-init/stale-worktree-sweep.js";
import type { RetiredSubdirDetectionResult } from "../../../src/lib/session-init/retired-subdir-detection.js";
import type { ErrandStalenessSweepResult } from "../../../src/lib/session-init/errand-staleness-sweep.js";
import type { InboxStateResult } from "../../../src/lib/session-init/inbox-state.js";
import type { RestateCandidatesResult } from "../../../src/lib/handoff/restate-candidates.js";
import type { ReleaseRoutingValue } from "../../../src/lib/release/routing.js";

// --- Fixtures ---

function userResult(overrides: Partial<UserStatusResult> = {}): UserStatusResult {
  return {
    identity: "andrew",
    spineState: "clean",
    headline: "git note up to date",
    remoteStatus: "in sync",
    diskStatus: "current",
    summary: "andrew: git note up to date",
    actionHint: null,
    detailLines: [],
    remoteChecked: true,
    refState: "same",
    diskState: "same",
    savedCommit: "abc1234",
    savedFromAncestor: false,
    ancestorDistance: 0,
    savedAtRelative: null,
    unsavedDirection: null,
    backupFiles: [],
    remoteIdentities: [],
    ...overrides,
  };
}

function extensionsResult(overrides: Partial<ExtensionsStatusResult> = {}): ExtensionsStatusResult {
  return {
    mode: "full",
    extensions: [],
    activeCount: 0,
    inactiveCount: 0,
    orphanCount: 0,
    orphans: [],
    includeOrphanDetails: false,
    warnings: [],
    ...overrides,
  };
}

function configResult(overrides: Partial<ConfigStatusResult> = {}): ConfigStatusResult {
  return {
    mode: "full",
    settings: {
      "branch.base": "main",
      "branch.protection": "partial",
      "worktree.location_template": "../{repo}.{branch}",
      "commit.format": "conventional",
      "commit.context_footer": "required",
      "commit.custom_pattern": "",
      "commit.context_pattern": "",
      "merge.strategy": "merge",
      "review.pre_merge": "enabled",
      "platform.type": "github",
      "pm.mode": "none",
      "team.mode": "false",
      "session.remote_sync": "enabled",
      "session.init_pull.worktree": "prompt",
      "session.init_pull.notes": "prompt",
      "session.init_load.notes": "prompt",
      "archive.cadence": "with-integration",
      "user.notes_push": "on-sync",
      "errands.staleness_days": "3",
    },
    defaultsApplied: [],
    warnings: [],
    ...overrides,
  };
}

function activeResult(overrides: Partial<ActiveStatusResult> = {}): ActiveStatusResult {
  return {
    mode: "full",
    layout: "full",
    candidates: [],
    warnings: [],
    ...overrides,
  };
}

function userSessionInit(
  overrides: Partial<UserSessionInitStatusResult> = {},
): UserSessionInitStatusResult {
  return {
    identity: "andrew",
    state: "clean",
    summary: "andrew: session-init remote state clean",
    detailLines: ["Remote notes match local notes."],
    actionHint: null,
    shouldPromptToPull: false,
    ...overrides,
  };
}

function extensionsSessionInit(
  overrides: Partial<ExtensionsSessionInitResult> = {},
): ExtensionsSessionInitResult {
  return { mode: "session-init", active: [], warnings: [], ...overrides };
}

function worktreeSync(
  overrides: Partial<WorktreeSyncStatusResult> = {},
): WorktreeSyncStatusResult {
  return { state: "clean", ahead: 0, behind: 0, branch: "main", ...overrides };
}

function worktreeIdentity(value: WorktreeIdentity = { kind: "primary" }): WorktreeIdentity {
  return value;
}

function rosterResult(overrides: Partial<WorktreeRosterResult> = {}): WorktreeRosterResult {
  return { entries: [], warnings: [], ...overrides };
}

function configSessionInit(
  overrides: Partial<ConfigSessionInitResult> = {},
): ConfigSessionInitResult {
  return {
    mode: "session-init",
    settings: {
      "session.remote_sync": "enabled",
      "session.init_pull.worktree": "prompt",
      "session.init_pull.notes": "prompt",
      "session.init_load.notes": "prompt",
      "user.notes_push": "on-sync",
      "branch.protection": "partial",
      "pm.mode": "none",
      "commit.format": "conventional",
      "commit.context_footer": "required",
      "commit.interlock": "manual",
      "push.interlock": "manual",
    },
    defaultsApplied: [],
    warnings: [],
    ...overrides,
  };
}

function activeSessionInit(
  overrides: Partial<ActiveSessionInitResult> = {},
): ActiveSessionInitResult {
  return {
    mode: "session-init",
    layout: "full",
    resolution: "none",
    path: null,
    candidates: [],
    sessionType: "planning",
    warnings: [],
    ...overrides,
  };
}

function domainRulesSessionInit(
  overrides: Partial<DomainRulesSessionInitResult> = {},
): DomainRulesSessionInitResult {
  return { mode: "session-init", rules: [], warnings: [], ...overrides };
}

const STALE_NOTE_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD_COMMIT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NOTE_HISTORY_COMMIT = "cccccccccccccccccccccccccccccccccccccccc";
const USER_NOTES_REF = "refs/notes/arc/user/andrew";

function notePathFor(commit: string): string {
  return `${commit.slice(0, 2)}/${commit.slice(2)}`;
}

function staleLocalNoteIO(): UserIOContext {
  const sameRefHash = "dddddddddddddddddddddddddddddddddddddddd";
  return {
    exec: vi.fn(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return { stdout: `${sameRefHash}\n`, stderr: "" };
      }
      if (args[0] === "ls-remote") {
        return { stdout: `${sameRefHash}\t${USER_NOTES_REF}\n`, stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: `${HEAD_COMMIT}\n`, stderr: "" };
      }
      if (args[0] === "log") {
        return { stdout: `${NOTE_HISTORY_COMMIT}\n`, stderr: "" };
      }
      if (args[0] === "diff-tree") {
        return { stdout: `${notePathFor(STALE_NOTE_COMMIT)}\n`, stderr: "" };
      }
      if (args[0] === "show") {
        return { stdout: JSON.stringify({ version: 2, files: {} }), stderr: "" };
      }
      if (args[0] === "merge-base") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "rev-list") {
        return { stdout: "2\n", stderr: "" };
      }
      throw new Error(`unexpected command: git ${args.join(" ")}`);
    }),
    readDir: vi.fn(async () => []),
    readFile: vi.fn(async () => ""),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    writeNote: vi.fn(async () => undefined),
    readNote: vi.fn(async () => null),
  };
}

function fullProbes(overrides: Partial<StatusProbes> = {}): StatusProbes {
  return {
    user: vi.fn(async () => userResult()),
    extensions: vi.fn(async () => extensionsResult()),
    config: vi.fn(async () => configResult()),
    active: vi.fn(async () => activeResult()),
    ...overrides,
  };
}

function sessionInitProbes(overrides: Partial<SessionInitProbes> = {}): SessionInitProbes {
  return {
    user: vi.fn(async () => userSessionInit()),
    worktree: vi.fn(async () => worktreeSync()),
    worktreeIdentity: vi.fn(async () => worktreeIdentity()),
    dirty: vi.fn(async () => dirtyState()),
    extensions: vi.fn(async () => extensionsSessionInit()),
    config: vi.fn(async () => configSessionInit()),
    active: vi.fn(async () => activeSessionInit()),
    domainRules: vi.fn(async () => domainRulesSessionInit()),
    releaseRouting: vi.fn(async () => releaseRouting()),
    roster: vi.fn(async () => rosterResult()),
    recovery: vi.fn(async (): Promise<CascadeResolution> => ({ kind: "main-fallback" })),
    sweep: vi.fn(async (): Promise<StaleWorktreeSweepResult> => ({ worktrees: [], warnings: [] })),
    retiredSubdirs: vi.fn(async (): Promise<RetiredSubdirDetectionResult> => ({ candidates: [] })),
    errandSweep: vi.fn(async (): Promise<ErrandStalenessSweepResult> => ({ stale: [] })),
    inboxState: vi.fn(async (): Promise<InboxStateResult> => ({ routableCount: 0, housekeepNeeded: false })),
    ...overrides,
  };
}

function dirtyState(overrides: Partial<DirtyStateResult> = {}): DirtyStateResult {
  return { state: "clean", fileCount: 0, ...overrides };
}

function handoffSyncInterlock(
  overrides: Partial<HandoffSyncInterlock> = {},
): HandoffSyncInterlock {
  return { value: "on-handoff", source: "default", ...overrides };
}

function headHash(overrides: Partial<HeadHashResult> = {}): HeadHashResult {
  return { hash: "a1b2c3d", ...overrides };
}

function restateCandidates(
  overrides: Partial<RestateCandidatesResult> = {},
): RestateCandidatesResult {
  return {
    commitsSinceHandoff: [],
    tasksClosedSinceHandoff: [],
    noteFileChangesSinceHandoff: [],
    ...overrides,
  };
}

function releaseRouting(overrides: Partial<ReleaseRoutingValue> = {}): ReleaseRoutingValue {
  return {
    taskCommit: "raw",
    workflowCommit: "raw",
    workflowPush: "raw",
    rationale: {
      releaseOptedIn: false,
      commitInterlock: "manual",
      pushInterlock: "manual",
    },
    ...overrides,
  };
}

function sessionHandoffProbes(
  overrides: Partial<SessionHandoffProbes> = {},
): SessionHandoffProbes {
  return {
    dirty: vi.fn(async () => dirtyState()),
    worktree: vi.fn(async () => worktreeSync()),
    user: vi.fn(async () => userSessionInit()),
    syncInterlock: vi.fn(async () => handoffSyncInterlock()),
    active: vi.fn(async () => activeSessionInit()),
    head: vi.fn(async () => headHash()),
    pushability: vi.fn(async () => ({ allowed: true, conditions: [] })),
    restateCandidates: vi.fn(async () => restateCandidates()),
    releaseRouting: vi.fn(async () => releaseRouting()),
    ...overrides,
  };
}

// --- Tests ---

describe("runStatus — orchestration", () => {
  it("invokes every probe helper exactly once", async () => {
    const probes = fullProbes();
    await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.user).toHaveBeenCalledTimes(1);
    expect(probes.extensions).toHaveBeenCalledTimes(1);
    expect(probes.config).toHaveBeenCalledTimes(1);
    expect(probes.active).toHaveBeenCalledTimes(1);
    expect(probes.user).toHaveBeenCalledWith("andrew");
  });

  it("starts all probes concurrently via Promise.all", async () => {
    // Deterministic parallelism check — record peak in-flight count. With
    // `Promise.all` over four probes, each probe's body runs synchronously
    // up to the first `await`, so all four increment `inFlight` before any
    // microtask resolves. Sequential execution would peak at 1.
    let inFlight = 0;
    let peakInFlight = 0;
    function tracked<T>(value: T): () => Promise<T> {
      return async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return value;
      };
    }
    const probes = fullProbes({
      user: tracked(userResult()),
      extensions: tracked(extensionsResult()),
      config: tracked(configResult()),
      active: tracked(activeResult()),
    });
    await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(peakInFlight).toBe(4);
  });

  it("returns the full set of expected slots", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(Object.keys(result).sort()).toEqual(
      ["active", "config", "extensions", "identity", "mode", "user"],
    );
  });

  it("wraps successful probe results as ok=true slots", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.user.ok).toBe(true);
    expect(result.extensions.ok).toBe(true);
    expect(result.config.ok).toBe(true);
    expect(result.active.ok).toBe(true);
    if (result.user.ok) expect(result.user.value.headline).toBe("git note up to date");
  });

  it("carries top-level identity pointers without mutation", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.identity).toEqual({ identity: "andrew", role: "maintainer" });
  });

  it("preserves null identity/role values", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: null, role: null, probes });
    expect(result.identity).toEqual({ identity: null, role: null });
  });
});

describe("runStatus — identity-missing short-circuit", () => {
  it("skips the user probe when identity is null and wraps the slot as identity-missing", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: null, role: "maintainer", probes });
    expect(probes.user).not.toHaveBeenCalled();
    expect(result.user.ok).toBe(false);
    if (!result.user.ok) {
      expect(result.user.error.kind).toBe("identity-missing");
      expect(result.user.error.message).toMatch(/arc\.identity/u);
    }
  });

  it("still invokes the other three probes when identity is null", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: null, role: null, probes });
    expect(probes.extensions).toHaveBeenCalledTimes(1);
    expect(probes.config).toHaveBeenCalledTimes(1);
    expect(probes.active).toHaveBeenCalledTimes(1);
    expect(result.extensions.ok).toBe(true);
    expect(result.config.ok).toBe(true);
    expect(result.active.ok).toBe(true);
  });
});

describe("runStatus — per-probe error isolation", () => {
  it("wraps a rejecting probe as ok=false runtime error without aborting the composite", async () => {
    const probes = fullProbes({
      extensions: async () => {
        throw new Error("extensions dir missing");
      },
    });
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.extensions.ok).toBe(false);
    if (!result.extensions.ok) {
      expect(result.extensions.error.kind).toBe("runtime");
      expect(result.extensions.error.message).toBe("extensions dir missing");
    }
    // Other slots unaffected
    expect(result.user.ok).toBe(true);
    expect(result.config.ok).toBe(true);
    expect(result.active.ok).toBe(true);
  });

  it("isolates non-Error rejection values via String coercion", async () => {
    const probes = fullProbes({
      config: async () => {
        throw "not-an-error-instance";
      },
    });
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.config.ok).toBe(false);
    if (!result.config.ok) {
      expect(result.config.error.message).toBe("not-an-error-instance");
    }
  });

  it("does not throw when every probe rejects", async () => {
    const probes = fullProbes({
      user: async () => { throw new Error("u"); },
      extensions: async () => { throw new Error("e"); },
      config: async () => { throw new Error("c"); },
      active: async () => { throw new Error("a"); },
    });
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.user.ok).toBe(false);
    expect(result.extensions.ok).toBe(false);
    expect(result.config.ok).toBe(false);
    expect(result.active.ok).toBe(false);
  });
});

describe("runSessionInitStatus — orchestration", () => {
  it("invokes every session-init probe helper exactly once", async () => {
    const probes = sessionInitProbes();
    await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.user).toHaveBeenCalledTimes(1);
    expect(probes.worktree).toHaveBeenCalledTimes(1);
    expect(probes.worktreeIdentity).toHaveBeenCalledTimes(1);
    expect(probes.dirty).toHaveBeenCalledTimes(1);
    expect(probes.extensions).toHaveBeenCalledTimes(1);
    expect(probes.config).toHaveBeenCalledTimes(1);
    expect(probes.active).toHaveBeenCalledTimes(1);
    expect(probes.domainRules).toHaveBeenCalledTimes(1);
    expect(probes.releaseRouting).toHaveBeenCalledTimes(1);
  });

  it("exposes the domainRules slot with ok=true on success", async () => {
    const probes = sessionInitProbes({
      domainRules: vi.fn(async () =>
        domainRulesSessionInit({
          rules: [
            {
              path: ".arc/system/rules/DEV-RULES.FRONTEND.md",
              domain: "frontend",
              purpose: "UI standards",
            },
          ],
        }),
      ),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.domainRules.ok).toBe(true);
    if (result.domainRules.ok) {
      expect(result.domainRules.value.rules).toHaveLength(1);
      expect(result.domainRules.value.rules[0]?.domain).toBe("frontend");
    }
  });

  it("wraps a rejecting domainRules probe as ok=false runtime error; other slots unaffected", async () => {
    const probes = sessionInitProbes({
      domainRules: async () => {
        throw new Error("constitution dir missing");
      },
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.domainRules.ok).toBe(false);
    if (!result.domainRules.ok) {
      expect(result.domainRules.error.kind).toBe("runtime");
      expect(result.domainRules.error.message).toBe("constitution dir missing");
    }
    expect(result.user.ok).toBe(true);
    expect(result.extensions.ok).toBe(true);
    expect(result.config.ok).toBe(true);
    expect(result.active.ok).toBe(true);
  });

  it("exposes the releaseRouting slot with ok=true on success", async () => {
    const probes = sessionInitProbes({
      releaseRouting: vi.fn(async () =>
        releaseRouting({
          taskCommit: "wrapper",
          workflowCommit: "raw",
          workflowPush: "wrapper",
          rationale: {
            releaseOptedIn: true,
            commitInterlock: "on-task-approval",
            pushInterlock: "on-workflow",
          },
        }),
      ),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.releaseRouting.ok).toBe(true);
    if (result.releaseRouting.ok) {
      expect(result.releaseRouting.value).toEqual({
        taskCommit: "wrapper",
        workflowCommit: "raw",
        workflowPush: "wrapper",
        rationale: {
          releaseOptedIn: true,
          commitInterlock: "on-task-approval",
          pushInterlock: "on-workflow",
        },
      });
    }
  });

  it("returns the session-init-scoped shape with mode=session-init", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.mode).toBe("session-init");
    if (result.user.ok) expect(result.user.value.state).toBe("clean");
    if (result.active.ok) expect(result.active.value.resolution).toBe("none");
    if (result.config.ok) {
      expect(Object.keys(result.config.value.settings).sort()).toEqual([
        "branch.protection",
        "commit.context_footer",
        "commit.format",
        "commit.interlock",
        "pm.mode",
        "push.interlock",
        "session.init_load.notes",
        "session.init_pull.notes",
        "session.init_pull.worktree",
        "session.remote_sync",
        "user.notes_push",
      ]);
    }
  });

  it("short-circuits the user slot with identity-missing when identity is null", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({ identity: null, role: null, probes });
    expect(probes.user).not.toHaveBeenCalled();
    expect(result.user.ok).toBe(false);
    if (!result.user.ok) expect(result.user.error.kind).toBe("identity-missing");
  });

  it("wraps a rejecting session-init probe as ok=false runtime error", async () => {
    const probes = sessionInitProbes({
      active: async () => { throw new Error("boom"); },
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.active.ok).toBe(false);
    if (!result.active.ok) {
      expect(result.active.error.kind).toBe("runtime");
      expect(result.active.error.message).toBe("boom");
    }
  });
});

describe("runSessionInitStatus — worktree slot + user qualifier", () => {
  it("includes the worktree slot with state and counts on every invocation", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "remote-ahead", ahead: 0, behind: 3 })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.worktree).toHaveBeenCalledTimes(1);
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.state).toBe("remote-ahead");
      expect(result.worktree.value.ahead).toBe(0);
      expect(result.worktree.value.behind).toBe(3);
    }
  });

  it("folds linked worktree identity onto the worktree slot with its path", async () => {
    const probes = sessionInitProbes({
      worktreeIdentity: vi.fn(async () =>
        worktreeIdentity({ kind: "linked", path: "/Users/dev/arc-wu-b" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.identity).toEqual({
        kind: "linked",
        path: "/Users/dev/arc-wu-b",
      });
    }
  });

  it("folds primary worktree identity onto the worktree slot (no surface)", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.identity).toEqual({ kind: "primary" });
    }
  });

  it("defaults identity to primary when the identity probe fails; worktree slot still resolves", async () => {
    const probes = sessionInitProbes({
      worktreeIdentity: async () => { throw new Error("rev-parse failed"); },
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.identity).toEqual({ kind: "primary" });
      expect(result.worktree.value.state).toBe("clean");
    }
  });

  it("attaches qualifier 'clean-at-current-head' when worktree=remote-ahead and user=clean", async () => {
    const probes = sessionInitProbes({
      user: vi.fn(async () => userSessionInit({ state: "clean" })),
      worktree: vi.fn(async () => worktreeSync({ state: "remote-ahead", behind: 2 })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.qualifier).toBe("clean-at-current-head");
    }
  });

  it("omits the qualifier (not null) when worktree=clean and user=clean", async () => {
    const probes = sessionInitProbes({
      user: vi.fn(async () => userSessionInit({ state: "clean" })),
      worktree: vi.fn(async () => worktreeSync({ state: "clean" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect("qualifier" in result.user.value).toBe(false);
    }
  });

  it("runs the user probe independently when worktree is diverged", async () => {
    const probes = sessionInitProbes({
      user: vi.fn(async () => userSessionInit({ state: "remote-ahead" })),
      worktree: vi.fn(async () => worktreeSync({ state: "diverged", ahead: 1, behind: 2 })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.user).toHaveBeenCalledTimes(1);
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.state).toBe("remote-ahead");
      // qualifier reserved for the clean-at-current-head pattern only
      expect(result.user.value.qualifier).toBeUndefined();
    }
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) expect(result.worktree.value.state).toBe("diverged");
  });

  it("runs the user probe independently when worktree is remote-unavailable", async () => {
    const probes = sessionInitProbes({
      user: vi.fn(async () => userSessionInit({ state: "clean" })),
      worktree: vi.fn(async () =>
        worktreeSync({ state: "remote-unavailable", failureReason: "timeout" }),
      ),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.user).toHaveBeenCalledTimes(1);
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.state).toBe("clean");
      // No qualifier — worktree never resolved a remote-ahead verdict
      expect(result.user.value.qualifier).toBeUndefined();
    }
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.state).toBe("remote-unavailable");
      expect(result.worktree.value.failureReason).toBe("timeout");
    }
  });

  it("propagates session.remote_sync: disabled to both worktree and user fields consistently", async () => {
    const probes = sessionInitProbes({
      user: vi.fn(async () => userSessionInit({ state: "disabled" })),
      worktree: vi.fn(async () => worktreeSync({ state: "skipped" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.state).toBe("disabled");
      expect(result.user.value.qualifier).toBeUndefined();
    }
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) expect(result.worktree.value.state).toBe("skipped");
  });

  it("keeps the envelope additive — every always-present slot remains present", async () => {
    // Linked-worktree clean-resume state (active WU resolved, worktree clean) so
    // the conditional roster / recovery / sweep slots all stay absent — this
    // asserts the stable always-present set.
    const probes = sessionInitProbes({
      active: vi.fn(async () =>
        activeSessionInit({ resolution: "single", path: ".arc/active/meta-x.md" })),
      worktreeIdentity: vi.fn(async () =>
        worktreeIdentity({ kind: "linked", path: "/wt/x" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(Object.keys(result).sort()).toEqual([
      "active",
      "config",
      "dirty",
      "domainRules",
      "errandSweep",
      "extensions",
      "identity",
      "inboxState",
      "mode",
      "recommendedCombinedPrompt",
      "releaseRouting",
      "retiredSubdirs",
      "user",
      "worktree",
    ]);
  });
});

describe("runSessionInitStatus — recommended actions", () => {
  it("attaches recommendedAction=skip with empty prompt text on a clean worktree", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.recommendedAction).toBe("skip");
      expect(result.worktree.value.recommendedPromptText).toBe("");
    }
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.recommendedAction).toBe("skip");
    }
    expect(result.recommendedCombinedPrompt).toBeNull();
  });

  it("threads worktree remote-ahead + prompt policy into recommendedAction=prompt", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "remote-ahead", behind: 4 })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    if (result.worktree.ok) {
      expect(result.worktree.value.recommendedAction).toBe("prompt");
      expect(result.worktree.value.recommendedPromptText).toContain("4");
      expect(result.worktree.value.recommendedPromptText).toContain("Worktree");
    }
  });

  it("threads dirty-tree state into the prompt text warning", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "remote-ahead", behind: 1 })),
      dirty: vi.fn(async () => dirtyState({ state: "dirty", fileCount: 3 })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    if (result.worktree.ok) {
      expect(result.worktree.value.recommendedPromptText).toContain(
        "Working tree dirty",
      );
    }
    expect(result.dirty.ok).toBe(true);
    if (result.dirty.ok) {
      expect(result.dirty.value.state).toBe("dirty");
      expect(result.dirty.value.fileCount).toBe(3);
    }
  });

  it("composes recommendedCombinedPrompt when both channels prompt", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "remote-ahead", behind: 2 })),
      user: vi.fn(async () => userSessionInit({ state: "remote-ahead" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.recommendedCombinedPrompt).not.toBeNull();
    expect(result.recommendedCombinedPrompt).toContain("Worktree");
    expect(result.recommendedCombinedPrompt).toContain("Notes");
    expect(result.recommendedCombinedPrompt).toContain(
      "Pull both / worktree only / notes only / skip?",
    );
  });

  it("manual notes policy + remote-ahead → recommendedAction=surface", async () => {
    const probes = sessionInitProbes({
      user: vi.fn(async () => userSessionInit({ state: "remote-ahead" })),
      config: vi.fn(async () =>
        configSessionInit({
          settings: {
            ...configSessionInit().settings,
            "session.init_pull.notes": "manual",
          },
        }),
      ),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    if (result.user.ok) {
      expect(result.user.value.recommendedAction).toBe("surface");
      expect(result.user.value.recommendedPromptText).toBe("");
    }
    expect(result.recommendedCombinedPrompt).toBeNull();
  });

  it("always notes policy + remote-ahead → recommendedAction=pull", async () => {
    const probes = sessionInitProbes({
      user: vi.fn(async () => userSessionInit({ state: "remote-ahead" })),
      config: vi.fn(async () =>
        configSessionInit({
          settings: {
            ...configSessionInit().settings,
            "session.init_pull.notes": "always",
          },
        }),
      ),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    if (result.user.ok) {
      expect(result.user.value.recommendedAction).toBe("pull");
    }
  });

  it("identity-missing → user slot recommendedAction skipped at orchestrator boundary", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "remote-ahead", behind: 2 })),
    });
    const result = await runSessionInitStatus({ identity: null, role: null, probes });
    expect(result.user.ok).toBe(false);
    if (result.worktree.ok) {
      expect(result.worktree.value.recommendedAction).toBe("prompt");
    }
    expect(result.recommendedCombinedPrompt).toBeNull();
  });

  it("falls back to skip-everything when a required input slot fails", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "remote-ahead", behind: 2 })),
      dirty: async () => { throw new Error("porcelain failed"); },
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.dirty.ok).toBe(false);
    if (result.worktree.ok) {
      expect(result.worktree.value.recommendedAction).toBe("skip");
      expect(result.worktree.value.recommendedPromptText).toBe("");
    }
    expect(result.recommendedCombinedPrompt).toBeNull();
  });
});

describe("runSessionInitStatus — in-flight roster gating", () => {
  const cleanResume = {
    worktree: () => worktreeSync({ state: "clean" }),
    active: () => activeSessionInit({ resolution: "single", path: ".arc/active/meta-x.md" }),
  };

  it("fires the roster and exposes the slot when the worktree state is branch-gone", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "branch-gone", branch: "feat/x" })),
      active: vi.fn(async () => cleanResume.active()),
      roster: vi.fn(async () =>
        rosterResult({ entries: [{ worktreePath: "/wt", branch: "feat/x" }] })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.roster).toHaveBeenCalledTimes(1);
    expect(result.roster?.ok).toBe(true);
    if (result.roster?.ok) {
      expect(result.roster.value.entries[0]?.branch).toBe("feat/x");
    }
  });

  it("fires the roster when no active WU is resolved (resolution=none)", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "clean" })),
      active: vi.fn(async () => activeSessionInit({ resolution: "none", path: null })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.roster).toHaveBeenCalledTimes(1);
    expect(result.roster?.ok).toBe(true);
  });

  it("omits the roster slot and never scans on the linked-worktree resume path", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => cleanResume.worktree()),
      active: vi.fn(async () => cleanResume.active()),
      worktreeIdentity: vi.fn(async () =>
        worktreeIdentity({ kind: "linked", path: "/wt/x" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.roster).not.toHaveBeenCalled();
    expect("roster" in result).toBe(false);
  });

  it("fires the roster in the primary worktree even on the clean resume path (the sweep gate)", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => cleanResume.worktree()),
      active: vi.fn(async () => cleanResume.active()),
      worktreeIdentity: vi.fn(async () => worktreeIdentity({ kind: "primary" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.roster).toHaveBeenCalledTimes(1);
    expect(result.roster?.ok).toBe(true);
  });

  it("wraps a rejecting roster probe as ok=false without rejecting the composite", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "branch-gone", branch: "feat/x" })),
      active: vi.fn(async () => cleanResume.active()),
      roster: async () => { throw new Error("worktree list failed"); },
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.roster?.ok).toBe(false);
    if (result.roster && !result.roster.ok) {
      expect(result.roster.error.kind).toBe("runtime");
      expect(result.roster.error.message).toBe("worktree list failed");
    }
    // Sibling slots unaffected — the composite still resolves.
    expect(result.worktree.ok).toBe(true);
    expect(result.active.ok).toBe(true);
  });

  it("does not fire the roster when the gating slots themselves failed to resolve", async () => {
    const probes = sessionInitProbes({
      worktree: async () => { throw new Error("worktree probe boom"); },
      active: async () => { throw new Error("active probe boom"); },
      // Linked worktree so the primary-worktree (sweep) arm is also off; only
      // the failed branch-gone / no-WU gates remain, and neither can fire.
      worktreeIdentity: vi.fn(async () =>
        worktreeIdentity({ kind: "linked", path: "/wt/x" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.roster).not.toHaveBeenCalled();
    expect("roster" in result).toBe(false);
  });
});

describe("runSessionInitStatus — branch-gone recovery gating", () => {
  it("fires recovery on branch-gone, passing the resolved roster and current branch", async () => {
    const rosterValue = rosterResult({ entries: [{ worktreePath: "/wt", branch: "feat/a" }] });
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "branch-gone", branch: "feat/gone" })),
      roster: vi.fn(async () => rosterValue),
      recovery: vi.fn(async (): Promise<CascadeResolution> => ({
        kind: "resolved",
        candidate: { branch: "feat/a", worktreePath: "/wt", proposedAction: "switch" },
      })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.recovery).toHaveBeenCalledTimes(1);
    expect(probes.recovery).toHaveBeenCalledWith(rosterValue, "feat/gone");
    expect(result.recovery?.ok).toBe(true);
    if (result.recovery?.ok) expect(result.recovery.value.kind).toBe("resolved");
  });

  it("does not fire recovery on the no-WU path — recovery is branch-gone only", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "clean" })),
      active: vi.fn(async () => activeSessionInit({ resolution: "none", path: null })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    // Roster fires on no-WU, but recovery is gated strictly on branch-gone.
    expect(probes.roster).toHaveBeenCalledTimes(1);
    expect(probes.recovery).not.toHaveBeenCalled();
    expect("recovery" in result).toBe(false);
  });

  it("omits recovery on the clean resume path", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "clean" })),
      active: vi.fn(async () =>
        activeSessionInit({ resolution: "single", path: ".arc/active/meta-x.md" })),
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(probes.recovery).not.toHaveBeenCalled();
    expect("recovery" in result).toBe(false);
  });

  it("skips recovery when the roster probe failed on branch-gone (recovery needs the roster)", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "branch-gone", branch: "feat/gone" })),
      roster: async () => { throw new Error("roster scan failed"); },
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.roster?.ok).toBe(false);
    expect(probes.recovery).not.toHaveBeenCalled();
    expect("recovery" in result).toBe(false);
  });
});

describe("runSessionInitStatus — stale-worktree sweep gating", () => {
  const primaryClean = {
    worktree: () => worktreeSync({ state: "clean" }),
    active: () => activeSessionInit({ resolution: "single", path: ".arc/active/meta-x.md" }),
    worktreeIdentity: () => worktreeIdentity({ kind: "primary" }),
  };

  it("fires the sweep in the primary worktree, passing the resolved roster and identity", async () => {
    const rosterValue = rosterResult({ entries: [{ worktreePath: "/wt", branch: "feat/shipped" }] });
    const sweepValue: StaleWorktreeSweepResult = {
      worktrees: [{ worktreePath: "/wt", branch: "feat/shipped", decision: { action: "removable" } }],
      warnings: [],
    };
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => primaryClean.worktree()),
      active: vi.fn(async () => primaryClean.active()),
      worktreeIdentity: vi.fn(async () => primaryClean.worktreeIdentity()),
      roster: vi.fn(async () => rosterValue),
      sweep: vi.fn(async () => sweepValue),
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.sweep).toHaveBeenCalledTimes(1);
    expect(probes.sweep).toHaveBeenCalledWith(rosterValue, { kind: "primary" });
    expect(result.sweep?.ok).toBe(true);
    if (result.sweep?.ok) {
      expect(result.sweep.value.worktrees[0]?.decision).toEqual({ action: "removable" });
    }
  });

  it("omits the sweep in a linked worktree (the resume path never sweeps)", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => primaryClean.worktree()),
      active: vi.fn(async () => primaryClean.active()),
      worktreeIdentity: vi.fn(async () =>
        worktreeIdentity({ kind: "linked", path: "/wt/x" })),
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.sweep).not.toHaveBeenCalled();
    expect("sweep" in result).toBe(false);
  });

  it("skips the sweep when the roster probe failed in the primary worktree", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => primaryClean.worktree()),
      active: vi.fn(async () => primaryClean.active()),
      worktreeIdentity: vi.fn(async () => primaryClean.worktreeIdentity()),
      roster: async () => { throw new Error("roster scan failed"); },
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.roster?.ok).toBe(false);
    expect(probes.sweep).not.toHaveBeenCalled();
    expect("sweep" in result).toBe(false);
  });

  it("wraps a rejecting sweep probe as ok=false without rejecting the composite", async () => {
    const probes = sessionInitProbes({
      worktree: vi.fn(async () => primaryClean.worktree()),
      active: vi.fn(async () => primaryClean.active()),
      worktreeIdentity: vi.fn(async () => primaryClean.worktreeIdentity()),
      roster: vi.fn(async () =>
        rosterResult({ entries: [{ worktreePath: "/wt", branch: "feat/shipped" }] })),
      sweep: async () => { throw new Error("sweep boom"); },
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.sweep?.ok).toBe(false);
    if (result.sweep && !result.sweep.ok) {
      expect(result.sweep.error.message).toBe("sweep boom");
    }
    expect(result.worktree.ok).toBe(true);
  });
});

describe("runSessionInitStatus — retired-subdir detection slot", () => {
  it("fires the detection when identity resolved, passing the identity", async () => {
    const probes = sessionInitProbes({
      retiredSubdirs: vi.fn(async () => ({ candidates: ["old-wu"] })),
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.retiredSubdirs).toHaveBeenCalledWith("andrew");
    expect(result.retiredSubdirs?.ok).toBe(true);
    if (result.retiredSubdirs?.ok) {
      expect(result.retiredSubdirs.value.candidates).toEqual(["old-wu"]);
    }
  });

  it("omits the detection when identity is absent", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({ identity: null, role: null, probes });
    expect(probes.retiredSubdirs).not.toHaveBeenCalled();
    expect("retiredSubdirs" in result).toBe(false);
  });

  it("wraps a rejecting detection probe as ok=false without rejecting the composite", async () => {
    const probes = sessionInitProbes({
      retiredSubdirs: async () => { throw new Error("detect boom"); },
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.retiredSubdirs?.ok).toBe(false);
    if (result.retiredSubdirs && !result.retiredSubdirs.ok) {
      expect(result.retiredSubdirs.error.message).toBe("detect boom");
    }
    expect(result.worktree.ok).toBe(true);
  });
});

describe("runSessionInitStatus — errand-staleness sweep slot", () => {
  it("fires the sweep when identity resolved, passing the identity", async () => {
    const probes = sessionInitProbes({
      errandSweep: vi.fn(async () => ({ stale: [{ slug: "old-errand", created: "2026-05-01", ageDays: 24 }] })),
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.errandSweep).toHaveBeenCalledWith("andrew");
    expect(result.errandSweep?.ok).toBe(true);
    if (result.errandSweep?.ok) {
      expect(result.errandSweep.value.stale[0]?.slug).toBe("old-errand");
    }
  });

  it("omits the sweep when identity is absent", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({ identity: null, role: null, probes });
    expect(probes.errandSweep).not.toHaveBeenCalled();
    expect("errandSweep" in result).toBe(false);
  });

  it("wraps a rejecting sweep probe as ok=false without rejecting the composite", async () => {
    const probes = sessionInitProbes({
      errandSweep: async () => { throw new Error("sweep boom"); },
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.errandSweep?.ok).toBe(false);
    if (result.errandSweep && !result.errandSweep.ok) {
      expect(result.errandSweep.error.message).toBe("sweep boom");
    }
    expect(result.worktree.ok).toBe(true);
  });
});

describe("runSessionInitStatus — inbox-state slot", () => {
  it("fires the probe when identity resolved, passing the identity", async () => {
    const probes = sessionInitProbes({
      inboxState: vi.fn(async () => ({ routableCount: 3, housekeepNeeded: true })),
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.inboxState).toHaveBeenCalledWith("andrew");
    expect(result.inboxState?.ok).toBe(true);
    if (result.inboxState?.ok) {
      expect(result.inboxState.value).toEqual({ routableCount: 3, housekeepNeeded: true });
    }
  });

  it("omits the slot when identity is absent", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({ identity: null, role: null, probes });
    expect(probes.inboxState).not.toHaveBeenCalled();
    expect("inboxState" in result).toBe(false);
  });

  it("wraps a rejecting probe as ok=false without rejecting the composite", async () => {
    const probes = sessionInitProbes({
      inboxState: async () => { throw new Error("inbox boom"); },
    });
    const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", probes });
    expect(result.inboxState?.ok).toBe(false);
    if (result.inboxState && !result.inboxState.ok) {
      expect(result.inboxState.error.message).toBe("inbox boom");
    }
    expect(result.worktree.ok).toBe(true);
  });
});

describe("JSON wire shape — discriminated union survives serialization", () => {
  it("full-mode result does not include a domainRules slot", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    expect("domainRules" in result).toBe(false);
  });

  it("preserves a runtime-error slot through JSON.stringify/parse", async () => {
    const probes = fullProbes({
      extensions: async () => { throw new Error("boom"); },
    });
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    const roundTripped = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(roundTripped.extensions.ok).toBe(false);
    if (!roundTripped.extensions.ok) {
      expect(roundTripped.extensions.error.kind).toBe("runtime");
      expect(roundTripped.extensions.error.message).toBe("boom");
    }
  });
});

describe("runSessionHandoffStatus — orchestration", () => {
  it("invokes every probe helper exactly once", async () => {
    const probes = sessionHandoffProbes();
    await runSessionHandoffStatus({ identity: "andrew", role: "maintainer", probes });
    expect(probes.dirty).toHaveBeenCalledTimes(1);
    expect(probes.worktree).toHaveBeenCalledTimes(1);
    expect(probes.user).toHaveBeenCalledTimes(1);
    expect(probes.syncInterlock).toHaveBeenCalledTimes(1);
    expect(probes.active).toHaveBeenCalledTimes(1);
    expect(probes.head).toHaveBeenCalledTimes(1);
    expect(probes.pushability).toHaveBeenCalledTimes(1);
    expect(probes.restateCandidates).toHaveBeenCalledTimes(1);
    expect(probes.releaseRouting).toHaveBeenCalledTimes(1);
    expect(probes.user).toHaveBeenCalledWith("andrew");
    expect(probes.active).toHaveBeenCalledWith("andrew", "maintainer");
  });

  it("exposes the releaseRouting slot with ok=true on success", async () => {
    const probes = sessionHandoffProbes({
      releaseRouting: vi.fn(async () =>
        releaseRouting({
          taskCommit: "wrapper",
          workflowCommit: "wrapper",
          workflowPush: "raw",
          rationale: {
            releaseOptedIn: true,
            commitInterlock: "on-workflow",
            pushInterlock: "on-sync",
          },
        }),
      ),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.releaseRouting.ok).toBe(true);
    if (result.releaseRouting.ok) {
      expect(result.releaseRouting.value.taskCommit).toBe("wrapper");
      expect(result.releaseRouting.value.workflowCommit).toBe("wrapper");
      expect(result.releaseRouting.value.workflowPush).toBe("raw");
    }
  });

  it("returns the full set of expected slots", async () => {
    const probes = sessionHandoffProbes();
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(Object.keys(result).sort()).toEqual([
      "active",
      "branch",
      "dirty",
      "head",
      "identity",
      "mode",
      "pushability",
      "recommendedSummaryLine",
      "releaseRouting",
      "restateCandidates",
      "syncInterlock",
      "user",
      "worktree",
    ]);
    expect(result.mode).toBe("session-handoff");
  });

  it("returns the helper's restate-candidates payload verbatim on the success path", async () => {
    const payload: RestateCandidatesResult = {
      commitsSinceHandoff: [
        { hash: "abc1234", subject: "feat(x): one" },
        { hash: "def5678", subject: "fix(y): two" },
      ],
      tasksClosedSinceHandoff: ["4.5.a", "4.5.b"],
      noteFileChangesSinceHandoff: [".arc/active/technical/notes-foo.md"],
    };
    const probes = sessionHandoffProbes({
      restateCandidates: vi.fn(async () => payload),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.restateCandidates.ok).toBe(true);
    if (result.restateCandidates.ok) {
      expect(result.restateCandidates.value).toEqual(payload);
    }
  });

  it("propagates the baseline-unknown soft signal through the slot", async () => {
    const probes = sessionHandoffProbes({
      restateCandidates: vi.fn(async () =>
        restateCandidates({ baselineSignal: "baseline-unknown" }),
      ),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.restateCandidates.ok).toBe(true);
    if (result.restateCandidates.ok) {
      expect(result.restateCandidates.value.baselineSignal).toBe("baseline-unknown");
    }
  });

  it("wraps a rejecting restate-candidates probe as ok=false runtime error", async () => {
    const probes = sessionHandoffProbes({
      restateCandidates: vi.fn(async () => {
        throw new Error("git log failed");
      }),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.restateCandidates.ok).toBe(false);
    if (!result.restateCandidates.ok) {
      expect(result.restateCandidates.error.kind).toBe("runtime");
      expect(result.restateCandidates.error.message).toBe("git log failed");
    }
    expect(result.dirty.ok).toBe(true);
    expect(result.worktree.ok).toBe(true);
  });

  it("returns pushability matrix from the pushability probe", async () => {
    const blockedResult: PushabilityResult = {
      allowed: false,
      conditions: [
        {
          kind: "rebase-in-progress",
          disposition: "block",
          rebaseForm: "rebase-merge",
          guidance: "Rebase in progress — complete or abort before pushing.",
        },
      ],
    };
    const probes = sessionHandoffProbes({
      pushability: vi.fn(async () => blockedResult),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.pushability.ok).toBe(true);
    if (result.pushability.ok) {
      expect(result.pushability.value.allowed).toBe(false);
      expect(result.pushability.value.conditions[0]?.kind).toBe("rebase-in-progress");
    }
  });

  it("returns the HEAD short-hash from the head probe", async () => {
    const probes = sessionHandoffProbes({
      head: vi.fn(async () => headHash({ hash: "deadbee" })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.head.ok).toBe(true);
    if (result.head.ok) expect(result.head.value.hash).toBe("deadbee");
  });

  it("preserves null hash on the head slot when rev-parse returned empty", async () => {
    const probes = sessionHandoffProbes({
      head: vi.fn(async () => headHash({ hash: null })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.head.ok).toBe(true);
    if (result.head.ok) expect(result.head.value.hash).toBeNull();
  });

  it("wraps a rejecting head probe as ok=false runtime error", async () => {
    const probes = sessionHandoffProbes({
      head: vi.fn(async () => { throw new Error("rev-parse failed"); }),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.head.ok).toBe(false);
    if (!result.head.ok) {
      expect(result.head.error.kind).toBe("runtime");
      expect(result.head.error.message).toBe("rev-parse failed");
    }
    // Sibling slots unaffected
    expect(result.dirty.ok).toBe(true);
    expect(result.worktree.ok).toBe(true);
  });

  it("returns dirty-state probe (clean / dirty + file-count detail)", async () => {
    const probes = sessionHandoffProbes({
      dirty: vi.fn(async () => dirtyState({ state: "dirty", fileCount: 3 })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.dirty.ok).toBe(true);
    if (result.dirty.ok) {
      expect(result.dirty.value).toEqual({ state: "dirty", fileCount: 3 });
    }
  });

  it("returns worktree sync state from the worktree probe", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () => worktreeSync({ state: "local-ahead", ahead: 2, behind: 0 })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.state).toBe("local-ahead");
      expect(result.worktree.value.ahead).toBe(2);
    }
  });

  it("returns notes sync state from the user probe", async () => {
    const probes = sessionHandoffProbes({
      user: vi.fn(async () => userSessionInit({ state: "remote-ahead" })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.user.ok).toBe(true);
    if (result.user.ok) expect(result.user.value.state).toBe("remote-ahead");
  });

  it("carries stale local-note freshness through the handoff user slot", async () => {
    const io = staleLocalNoteIO();
    const probes = sessionHandoffProbes({
      user: vi.fn((identity) =>
        runUserSessionInitStatus({
          cwd: "/repo",
          io,
          identity,
          remoteSyncEnabled: true,
        })),
    });

    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.localNoteFreshness).toMatchObject({
        state: "ancestor",
        commit: STALE_NOTE_COMMIT,
        ancestorDistance: 2,
      });
      expect(result.user.value.detailLines).toContain(
        "Next step: run `arc user save` or `arc sync` before relying on handoff.",
      );
    }
  });

  it("returns sync interlock with provenance from the syncInterlock probe", async () => {
    const probes = sessionHandoffProbes({
      syncInterlock: vi.fn(async () =>
        handoffSyncInterlock({ value: "manual", source: "git-config" })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.syncInterlock.ok).toBe(true);
    if (result.syncInterlock.ok) {
      expect(result.syncInterlock.value).toEqual({ value: "manual", source: "git-config" });
    }
  });

  it("returns the resolved active status file path from the active probe", async () => {
    const probes = sessionHandoffProbes({
      active: vi.fn(async () =>
        activeSessionInit({
          resolution: "single",
          path: ".arc/active/technical/meta-foo.md",
        }),
      ),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("single");
      expect(result.active.value.path).toBe(".arc/active/technical/meta-foo.md");
    }
  });

  it("carries per-slot errors in the envelope without rejecting the composite", async () => {
    const probes = sessionHandoffProbes({
      dirty: vi.fn(async () => { throw new Error("porcelain failed"); }),
      syncInterlock: vi.fn(async () => { throw new Error("config unreadable"); }),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.dirty.ok).toBe(false);
    expect(result.syncInterlock.ok).toBe(false);
    if (!result.dirty.ok) {
      expect(result.dirty.error.kind).toBe("runtime");
      expect(result.dirty.error.message).toBe("porcelain failed");
    }
    if (!result.syncInterlock.ok) {
      expect(result.syncInterlock.error.kind).toBe("runtime");
      expect(result.syncInterlock.error.message).toBe("config unreadable");
    }
    // Sibling slots resolve normally.
    expect(result.worktree.ok).toBe(true);
    expect(result.user.ok).toBe(true);
    expect(result.active.ok).toBe(true);
  });

  it("short-circuits the user slot when identity is null", async () => {
    const probes = sessionHandoffProbes();
    const result = await runSessionHandoffStatus({
      identity: null,
      role: null,
      probes,
    });
    expect(probes.user).not.toHaveBeenCalled();
    expect(result.user.ok).toBe(false);
    if (!result.user.ok) expect(result.user.error.kind).toBe("identity-missing");
    // Other slots still fire.
    expect(probes.dirty).toHaveBeenCalledTimes(1);
    expect(probes.worktree).toHaveBeenCalledTimes(1);
    expect(probes.syncInterlock).toHaveBeenCalledTimes(1);
    expect(probes.active).toHaveBeenCalledTimes(1);
    expect(probes.head).toHaveBeenCalledTimes(1);
  });

  it("does not reject when a probe throws synchronously before returning a promise", async () => {
    const probes = sessionHandoffProbes({
      dirty: vi.fn((): Promise<DirtyStateResult> => {
        throw new Error("synchronous failure");
      }),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.dirty.ok).toBe(false);
    if (!result.dirty.ok) {
      expect(result.dirty.error.kind).toBe("runtime");
      expect(result.dirty.error.message).toBe("synchronous failure");
    }
    // Other slots still resolve normally.
    expect(result.worktree.ok).toBe(true);
    expect(result.user.ok).toBe(true);
    expect(result.syncInterlock.ok).toBe(true);
    expect(result.active.ok).toBe(true);
    expect(result.head.ok).toBe(true);
  });

  it("starts all probes concurrently via Promise.all", async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    function tracked<T>(value: T): () => Promise<T> {
      return async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return value;
      };
    }
    const probes = sessionHandoffProbes({
      dirty: tracked(dirtyState()),
      worktree: tracked(worktreeSync()),
      user: tracked(userSessionInit()),
      syncInterlock: tracked(handoffSyncInterlock()),
      active: tracked(activeSessionInit()),
      head: tracked(headHash()),
    });
    await runSessionHandoffStatus({ identity: "andrew", role: "maintainer", probes });
    expect(peakInFlight).toBe(6);
  });

  it("composes recommendedSummaryLine: Reconcile required for diverged worktree", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () =>
        worktreeSync({ state: "diverged", ahead: 2, behind: 3, branch: "feature/foo" }),
      ),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.recommendedSummaryLine).toBe(
      "**Reconcile required:** `feature/foo` diverged from `origin/feature/foo` "
      + "(2 ahead, 3 behind). Manual rebase or merge needed before pushing.",
    );
  });

  it("composes recommendedSummaryLine: Worktree N unpushed for local-ahead", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () =>
        worktreeSync({ state: "local-ahead", ahead: 4, behind: 0, branch: "feature/baz" }),
      ),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.recommendedSummaryLine).toBe(
      "**Worktree:** 4 unpushed commit(s) on `feature/baz`.",
    );
  });

  it("returns recommendedSummaryLine null for clean worktree", async () => {
    const probes = sessionHandoffProbes();
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.recommendedSummaryLine).toBeNull();
  });

  it("returns recommendedSummaryLine null when identity is absent and worktree is clean", async () => {
    const probes = sessionHandoffProbes();
    const result = await runSessionHandoffStatus({
      identity: null,
      role: null,
      probes,
    });
    expect(result.recommendedSummaryLine).toBeNull();
  });

  it("still surfaces Reconcile when identity is absent but worktree is diverged", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () =>
        worktreeSync({ state: "diverged", ahead: 1, behind: 2, branch: "feature/qux" }),
      ),
    });
    const result = await runSessionHandoffStatus({
      identity: null,
      role: null,
      probes,
    });
    expect(result.recommendedSummaryLine).toBe(
      "**Reconcile required:** `feature/qux` diverged from `origin/feature/qux` "
      + "(1 ahead, 2 behind). Manual rebase or merge needed before pushing.",
    );
  });

  it("returns recommendedSummaryLine null when worktree probe failed", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () => { throw new Error("probe failed"); }),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.recommendedSummaryLine).toBeNull();
  });

  it("returns recommendedSummaryLine null when branch is null (detached HEAD)", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () =>
        worktreeSync({ state: "diverged", ahead: 1, behind: 1, branch: null }),
      ),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.recommendedSummaryLine).toBeNull();
  });

  it("threads branch from worktree slot through to the envelope verbatim", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () => worktreeSync({ branch: "technical/probe-two" })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.branch).toBe("technical/probe-two");
  });

  it("falls back to null branch when the worktree probe failed", async () => {
    const probes = sessionHandoffProbes({
      worktree: vi.fn(async () => { throw new Error("worktree boom"); }),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.branch).toBeNull();
  });
});
