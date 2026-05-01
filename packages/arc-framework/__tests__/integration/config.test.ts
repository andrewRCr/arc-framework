/**
 * Integration tests for the config-status probe.
 *
 * Builds a synthetic `.arc/system/arc-config.yml` in a temp directory and
 * exercises the real `runConfigStatus` / `runConfigSessionInitStatus`
 * against it — covering full settings readback, session-init narrowing,
 * defaults fallback on missing keys, and hooks.* exclusion.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runConfigSessionInitStatus,
  runConfigStatus,
} from "../../src/commands/config.js";
import { AUTONOMY_GIT_CONFIG_KEY } from "../../src/lib/autonomy-policy.js";
import type { GitExec } from "../../src/lib/git/index.js";

interface Fixture {
  root: string;
  configPath: string;
}

/** Build a mock git exec that returns the given value for `git config --get arc.autonomy`. */
function execWithAutonomy(value: string | undefined): GitExec {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "config" && args[1] === "--get" && args[2] === AUTONOMY_GIT_CONFIG_KEY) {
      if (value === undefined) return Promise.reject(new Error("exit 1"));
      return Promise.resolve({ stdout: `${value}\n` });
    }
    return Promise.reject(new Error(`unexpected: ${cmd} ${args.join(" ")}`));
  }) as unknown as GitExec;
}

/** Convenience: exec stub with no override (override absent). */
const noOverride = (): GitExec => execWithAutonomy(undefined);

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
      "user.sync_push: always",
    ].join("\n");
    await writeFile(fixture.configPath, content);

    const result = await runConfigStatus({ cwd: fixture.root });
    expect(result.mode).toBe("full");
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["branch.protection"]).toBe("full");
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
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

  it("returns only the 7 init-gating keys", async () => {
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
        "user.sync_push: prompt",
      ].join("\n"),
    );
    const result = await runConfigSessionInitStatus({ cwd: fixture.root, exec: noOverride() });
    expect(result.mode).toBe("session-init");
    const keys = Object.keys(result.settings).sort();
    expect(keys).toEqual([
      "branch.protection",
      "commit.context_footer",
      "commit.format",
      "pm.mode",
      "session.init_pull.notes",
      "session.init_pull.worktree",
      "session.remote_sync",
    ]);
    expect(result.settings["session.remote_sync"]).toBe("disabled");
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["session.init_pull.worktree"]).toBe("manual");
    expect(result.settings["session.init_pull.notes"]).toBe("always");
  });

  it("falls back to documented defaults when arc-config.yml is missing", async () => {
    const result = await runConfigSessionInitStatus({ cwd: fixture.root, exec: noOverride() });
    expect(result.settings["session.remote_sync"]).toBe("enabled");
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.settings["pm.mode"]).toBe("none");
    expect(result.settings["branch.protection"]).toBe("partial");
    expect(result.defaultsApplied).toContain("session.remote_sync");
    expect(result.defaultsApplied).toContain("session.init_pull.worktree");
    expect(result.defaultsApplied).toContain("session.init_pull.notes");
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
      ].join("\n"),
    );
    const result = await runConfigSessionInitStatus({ cwd: fixture.root, exec: noOverride() });
    // Non-scoped keys may be defaulted under the hood, but scoped defaults list excludes them.
    expect(result.defaultsApplied).toHaveLength(0);
    const scopedKeys = [
      "session.remote_sync",
      "session.init_pull.worktree",
      "session.init_pull.notes",
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
    const result = await runConfigSessionInitStatus({ cwd: fixture.root, exec: noOverride() });
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((e) => e.includes("session.init_pull.worktree"))).toBe(true);
  });

  describe("autonomy field", () => {
    it("returns { value: 'manual-commit', source: 'default' } when both sources absent", async () => {
      await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
      const result = await runConfigSessionInitStatus({ cwd: fixture.root, exec: noOverride() });
      expect(result.autonomy).toEqual({ value: "manual-commit", source: "default" });
    });

    it("returns { value: <yaml>, source: 'yaml' } when only yaml provides", async () => {
      await writeFile(
        fixture.configPath,
        ["pm.mode: arc-in-git", "session.autonomy: auto-commit"].join("\n"),
      );
      const result = await runConfigSessionInitStatus({ cwd: fixture.root, exec: noOverride() });
      expect(result.autonomy).toEqual({ value: "auto-commit", source: "yaml" });
    });

    it("returns { value: <git-config>, source: 'git-config' } when override applies", async () => {
      await writeFile(
        fixture.configPath,
        ["pm.mode: arc-in-git", "session.autonomy: manual-commit"].join("\n"),
      );
      const result = await runConfigSessionInitStatus({
        cwd: fixture.root,
        exec: execWithAutonomy("auto-push"),
      });
      expect(result.autonomy).toEqual({ value: "auto-push", source: "git-config" });
    });

    it("propagates resolver warnings into the warnings array unchanged", async () => {
      await writeFile(
        fixture.configPath,
        ["pm.mode: arc-in-git", "session.autonomy: bogus"].join("\n"),
      );
      const result = await runConfigSessionInitStatus({
        cwd: fixture.root,
        exec: execWithAutonomy("alsowrong"),
      });
      // Both tiers invalid → falls back to default; both warnings surface verbatim.
      expect(result.autonomy).toEqual({ value: "manual-commit", source: "default" });
      const autonomyWarnings = result.warnings.filter((w) =>
        w.includes(AUTONOMY_GIT_CONFIG_KEY) || w.includes("session.autonomy"),
      );
      expect(autonomyWarnings).toHaveLength(2);
      expect(autonomyWarnings.some((w) => w.includes("alsowrong"))).toBe(true);
      expect(autonomyWarnings.some((w) => w.includes("bogus"))).toBe(true);
    });
  });
});
