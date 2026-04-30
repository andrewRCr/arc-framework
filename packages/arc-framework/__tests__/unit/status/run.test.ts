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
 *
 * Batching rationale: per the test-first method's batching-judgment
 * clause — behaviors are tightly coupled to a single orchestrator and
 * share fixture setup (mock probe bundle); one-at-a-time slicing has no
 * independent discovery value here.
 */

import { describe, it, expect, vi } from "vitest";

import {
  runSessionHandoffStatus,
  runSessionInitStatus,
  runStatus,
} from "../../../src/commands/status.js";
import type {
  HandoffAutonomy,
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
  UserSessionInitStatusResult,
  UserStatusResult,
} from "../../../src/commands/user/types.js";
import type { DirtyStateResult } from "../../../src/lib/git/dirty-state.js";
import type { HeadHashResult } from "../../../src/lib/git/head-hash.js";
import type { WorktreeSyncStatusResult } from "../../../src/lib/git/worktree-sync.js";
import type { ResolvedSyncPush } from "../../../src/lib/sync-policy.js";

// --- Fixtures ---

function userResult(overrides: Partial<UserStatusResult> = {}): UserStatusResult {
  return {
    identity: "andrew",
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
      "user.sync_push": "always",
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
  return { state: "clean", ahead: 0, behind: 0, ...overrides };
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
      "branch.protection": "partial",
      "pm.mode": "none",
      "commit.format": "conventional",
      "commit.context_footer": "required",
    },
    defaultsApplied: [],
    warnings: [],
    autonomy: { value: "manual-commit", source: "default" },
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
    extensions: vi.fn(async () => extensionsSessionInit()),
    config: vi.fn(async () => configSessionInit()),
    active: vi.fn(async () => activeSessionInit()),
    domainRules: vi.fn(async () => domainRulesSessionInit()),
    ...overrides,
  };
}

function dirtyState(overrides: Partial<DirtyStateResult> = {}): DirtyStateResult {
  return { state: "clean", fileCount: 0, ...overrides };
}

function handoffAutonomy(overrides: Partial<HandoffAutonomy> = {}): HandoffAutonomy {
  return { value: "manual-commit", source: "default", ...overrides };
}

function resolvedSyncPush(overrides: Partial<ResolvedSyncPush> = {}): ResolvedSyncPush {
  return { policy: "always", source: "default", ...overrides };
}

function headHash(overrides: Partial<HeadHashResult> = {}): HeadHashResult {
  return { hash: "a1b2c3d", ...overrides };
}

function sessionHandoffProbes(
  overrides: Partial<SessionHandoffProbes> = {},
): SessionHandoffProbes {
  return {
    dirty: vi.fn(async () => dirtyState()),
    worktree: vi.fn(async () => worktreeSync()),
    user: vi.fn(async () => userSessionInit()),
    autonomy: vi.fn(async () => handoffAutonomy()),
    syncPush: vi.fn(async () => resolvedSyncPush()),
    active: vi.fn(async () => activeSessionInit()),
    head: vi.fn(async () => headHash()),
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
    expect(probes.extensions).toHaveBeenCalledTimes(1);
    expect(probes.config).toHaveBeenCalledTimes(1);
    expect(probes.active).toHaveBeenCalledTimes(1);
    expect(probes.domainRules).toHaveBeenCalledTimes(1);
  });

  it("exposes the domainRules slot with ok=true on success", async () => {
    const probes = sessionInitProbes({
      domainRules: vi.fn(async () =>
        domainRulesSessionInit({
          rules: [
            {
              path: ".arc/reference/constitution/DEV-RULES.FRONTEND.md",
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
      // Session-init settings object has exactly 7 keys.
      expect(Object.keys(result.config.value.settings).sort()).toEqual([
        "branch.protection",
        "commit.context_footer",
        "commit.format",
        "pm.mode",
        "session.init_pull.notes",
        "session.init_pull.worktree",
        "session.remote_sync",
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

  it("keeps the envelope additive — every existing slot remains present", async () => {
    const probes = sessionInitProbes();
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    // All pre-existing fields plus the new worktree peer.
    expect(Object.keys(result).sort()).toEqual([
      "active",
      "config",
      "domainRules",
      "extensions",
      "identity",
      "mode",
      "user",
      "worktree",
    ]);
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
    expect(probes.autonomy).toHaveBeenCalledTimes(1);
    expect(probes.syncPush).toHaveBeenCalledTimes(1);
    expect(probes.active).toHaveBeenCalledTimes(1);
    expect(probes.head).toHaveBeenCalledTimes(1);
    expect(probes.user).toHaveBeenCalledWith("andrew");
    expect(probes.active).toHaveBeenCalledWith("andrew", "maintainer");
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
      "autonomy",
      "dirty",
      "head",
      "identity",
      "mode",
      "syncPush",
      "user",
      "worktree",
    ]);
    expect(result.mode).toBe("session-handoff");
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

  it("returns autonomy with provenance from the autonomy probe", async () => {
    const probes = sessionHandoffProbes({
      autonomy: vi.fn(async () => handoffAutonomy({ value: "auto-push", source: "git-config" })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.autonomy.ok).toBe(true);
    if (result.autonomy.ok) {
      expect(result.autonomy.value).toEqual({ value: "auto-push", source: "git-config" });
    }
  });

  it("returns sync-push policy with provenance from the syncPush probe", async () => {
    const probes = sessionHandoffProbes({
      syncPush: vi.fn(async () => resolvedSyncPush({ policy: "prompt", source: "yaml" })),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.syncPush.ok).toBe(true);
    if (result.syncPush.ok) {
      expect(result.syncPush.value).toEqual({ policy: "prompt", source: "yaml" });
    }
  });

  it("returns the resolved active status file path from the active probe", async () => {
    const probes = sessionHandoffProbes({
      active: vi.fn(async () =>
        activeSessionInit({
          resolution: "single",
          path: ".arc/active/technical/status-foo.md",
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
      expect(result.active.value.path).toBe(".arc/active/technical/status-foo.md");
    }
  });

  it("carries per-slot errors in the envelope without rejecting the composite", async () => {
    const probes = sessionHandoffProbes({
      dirty: vi.fn(async () => { throw new Error("porcelain failed"); }),
      autonomy: vi.fn(async () => { throw new Error("config unreadable"); }),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });
    expect(result.dirty.ok).toBe(false);
    expect(result.autonomy.ok).toBe(false);
    if (!result.dirty.ok) {
      expect(result.dirty.error.kind).toBe("runtime");
      expect(result.dirty.error.message).toBe("porcelain failed");
    }
    if (!result.autonomy.ok) {
      expect(result.autonomy.error.kind).toBe("runtime");
      expect(result.autonomy.error.message).toBe("config unreadable");
    }
    // Sibling slots resolve normally.
    expect(result.worktree.ok).toBe(true);
    expect(result.user.ok).toBe(true);
    expect(result.syncPush.ok).toBe(true);
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
    expect(probes.autonomy).toHaveBeenCalledTimes(1);
    expect(probes.syncPush).toHaveBeenCalledTimes(1);
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
    expect(result.autonomy.ok).toBe(true);
    expect(result.syncPush.ok).toBe(true);
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
      autonomy: tracked(handoffAutonomy()),
      syncPush: tracked(resolvedSyncPush()),
      active: tracked(activeSessionInit()),
      head: tracked(headHash()),
    });
    await runSessionHandoffStatus({ identity: "andrew", role: "maintainer", probes });
    expect(peakInFlight).toBe(7);
  });
});
