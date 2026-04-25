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
  runSessionInitStatus,
  runStatus,
} from "../../../src/commands/status.js";
import type {
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
import type { WorktreeSyncStatusResult } from "../../../src/lib/git/worktree-sync.js";

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
    errors: [],
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
  return { mode: "session-init", active: [], ...overrides };
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
    errors: [],
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

  it("runs probes in parallel via Promise.all (elapsed ~= max individual delay)", async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const DELAY_MS = 40;
    const probes = fullProbes({
      user: async () => {
        await delay(DELAY_MS);
        return userResult();
      },
      extensions: async () => {
        await delay(DELAY_MS);
        return extensionsResult();
      },
      config: async () => {
        await delay(DELAY_MS);
        return configResult();
      },
      active: async () => {
        await delay(DELAY_MS);
        return activeResult();
      },
    });
    const start = Date.now();
    await runStatus({ identity: "andrew", role: "maintainer", probes });
    const elapsed = Date.now() - start;
    // Parallel: ~DELAY_MS. Sequential would be ~4 * DELAY_MS = 160ms. Give generous headroom
    // on top of DELAY_MS for CI variance; still well under the sequential floor.
    expect(elapsed).toBeLessThan(DELAY_MS * 3);
  });

  it("returns slots in a stable order (user, extensions, config, active)", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    const keys = Object.keys(result);
    expect(keys).toEqual(["mode", "identity", "user", "extensions", "config", "active"]);
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

describe("JSON round-trip — composite result shape is stable", () => {
  it("full-mode result preserves every slot through JSON.stringify/parse", async () => {
    const probes = fullProbes();
    const result = await runStatus({ identity: "andrew", role: "maintainer", probes });
    const roundTripped = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(roundTripped.mode).toBe("full");
    expect(roundTripped.identity).toEqual({ identity: "andrew", role: "maintainer" });
    expect(roundTripped.user.ok).toBe(true);
    expect(roundTripped.extensions.ok).toBe(true);
    expect(roundTripped.config.ok).toBe(true);
    expect(roundTripped.active.ok).toBe(true);
  });

  it("session-init result preserves every slot through JSON.stringify/parse", async () => {
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
    const roundTripped = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(roundTripped.mode).toBe("session-init");
    expect(roundTripped.identity.identity).toBe("andrew");
    expect(roundTripped.domainRules.ok).toBe(true);
    if (roundTripped.domainRules.ok) {
      expect(roundTripped.domainRules.value.rules[0]?.domain).toBe("frontend");
    }
  });

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
