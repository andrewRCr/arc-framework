/**
 * Unit tests for `arc status` Clack summary formatters.
 *
 * Covers the composite's per-slot rendering (ok → delegated formatter,
 * error → single-line "unavailable" marker) and the identity pointer
 * block. Per-slot ok rendering is already exhaustively covered by each
 * probe's own format tests (active-format.test.ts etc.); this suite
 * checks the composite glue — section headers, stable order, error
 * fallback, and that each probe's formatter is actually invoked.
 */

import { describe, it, expect } from "vitest";

import {
  buildSessionInitStatusSummary,
  buildStatusSummary,
} from "../../src/commands/status.js";
import { LOAD_SET_MANIFEST_VERSION } from "../../src/lib/load-set/types.js";
import type {
  Probe,
  SessionInitProbeResult,
  StatusResult,
} from "../../src/commands/status.js";
import type { ActiveStatusResult } from "../../src/commands/active/types.js";
import type { ConfigStatusResult } from "../../src/commands/config/types.js";
import type { ExtensionsStatusResult } from "../../src/commands/extensions/types.js";
import type { UserStatusResult } from "../../src/commands/user/types.js";

function okUser(): Probe<UserStatusResult> {
  return {
    ok: true,
    value: {
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
      savedCommit: null,
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: null,
      unsavedDirection: null,
      backupFiles: [],
      remoteIdentities: [],
    },
  };
}

function okExtensions(): Probe<ExtensionsStatusResult> {
  return {
    ok: true,
    value: {
      mode: "full",
      extensions: [{ name: "pre-merge", active: true, description: "d" }],
      activeCount: 1,
      inactiveCount: 0,
      orphanCount: 0,
      orphans: [],
      includeOrphanDetails: false,
      warnings: [],
    },
  };
}

function okConfig(): Probe<ConfigStatusResult> {
  return {
    ok: true,
    value: {
      mode: "full",
      settings: {
        "branch.base": "main",
        "branch.protection": "partial",
        "worktree.location_template": "../{repo}.{name}",
        "worktree.post_create": "",
        "worktree.harness_dirs": ".claude,.codex,.gemini,.opencode",
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
        "session.init_pull.base": "prompt",
        "session.init_load.notes": "prompt",
        "sync.auto_pull": "false",
        "archive.cadence": "with-integration",
        "user.notes_push": "on-sync",
        "inbox.remind_after_days": "1",
        "integration.stale_after_days": "2",
      },
      defaultsApplied: [],
      warnings: [],
    },
  };
}

function okActive(): Probe<ActiveStatusResult> {
  return {
    ok: true,
    value: { mode: "full", layout: "full", candidates: [], warnings: [] },
  };
}

function makeFullResult(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    mode: "full",
    identity: { identity: "andrew", role: "maintainer" },
    user: okUser(),
    extensions: okExtensions(),
    config: okConfig(),
    active: okActive(),
    ...overrides,
  };
}

function makeSessionInitResult(
  overrides: Partial<SessionInitProbeResult> = {},
): SessionInitProbeResult {
  return {
    mode: "session-init",
    identity: { identity: "andrew", role: "maintainer" },
    user: {
      ok: true,
      value: {
        identity: "andrew",
        state: "clean",
        summary: "andrew: session-init remote state clean",
        detailLines: ["Remote notes match local notes."],
        actionHint: null,
        shouldPromptToPull: false,
        recommendedAction: "skip",
        recommendedPromptText: "",
      },
    },
    worktree: {
      ok: true,
      value: {
        state: "clean",
        ahead: 0,
        behind: 0,
        branch: "main",
        recommendedAction: "skip",
        recommendedPromptText: "",
        identity: { kind: "primary" },
        supersession: null,
      },
    },
    baseDistance: {
      ok: true,
      value: {
        state: "clean",
        ahead: 0,
        behind: 0,
        base: "main",
        overlappingPaths: [],
        recommendedAction: "skip",
        recommendedPromptText: "",
      },
    },
    baseBranchSync: {
      ok: true,
      value: {
        state: "clean",
        ahead: 0,
        behind: 0,
        base: "main",
        checkout: { kind: "not-checked-out" },
        recommendedAction: "skip",
        recommendedPromptText: "",
      },
    },
    dirty: { ok: true, value: { state: "clean", fileCount: 0 } },
    loadSet: { ok: true, value: { manifestVersion: LOAD_SET_MANIFEST_VERSION, entries: [] } },
    recommendedCombinedPrompt: null,
    extensions: {
      ok: true,
      value: { mode: "session-init", active: ["pre-merge"], warnings: [] },
    },
    config: {
      ok: true,
      value: {
        mode: "session-init",
        settings: {
          "session.remote_sync": "enabled",
          "session.init_pull.worktree": "prompt",
          "session.init_pull.notes": "prompt",
          "session.init_pull.base": "prompt",
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
      },
    },
    releaseRouting: {
      ok: true,
      value: {
        taskCommit: "raw",
        workflowCommit: "raw",
        workflowPush: "raw",
        rationale: {
          releaseOptedIn: false,
          commitInterlock: "manual",
          pushInterlock: "manual",
        },
      },
    },
    active: {
      ok: true,
      value: {
        mode: "session-init",
        layout: "full",
        resolution: "single",
        path: ".arc/active/technical/meta-foo.md",
        candidates: [],
        sessionType: "execution",
        currentWorkflow: null,
        planningStage: null,
        warnings: [],
      },
    },
    domainRules: {
      ok: true,
      value: { mode: "session-init", rules: [], warnings: [] },
    },
    ...overrides,
  };
}

describe("buildStatusSummary — full mode", () => {
  it("includes all section headers in stable order", () => {
    const summary = buildStatusSummary(makeFullResult());
    // Top-level headers are at column 0; sub-sections (e.g., the
    // extensions formatter's own "Active:" list header) are indented,
    // so line-anchored matching is the discriminator.
    const lines = summary.split("\n");
    const idxOfLine = (label: string): number => lines.findIndex((l) => l === label);
    const identityIdx = idxOfLine("Identity:");
    const userIdx = idxOfLine("User:");
    const extIdx = idxOfLine("Extensions:");
    const configIdx = idxOfLine("Config:");
    const activeIdx = idxOfLine("Active:");
    expect(identityIdx).toBeGreaterThanOrEqual(0);
    expect(userIdx).toBeGreaterThan(identityIdx);
    expect(extIdx).toBeGreaterThan(userIdx);
    expect(configIdx).toBeGreaterThan(extIdx);
    expect(activeIdx).toBeGreaterThan(configIdx);
  });

  it("renders the identity block with arc.identity and arc.role values", () => {
    const summary = buildStatusSummary(makeFullResult());
    expect(summary).toContain("arc.identity: andrew");
    expect(summary).toContain("arc.role:     maintainer");
  });

  it("renders (unset) for null identity and role", () => {
    const summary = buildStatusSummary(
      makeFullResult({ identity: { identity: null, role: null } }),
    );
    expect(summary).toContain("arc.identity: (unset)");
    expect(summary).toContain("arc.role:     (unset)");
  });

  it("delegates each slot to its probe's formatter", () => {
    const summary = buildStatusSummary(makeFullResult());
    // User formatter output: "andrew: git note up to date"
    expect(summary).toContain("andrew: git note up to date");
    // Extensions full formatter headline: "N active · N inactive · N orphaned refs"
    expect(summary).toContain("1 active · 0 inactive · 0 orphaned refs");
    // Config formatter: "N agent-consumable settings"
    expect(summary).toContain("24 agent-consumable settings");
    // Active formatter: "0 active work units"
    expect(summary).toContain("0 active work units");
  });

  it("renders an (unavailable) marker for an errored slot", () => {
    const summary = buildStatusSummary(
      makeFullResult({
        extensions: { ok: false, error: { kind: "runtime", message: "dir missing" } },
      }),
    );
    expect(summary).toContain("Extensions:");
    expect(summary).toContain("(unavailable) dir missing");
    // Other slots still render
    expect(summary).toContain("Config:");
    expect(summary).toContain("Active:");
  });

  it("renders the identity-missing marker for a user slot short-circuit", () => {
    const summary = buildStatusSummary(
      makeFullResult({
        identity: { identity: null, role: null },
        user: {
          ok: false,
          error: { kind: "identity-missing", message: "no arc.identity" },
        },
      }),
    );
    expect(summary).toContain("User:");
    expect(summary).toContain("(unavailable) no arc.identity");
  });
});

describe("buildSessionInitStatusSummary — scoped mode", () => {
  it("includes identity block plus all probe sections (user, worktree, extensions, config, active)", () => {
    const summary = buildSessionInitStatusSummary(makeSessionInitResult());
    expect(summary).toContain("Identity:");
    expect(summary).toContain("User:");
    expect(summary).toContain("Worktree:");
    expect(summary).toContain("Extensions:");
    expect(summary).toContain("Config:");
    expect(summary).toContain("Release Routing:");
    expect(summary).toContain("Active:");
  });

  it("delegates each slot to its session-init formatter", () => {
    const summary = buildSessionInitStatusSummary(makeSessionInitResult());
    expect(summary).toContain("session-init remote state clean");
    expect(summary).toContain("clean (in sync with origin)");
    expect(summary).toContain("1 active extensions");
    expect(summary).toContain("Init-gating settings");
    expect(summary).toContain("session.remote_sync: enabled");
    expect(summary).toContain("user.notes_push: on-sync");
    expect(summary).toContain("taskCommit: raw");
    expect(summary).toContain("workflowCommit: raw");
    expect(summary).toContain("workflowPush: raw");
    expect(summary).toContain("Resolved: .arc/active/technical/meta-foo.md");
  });

  it("renders the Worktree section between User and Extensions", () => {
    const summary = buildSessionInitStatusSummary(makeSessionInitResult());
    const lines = summary.split("\n");
    const idxOfLine = (label: string): number => lines.findIndex((l) => l === label);
    const userIdx = idxOfLine("User:");
    const worktreeIdx = idxOfLine("Worktree:");
    const extIdx = idxOfLine("Extensions:");
    expect(worktreeIdx).toBeGreaterThan(userIdx);
    expect(extIdx).toBeGreaterThan(worktreeIdx);
  });

  it("renders worktree drift states with counts", () => {
    const summary = buildSessionInitStatusSummary(
      makeSessionInitResult({
        worktree: {
          ok: true,
          value: {
            state: "remote-ahead",
            ahead: 0,
            behind: 3,
            branch: "main",
            recommendedAction: "prompt",
            recommendedPromptText: "Worktree: branch is behind origin by 3 commit(s).\nPull?",
            identity: { kind: "primary" },
            supersession: null,
          },
        },
      }),
    );
    expect(summary).toContain("remote ahead by 3");
  });

  it("renders worktree remote-unavailable with the failureReason qualifier", () => {
    const summary = buildSessionInitStatusSummary(
      makeSessionInitResult({
        worktree: {
          ok: true,
          value: {
            state: "remote-unavailable",
            ahead: 0,
            behind: 0,
            branch: "main",
            failureReason: "timeout",
            recommendedAction: "surface",
            recommendedPromptText: "",
            identity: { kind: "primary" },
            supersession: null,
          },
        },
      }),
    );
    expect(summary).toContain("remote unavailable (timeout)");
  });

  it("renders worktree branch-gone with a deleted-upstream summary", () => {
    const summary = buildSessionInitStatusSummary(
      makeSessionInitResult({
        worktree: {
          ok: true,
          value: {
            state: "branch-gone",
            ahead: 0,
            behind: 0,
            branch: "feat/x",
            recommendedAction: "surface",
            recommendedPromptText: "",
            identity: { kind: "primary" },
            supersession: null,
          },
        },
      }),
    );
    expect(summary).toContain("branch gone");
  });

  it("renders an (unavailable) marker for an errored session-init slot", () => {
    const summary = buildSessionInitStatusSummary(
      makeSessionInitResult({
        user: { ok: false, error: { kind: "runtime", message: "git config fetch failed" } },
      }),
    );
    expect(summary).toContain("(unavailable) git config fetch failed");
  });

  it("renders Release Routing between Config and Active", () => {
    const summary = buildSessionInitStatusSummary(makeSessionInitResult());
    const lines = summary.split("\n");
    const idxOfLine = (label: string): number => lines.findIndex((l) => l === label);
    const configIdx = idxOfLine("Config:");
    const releaseRoutingIdx = idxOfLine("Release Routing:");
    const activeIdx = idxOfLine("Active:");
    expect(releaseRoutingIdx).toBeGreaterThan(configIdx);
    expect(activeIdx).toBeGreaterThan(releaseRoutingIdx);
  });

  it("renders the Domain Rules section after the Active section", () => {
    const summary = buildSessionInitStatusSummary(makeSessionInitResult());
    const lines = summary.split("\n");
    const idxOfLine = (label: string): number => lines.findIndex((l) => l === label);
    const activeIdx = idxOfLine("Active:");
    const domainRulesIdx = idxOfLine("Domain Rules:");
    expect(domainRulesIdx).toBeGreaterThan(activeIdx);
  });

  it("delegates the Domain Rules slot to its formatter (empty case)", () => {
    const summary = buildSessionInitStatusSummary(makeSessionInitResult());
    expect(summary).toContain("Domain Rules:");
    expect(summary).toContain("No domain rules.");
  });

  it("delegates the Domain Rules slot to its formatter (populated case)", () => {
    const summary = buildSessionInitStatusSummary(
      makeSessionInitResult({
        domainRules: {
          ok: true,
          value: {
            mode: "session-init",
            rules: [
              {
                path: ".arc/system/rules/DEV-RULES.FRONTEND.md",
                domain: "frontend",
                purpose: "UI standards",
              },
            ],
            warnings: [],
          },
        },
      }),
    );
    expect(summary).toContain("1 domain rule(s):");
    expect(summary).toContain("- frontend — UI standards");
  });

  it("renders an (unavailable) marker when the Domain Rules slot errors", () => {
    const summary = buildSessionInitStatusSummary(
      makeSessionInitResult({
        domainRules: {
          ok: false,
          error: { kind: "runtime", message: "constitution dir missing" },
        },
      }),
    );
    expect(summary).toContain("Domain Rules:");
    expect(summary).toContain("(unavailable) constitution dir missing");
  });
});
