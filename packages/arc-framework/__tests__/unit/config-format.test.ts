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
  "inbox.remind_after_days": "1",
  "integration.stale_after_days": "2",
  "branch.base": "main",
  "branch.protection": "full",
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

const SESSION_INIT_SETTINGS: ConfigSessionInitSettings = {
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
    ...overrides,
  };
}

describe("buildConfigStatusSummary — counts + keys", () => {
  it("renders the agent-consumable headline with the FULL_SETTINGS count", () => {
    const summary = buildConfigStatusSummary(fullResult());
    const expectedCount = Object.keys(FULL_SETTINGS).filter((k) => !k.startsWith("hooks.")).length;
    expect(summary.split("\n")[0]).toBe(`${expectedCount} agent-consumable settings (hooks.* excluded):`);
  });

  it("lists every setting key with its value", () => {
    const summary = buildConfigStatusSummary(fullResult());
    expect(summary).toContain("pm.mode: arc-in-git");
    expect(summary).toContain("branch.protection: full");
    expect(summary).toContain("archive.cadence: with-integration");
    expect(summary).toContain("user.notes_push: on-sync");
  });

  it("marks defaulted keys with a (default) suffix", () => {
    const summary = buildConfigStatusSummary(
      fullResult({ defaultsApplied: ["pm.mode", "branch.protection"] }),
    );
    expect(summary).toContain("pm.mode: arc-in-git (default)");
    expect(summary).toContain("branch.protection: full (default)");
    expect(summary).toContain("user.notes_push: on-sync");
    expect(summary).not.toContain("user.notes_push: on-sync (default)");
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

  it(`lists only the ${Object.keys(SESSION_INIT_SETTINGS).length} init-gating keys`, () => {
    const summary = buildConfigSessionInitSummary(sessionInitResult());
    for (const [key, value] of Object.entries(SESSION_INIT_SETTINGS)) {
      expect(summary).toContain(`${key}: ${value}`);
    }
    expect(summary).not.toContain("branch.base:");

    // Exclusivity: the rendered key set must equal the configured init-gating
    // set — extra keys would silently slip past the inclusion checks above.
    const renderedKeys = summary
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== "Init-gating settings:")
      .map((line) => line.split(":")[0]?.trim())
      .filter((key): key is string => key !== undefined && key.length > 0);
    expect([...renderedKeys].sort()).toEqual(Object.keys(SESSION_INIT_SETTINGS).sort());
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
    expect(roundTripped.settings["session.remote_sync"]).toBe("enabled");
    expect(roundTripped.settings["user.notes_push"]).toBe("on-sync");
    expect(roundTripped.defaultsApplied).toEqual(["pm.mode"]);
  });
});
