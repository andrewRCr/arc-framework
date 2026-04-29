/**
 * Unit tests for `arc config status` formatters.
 *
 * Covers Clack summaries (full + session-init) and verifies the typed JSON
 * shape round-trips cleanly through JSON.stringify so the harness gets
 * exactly the fields the type declares.
 */

import { describe, it, expect } from "vitest";

import {
  buildConfigSessionInitSummary,
  buildConfigStatusSummary,
} from "../../src/commands/config/format.js";
import type {
  ConfigSessionInitResult,
  ConfigSessionInitSettings,
  ConfigSettings,
  ConfigStatusResult,
} from "../../src/commands/config/types.js";

const FULL_SETTINGS: ConfigSettings = {
  "branch.base": "main",
  "branch.protection": "full",
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
  "user.sync_push": "always",
};

const SESSION_INIT_SETTINGS: ConfigSessionInitSettings = {
  "session.remote_sync": "enabled",
  "session.init_pull.worktree": "prompt",
  "session.init_pull.notes": "prompt",
  "branch.protection": "full",
  "pm.mode": "arc-in-git",
  "commit.format": "conventional",
  "commit.context_footer": "required",
};

function fullResult(overrides: Partial<ConfigStatusResult> = {}): ConfigStatusResult {
  return {
    mode: "full",
    settings: { ...FULL_SETTINGS },
    defaultsApplied: [],
    warnings: [],
    ...overrides,
  };
}

function sessionInitResult(
  overrides: Partial<ConfigSessionInitResult> = {},
): ConfigSessionInitResult {
  return {
    mode: "session-init",
    settings: { ...SESSION_INIT_SETTINGS },
    defaultsApplied: [],
    warnings: [],
    autonomy: { value: "manual-commit", source: "default" },
    ...overrides,
  };
}

describe("buildConfigStatusSummary — counts + keys", () => {
  it("renders the agent-consumable headline with 15 settings", () => {
    const summary = buildConfigStatusSummary(fullResult());
    expect(summary.split("\n")[0]).toBe("15 agent-consumable settings (hooks.* excluded):");
  });

  it("lists every setting key with its value", () => {
    const summary = buildConfigStatusSummary(fullResult());
    expect(summary).toContain("pm.mode: arc-in-git");
    expect(summary).toContain("branch.protection: full");
    expect(summary).toContain("user.sync_push: always");
  });

  it("marks defaulted keys with a (default) suffix", () => {
    const summary = buildConfigStatusSummary(
      fullResult({ defaultsApplied: ["pm.mode", "branch.protection"] }),
    );
    expect(summary).toContain("pm.mode: arc-in-git (default)");
    expect(summary).toContain("branch.protection: full (default)");
    expect(summary).toContain("user.sync_push: always");
    expect(summary).not.toContain("user.sync_push: always (default)");
  });

  it("does not include a (default) suffix when no defaults were applied", () => {
    const summary = buildConfigStatusSummary(fullResult());
    expect(summary).not.toContain("(default)");
  });

  it("appends a Warnings section when warnings are present", () => {
    const summary = buildConfigStatusSummary(
      fullResult({ warnings: ["Unable to read arc-config.yml: ENOENT"] }),
    );
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("Unable to read arc-config.yml: ENOENT");
  });

  it("omits the Warnings section when no warnings", () => {
    const summary = buildConfigStatusSummary(fullResult());
    expect(summary).not.toContain("Warnings:");
  });
});

describe("buildConfigSessionInitSummary — narrow subset", () => {
  it("renders the init-gating headline", () => {
    const summary = buildConfigSessionInitSummary(sessionInitResult());
    expect(summary.split("\n")[0]).toBe("Init-gating settings:");
  });

  it("lists only the 7 init-gating keys", () => {
    const summary = buildConfigSessionInitSummary(sessionInitResult());
    expect(summary).toContain("session.remote_sync: enabled");
    expect(summary).toContain("session.init_pull.worktree: prompt");
    expect(summary).toContain("session.init_pull.notes: prompt");
    expect(summary).toContain("branch.protection: full");
    expect(summary).toContain("pm.mode: arc-in-git");
    expect(summary).toContain("commit.format: conventional");
    expect(summary).toContain("commit.context_footer: required");
    expect(summary).not.toContain("branch.base:");
    expect(summary).not.toContain("user.sync_push:");
  });

  it("marks defaulted keys", () => {
    const summary = buildConfigSessionInitSummary(
      sessionInitResult({ defaultsApplied: ["session.remote_sync"] }),
    );
    expect(summary).toContain("session.remote_sync: enabled (default)");
    expect(summary).toContain("pm.mode: arc-in-git");
    expect(summary).not.toContain("pm.mode: arc-in-git (default)");
  });

  it("appends Warnings when present", () => {
    const summary = buildConfigSessionInitSummary(
      sessionInitResult({ warnings: ["boom"] }),
    );
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("- boom");
  });
});

describe("JSON round-trip — typed result shape is stable", () => {
  it("full-mode result preserves all fields through JSON.stringify/parse", () => {
    const result = fullResult({
      defaultsApplied: ["branch.base"],
      warnings: ["Unable to read arc-config.yml"],
    });
    const roundTripped = JSON.parse(JSON.stringify(result)) as ConfigStatusResult;
    expect(roundTripped.mode).toBe("full");
    expect(roundTripped.settings["pm.mode"]).toBe("arc-in-git");
    expect(roundTripped.defaultsApplied).toEqual(["branch.base"]);
    expect(roundTripped.warnings).toEqual(["Unable to read arc-config.yml"]);
  });

  it("session-init result preserves fields through JSON.stringify/parse", () => {
    const result = sessionInitResult({ defaultsApplied: ["pm.mode"] });
    const roundTripped = JSON.parse(JSON.stringify(result)) as ConfigSessionInitResult;
    expect(roundTripped.mode).toBe("session-init");
    expect(roundTripped.settings["pm.mode"]).toBe("arc-in-git");
    expect(roundTripped.defaultsApplied).toEqual(["pm.mode"]);
  });
});
