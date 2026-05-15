/**
 * Integration tests for the config-status probe.
 *
 * Builds a synthetic `.arc/system/arc-config.yml` in a temp directory and
 * exercises the real `runConfigStatus` / `runConfigSessionInitStatus`
 * against it — covering full settings readback, session-init narrowing,
 * defaults fallback on missing keys, and hooks.* exclusion.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile as nodeReadFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runConfigSessionInitStatus,
  runConfigStatus,
} from "../../src/commands/config.js";
import type { ConfigSessionInitSettings } from "../../src/commands/config.js";

/**
 * Build a mock GitExec returning the given map of git-config values.
 * Mirrors the helper in `unit/config/resolved-settings.test.ts` so
 * session-init tests can exercise tier-1 overrides without a real repo.
 */
function buildExec(overrides: Record<string, string | undefined>) {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "config" && args[1] === "--get") {
      const key = args[2];
      const value = key === undefined ? undefined : overrides[key];
      if (value === undefined) return Promise.reject(new Error("exit 1"));
      return Promise.resolve({ stdout: `${value}\n` });
    }
    return Promise.reject(new Error(`unexpected call: ${cmd} ${(args ?? []).join(" ")}`));
  });
}

const realReadFile = (path: string): Promise<string> => nodeReadFile(path, "utf-8");
const noGitConfigExec = buildExec({});
const SESSION_INIT_SCOPED_KEYS = [
  "branch.protection",
  "commit.context_footer",
  "commit.format",
  "pm.mode",
  "session.init_load.notes",
  "session.init_pull.notes",
  "session.init_pull.worktree",
  "session.remote_sync",
  "user.notes_push",
] as const satisfies ReadonlyArray<keyof ConfigSessionInitSettings>;

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
      "review.planning_checkpoint: disabled",
      "platform.type: github",
      "pm.mode: arc-in-git",
      "team.mode: false",
      "session.remote_sync: enabled",
      "session.init_pull.worktree: prompt",
      "session.init_pull.notes: prompt",
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

  it(`returns only the ${SESSION_INIT_SCOPED_KEYS.length} init-gating keys with yaml values when no git-config override is set`, async () => {
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
        "session.init_load.notes: manual",
        "user.notes_push: prompt",
      ].join("\n"),
    );
    const result = await runConfigSessionInitStatus({
      cwd: fixture.root,
      exec: noGitConfigExec,
      readFile: realReadFile,
    });
    expect(result.mode).toBe("session-init");
    const keys = Object.keys(result.settings).sort();
    expect(keys).toEqual([...SESSION_INIT_SCOPED_KEYS].sort());
    // Non-`user.notes_push` keys are pass-through from readConfigSettings (yaml-only).
    expect(result.settings["session.remote_sync"]).toBe("disabled");
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["session.init_pull.worktree"]).toBe("manual");
    expect(result.settings["session.init_pull.notes"]).toBe("always");
    expect(result.settings["session.init_load.notes"]).toBe("manual");
    // user.notes_push reflects yaml when no git-config override is set.
    expect(result.settings["user.notes_push"]).toBe("prompt");
  });

  it("git-config override wins over yaml for the dual-scope notesPush key", async () => {
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "user.notes_push: on-sync",
      ].join("\n"),
    );
    const exec = buildExec({
      "arc.notesPush": "prompt",
    });
    const result = await runConfigSessionInitStatus({
      cwd: fixture.root,
      exec,
      readFile: realReadFile,
    });
    expect(result.settings["user.notes_push"]).toBe("prompt");
    // Non-release-mode keys remain yaml-only — no git-config probe.
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
  });

  it("falls back to documented defaults when arc-config.yml is missing", async () => {
    const result = await runConfigSessionInitStatus({
      cwd: fixture.root,
      exec: noGitConfigExec,
      readFile: realReadFile,
    });
    expect(result.settings["session.remote_sync"]).toBe("enabled");
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.settings["session.init_load.notes"]).toBe("prompt");
    expect(result.settings["user.notes_push"]).toBe("on-sync");
    expect(result.settings["pm.mode"]).toBe("none");
    expect(result.settings["branch.protection"]).toBe("partial");
    expect(result.defaultsApplied).toContain("session.remote_sync");
    expect(result.defaultsApplied).toContain("session.init_pull.worktree");
    expect(result.defaultsApplied).toContain("session.init_pull.notes");
    expect(result.defaultsApplied).toContain("session.init_load.notes");
    expect(result.defaultsApplied).toContain("user.notes_push");
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
        "session.init_load.notes: prompt",
        "user.notes_push: on-sync",
      ].join("\n"),
    );
    const result = await runConfigSessionInitStatus({
      cwd: fixture.root,
      exec: noGitConfigExec,
      readFile: realReadFile,
    });
    // Non-scoped keys may be defaulted under the hood, but scoped defaults list excludes them.
    expect(result.defaultsApplied).toHaveLength(0);
    for (const key of result.defaultsApplied) {
      expect(SESSION_INIT_SCOPED_KEYS).toContain(key as keyof ConfigSessionInitSettings);
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
    const result = await runConfigSessionInitStatus({
      cwd: fixture.root,
      exec: noGitConfigExec,
      readFile: realReadFile,
    });
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((e) => e.includes("session.init_pull.worktree"))).toBe(true);
  });

});
