/**
 * Unit tests for the interlock-validation library — wrapper-scope-vs-permission
 * authorization rule (code 11) and branch-protection check (code 13). Pure
 * logic over a synthetic `ResolvedSettingsResult`; no I/O. Also covers the
 * shared `formatRefusal()` composer.
 */

import { describe, it, expect } from "vitest";

import {
  authorizeRelease,
  formatRefusal,
  isProtectedBranch,
} from "../../../src/lib/release/interlock-validation.js";
import type {
  ResolvedSettingsResult,
  CommitInterlock,
  PushInterlock,
  SyncInterlock,
  NotesPushPolicy,
  ReleaseOptedIn,
} from "../../../src/lib/config/resolved-settings.js";
import type { ConfigSettings } from "../../../src/commands/config/types.js";
import type { AuthorizationDecision } from "../../../src/lib/release/types.js";

// --- Fixture builders ---

interface FixtureOverrides {
  commitInterlock?: CommitInterlock;
  pushInterlock?: PushInterlock;
  syncInterlock?: SyncInterlock;
  branchProtection?: "partial" | "full";
  branchBase?: string;
}

function buildSettings(overrides: FixtureOverrides = {}): ResolvedSettingsResult {
  const commitInterlock: CommitInterlock = overrides.commitInterlock ?? "manual";
  const pushInterlock: PushInterlock = overrides.pushInterlock ?? "manual";
  const syncInterlock: SyncInterlock = overrides.syncInterlock ?? "on-handoff";
  const branchProtection = overrides.branchProtection ?? "partial";
  const branchBase = overrides.branchBase ?? "main";

  const settings: ConfigSettings = {
    "inbox.remind_after_days": "1",
    "integration.stale_after_days": "2",
    "branch.base": branchBase,
    "branch.protection": branchProtection,
    "worktree.location_template": "../{repo}.{branch}",
    "worktree.post_create": "",
    "commit.format": "conventional",
    "commit.context_footer": "required",
    "commit.custom_pattern": "",
    "commit.context_pattern": "",
    "merge.strategy": "merge",
    "review.pre_merge": "enabled",
    "platform.type": "github",
    "pm.mode": "arc-in-git",
    "team.mode": "false",
    "session.remote_sync": "enabled",
    "session.init_pull.worktree": "prompt",
    "session.init_pull.notes": "prompt",
    "session.init_pull.base": "prompt",
    "session.init_load.notes": "prompt",
    "sync.auto_pull": "false",
    "archive.cadence": "with-integration",
    "user.notes_push": "on-sync",
  };

  const notesPush: NotesPushPolicy = "on-sync";
  const releaseOptedIn: ReleaseOptedIn = "true";

  return {
    settings,
    resolved: {
      commitInterlock: { value: commitInterlock, source: "default" },
      pushInterlock: { value: pushInterlock, source: "default" },
      syncInterlock: { value: syncInterlock, source: "default" },
      notesPush: { value: notesPush, source: "default" },
      releaseOptedIn: { value: releaseOptedIn, source: "default" },
    },
    defaultsApplied: [],
    warnings: [],
  };
}

// --- Commit × commit_interlock matrix ---

describe("authorizeRelease — commit × commit_interlock", () => {
  it("manual → refuse(11) carrying commit_interlock setting", () => {
    const decision = authorizeRelease({
      operation: "commit",
      settings: buildSettings({ commitInterlock: "manual" }),
      currentBranch: "feature/x",
    });
    expect(decision).toEqual({
      kind: "refuse",
      code: 11,
      identifier: "interlock-not-authorized",
      setting: { key: "arc.commitInterlock", value: "manual" },
    });
  });

  it("on-task-approval → authorize", () => {
    const decision = authorizeRelease({
      operation: "commit",
      settings: buildSettings({ commitInterlock: "on-task-approval" }),
      currentBranch: "feature/x",
    });
    expect(decision).toEqual({ kind: "authorize" });
  });

  it("on-workflow → authorize", () => {
    const decision = authorizeRelease({
      operation: "commit",
      settings: buildSettings({ commitInterlock: "on-workflow" }),
      currentBranch: "feature/x",
    });
    expect(decision).toEqual({ kind: "authorize" });
  });
});

// --- Push × push_interlock matrix ---

describe("authorizeRelease — push × push_interlock", () => {
  it("manual → refuse(11) carrying push_interlock setting", () => {
    const decision = authorizeRelease({
      operation: "push",
      settings: buildSettings({ pushInterlock: "manual" }),
      currentBranch: "feature/x",
    });
    expect(decision).toEqual({
      kind: "refuse",
      code: 11,
      identifier: "interlock-not-authorized",
      setting: { key: "arc.pushInterlock", value: "manual" },
    });
  });

  it("on-sync → refuse(11) (sync ⊄ ceremony scope)", () => {
    const decision = authorizeRelease({
      operation: "push",
      settings: buildSettings({ pushInterlock: "on-sync" }),
      currentBranch: "feature/x",
    });
    expect(decision).toEqual({
      kind: "refuse",
      code: 11,
      identifier: "interlock-not-authorized",
      setting: { key: "arc.pushInterlock", value: "on-sync" },
    });
  });

  it("on-workflow → authorize", () => {
    const decision = authorizeRelease({
      operation: "push",
      settings: buildSettings({ pushInterlock: "on-workflow" }),
      currentBranch: "feature/x",
    });
    expect(decision).toEqual({ kind: "authorize" });
  });
});

// --- Branch-protection check ---

describe("authorizeRelease — branch-protection check", () => {
  it("full + currentBranch === branch.base → refuse(13)", () => {
    const decision = authorizeRelease({
      operation: "commit",
      settings: buildSettings({
        branchProtection: "full",
        branchBase: "main",
        commitInterlock: "on-workflow", // would otherwise authorize
      }),
      currentBranch: "main",
    });
    expect(decision).toEqual({
      kind: "refuse",
      code: 13,
      identifier: "branch-protection-violation",
      branch: "main",
    });
  });

  it("full + currentBranch !== branch.base → no branch-protection refusal", () => {
    const decision = authorizeRelease({
      operation: "commit",
      settings: buildSettings({
        branchProtection: "full",
        branchBase: "main",
        commitInterlock: "on-workflow",
      }),
      currentBranch: "feature/x",
    });
    expect(decision).toEqual({ kind: "authorize" });
  });

  it("partial + currentBranch === branch.base → no refusal regardless", () => {
    const decision = authorizeRelease({
      operation: "commit",
      settings: buildSettings({
        branchProtection: "partial",
        branchBase: "main",
        commitInterlock: "on-workflow",
      }),
      currentBranch: "main",
    });
    expect(decision).toEqual({ kind: "authorize" });
  });

  it("branch-protection short-circuits before interlock check", () => {
    // Both gates would refuse; branch-protection (13) takes precedence.
    const decision = authorizeRelease({
      operation: "commit",
      settings: buildSettings({
        branchProtection: "full",
        branchBase: "main",
        commitInterlock: "manual",
      }),
      currentBranch: "main",
    });
    expect(decision).toMatchObject({ code: 13 });
  });

  it("push operation also subject to branch-protection", () => {
    const decision = authorizeRelease({
      operation: "push",
      settings: buildSettings({
        branchProtection: "full",
        branchBase: "main",
        pushInterlock: "on-workflow",
      }),
      currentBranch: "main",
    });
    expect(decision).toEqual({
      kind: "refuse",
      code: 13,
      identifier: "branch-protection-violation",
      branch: "main",
    });
  });
});

// --- isProtectedBranch predicate ---

describe("isProtectedBranch", () => {
  it("true when full protection and the branch is the configured base", () => {
    const { settings } = buildSettings({ branchProtection: "full", branchBase: "main" });
    expect(isProtectedBranch(settings, "main")).toBe(true);
  });

  it("false under partial protection even on the base branch", () => {
    const { settings } = buildSettings({ branchProtection: "partial", branchBase: "main" });
    expect(isProtectedBranch(settings, "main")).toBe(false);
  });

  it("false when the branch is not the configured base, under full", () => {
    const { settings } = buildSettings({ branchProtection: "full", branchBase: "main" });
    expect(isProtectedBranch(settings, "feature/x")).toBe(false);
  });
});

// --- formatRefusal three-line shape ---

describe("formatRefusal — three-line shape", () => {
  it("code 10 (ambiguous-active-wu, no hint): identifier + what-happened + remediation", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 10,
      identifier: "ambiguous-active-wu",
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Refused: ambiguous-active-wu (code 10)");
    expect(lines[1]).toContain("active");
    expect(lines[2]).toMatch(/disambiguat/i);
  });

  it("code 10 with hint surfaces the hint in the what-happened line", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 10,
      identifier: "ambiguous-active-wu",
      hint: "Multiple status files resolved.",
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines[1]).toContain("Multiple status files resolved.");
  });

  it("code 11 commit_interlock=manual: includes setting key/value and raw-git-first remediation", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 11,
      identifier: "interlock-not-authorized",
      setting: { key: "arc.commitInterlock", value: "manual" },
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Refused: interlock-not-authorized (code 11)");
    expect(lines[1]).toContain("arc.commitInterlock");
    expect(lines[1]).toContain("manual");
    // Remediation orders raw `git` first, config escalation second.
    expect(lines[2]).toMatch(/^Use raw `git/);
    expect(lines[2]).toContain("on-workflow");
  });

  it("code 11 push_interlock=on-sync: surfaces the on-sync value", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 11,
      identifier: "interlock-not-authorized",
      setting: { key: "arc.pushInterlock", value: "on-sync" },
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines[1]).toContain("arc.pushInterlock");
    expect(lines[1]).toContain("on-sync");
  });

  it("code 12 (destructive-flag): names the flag", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 12,
      identifier: "destructive-flag",
      flag: "--force",
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Refused: destructive-flag (code 12)");
    expect(lines[1]).toContain("--force");
  });

  it("code 13 (branch-protection-violation): names the branch", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 13,
      identifier: "branch-protection-violation",
      branch: "main",
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Refused: branch-protection-violation (code 13)");
    expect(lines[1]).toContain("main");
  });

  it("code 14 (pushability-precheck-failed): includes the condition kinds", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 14,
      identifier: "pushability-precheck-failed",
      conditions: [
        { kind: "rebase-in-progress", disposition: "block", guidance: "" },
        { kind: "detached-head", disposition: "block", guidance: "" },
      ],
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Refused: pushability-precheck-failed (code 14)");
    expect(lines[1]).toContain("rebase-in-progress");
    expect(lines[1]).toContain("detached-head");
  });

  it("code 15 (arg-grammar-fallthrough): three-line shape held even though reserved-for-empirical", () => {
    const decision: AuthorizationDecision = {
      kind: "refuse",
      code: 15,
      identifier: "arg-grammar-fallthrough",
    };
    const lines = formatRefusal(decision).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Refused: arg-grammar-fallthrough (code 15)");
  });
});
