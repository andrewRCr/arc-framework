/**
 * Integration tests for the config-status probe.
 *
 * Builds a synthetic `.arc/system/arc-config.yml` in a temp directory and
 * exercises the real `runConfigStatus` / `runConfigSessionInitStatus`
 * against it — covering full settings readback, session-init narrowing,
 * defaults fallback on missing keys, and hooks.* exclusion.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runConfigSessionInitStatus,
  runConfigStatus,
} from "../../src/commands/config.js";

interface Fixture {
  root: string;
  configPath: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-config-probe-"));
  const configDir = join(root, ".arc", "system");
  await mkdir(configDir, { recursive: true });
  return { root, configPath: join(configDir, "arc-config.yml") };
}

describe("runConfigStatus — full mode", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns full settings when arc-config.yml contains every key", async () => {
    const content = [
      "branch.base: main",
      "branch.protection: full",
      "commit.format: conventional",
      "commit.context_footer: required",
      "commit.custom_pattern:",
      "commit.context_pattern:",
      "merge.strategy: merge",
      "review.pre_merge: enabled",
      "platform.type: github",
      "pm.mode: arc-in-git",
      "team.mode: false",
      "session.remote_sync: enabled",
      "session.init_pull.worktree: prompt",
      "session.init_pull.notes: prompt",
      "session.commit_interlock: manual",
      "session.push_interlock: manual",
      "archive.cadence: manual",
      "user.notes_push: on-sync",
    ].join("\n");
    await writeFile(fixture.configPath, content);

    const result = await runConfigStatus({ cwd: fixture.root });
    expect(result.mode).toBe("full");
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["branch.protection"]).toBe("full");
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.settings["session.commit_interlock"]).toBe("manual");
    expect(result.settings["session.push_interlock"]).toBe("manual");
    expect(result.settings["archive.cadence"]).toBe("manual");
    expect(result.warnings).toHaveLength(0);
    // Empty values in the file fall through to defaults per shell-aligned parser behavior.
    expect(result.defaultsApplied).toContain("commit.custom_pattern");
    expect(result.defaultsApplied).toContain("commit.context_pattern");
  });

  it("falls back to defaults when arc-config.yml is missing", async () => {
    const result = await runConfigStatus({ cwd: fixture.root });
    expect(result.mode).toBe("full");
    expect(result.settings["pm.mode"]).toBe("none");
    expect(result.settings["branch.protection"]).toBe("partial");
    expect(result.settings["archive.cadence"]).toBe("with-integration");
    expect(result.defaultsApplied.length).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("arc-config.yml");
  });

  it("excludes hooks.* keys from the settings map", async () => {
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "hooks.pre_commit: enabled",
        "hooks.commit_msg: disabled",
        "hooks.task_numbering: off",
        "hooks.meta_ref_patterns: '[Tt]ask [0-9]+'",
      ].join("\n"),
    );
    const result = await runConfigStatus({ cwd: fixture.root });
    const keys = Object.keys(result.settings) as string[];
    for (const key of keys) {
      expect(key.startsWith("hooks.")).toBe(false);
    }
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
  });
});

describe("runConfigSessionInitStatus — init-gating subset", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns only the 10 init-gating keys", async () => {
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "branch.base: main",
        "branch.protection: full",
        "commit.format: conventional",
        "commit.context_footer: required",
        "session.remote_sync: disabled",
        "session.init_pull.worktree: manual",
        "session.init_pull.notes: always",
        "session.commit_interlock: on-task-approval",
        "session.push_interlock: on-sync",
        "session.sync_interlock: manual",
        "user.notes_push: prompt",
      ].join("\n"),
    );
    const result = await runConfigSessionInitStatus({ cwd: fixture.root });
    expect(result.mode).toBe("session-init");
    const keys = Object.keys(result.settings).sort();
    expect(keys).toEqual([
      "branch.protection",
      "commit.context_footer",
      "commit.format",
      "pm.mode",
      "session.commit_interlock",
      "session.init_pull.notes",
      "session.init_pull.worktree",
      "session.push_interlock",
      "session.remote_sync",
      "session.sync_interlock",
    ]);
    expect(result.settings["session.remote_sync"]).toBe("disabled");
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["session.init_pull.worktree"]).toBe("manual");
    expect(result.settings["session.init_pull.notes"]).toBe("always");
    expect(result.settings["session.commit_interlock"]).toBe("on-task-approval");
    expect(result.settings["session.push_interlock"]).toBe("on-sync");
    expect(result.settings["session.sync_interlock"]).toBe("manual");
  });

  it("falls back to documented defaults when arc-config.yml is missing", async () => {
    const result = await runConfigSessionInitStatus({ cwd: fixture.root });
    expect(result.settings["session.remote_sync"]).toBe("enabled");
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.settings["session.commit_interlock"]).toBe("manual");
    expect(result.settings["session.push_interlock"]).toBe("manual");
    expect(result.settings["session.sync_interlock"]).toBe("on-handoff");
    expect(result.settings["pm.mode"]).toBe("none");
    expect(result.settings["branch.protection"]).toBe("partial");
    expect(result.defaultsApplied).toContain("session.remote_sync");
    expect(result.defaultsApplied).toContain("session.init_pull.worktree");
    expect(result.defaultsApplied).toContain("session.init_pull.notes");
    expect(result.defaultsApplied).toContain("session.commit_interlock");
    expect(result.defaultsApplied).toContain("session.push_interlock");
    expect(result.defaultsApplied).toContain("session.sync_interlock");
    expect(result.warnings).toHaveLength(1);
  });

  it("reports only scoped keys in defaultsApplied when others are missing", async () => {
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "branch.protection: full",
        "commit.format: conventional",
        "commit.context_footer: required",
        "session.remote_sync: enabled",
        "session.init_pull.worktree: prompt",
        "session.init_pull.notes: prompt",
        "session.commit_interlock: manual",
        "session.push_interlock: manual",
        "session.sync_interlock: on-handoff",
      ].join("\n"),
    );
    const result = await runConfigSessionInitStatus({ cwd: fixture.root });
    // Non-scoped keys may be defaulted under the hood, but scoped defaults list excludes them.
    expect(result.defaultsApplied).toHaveLength(0);
    const scopedKeys = [
      "session.remote_sync",
      "session.init_pull.worktree",
      "session.init_pull.notes",
      "session.commit_interlock",
      "session.push_interlock",
      "session.sync_interlock",
      "branch.protection",
      "pm.mode",
      "commit.format",
      "commit.context_footer",
    ];
    for (const key of result.defaultsApplied) {
      expect(scopedKeys).toContain(key);
    }
  });

  it("propagates init_pull validation errors through the session-init envelope", async () => {
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "session.init_pull.worktree: always",
      ].join("\n"),
    );
    const result = await runConfigSessionInitStatus({ cwd: fixture.root });
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((e) => e.includes("session.init_pull.worktree"))).toBe(true);
  });

  describe("session interlock settings", () => {
    it("passes interlock values through verbatim (validation lives in resolveAllSettings)", async () => {
      await writeFile(
        fixture.configPath,
        [
          "pm.mode: arc-in-git",
          "session.commit_interlock: automatic",
          "session.push_interlock: auto",
        ].join("\n"),
      );
      const result = await runConfigSessionInitStatus({ cwd: fixture.root });
      // Reader is the yaml-only surface — release-mode keys flow through as
      // raw strings. The wrapper (`resolveAllSettings`) owns validation;
      // operational paths warn-and-fall-through there.
      expect(result.settings["session.commit_interlock"]).toBe("automatic");
      expect(result.settings["session.push_interlock"]).toBe("auto");
      expect(result.warnings.some((w) => w.includes("session.commit_interlock"))).toBe(false);
      expect(result.warnings.some((w) => w.includes("session.push_interlock"))).toBe(false);
    });
  });
});
