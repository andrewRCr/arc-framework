/**
 * Unit tests for hook manager detection.
 *
 * Tests the detectHookManager function which identifies whether a project
 * uses husky, lefthook, or pre-commit for git hook management.
 */

import { describe, it, expect } from "vitest";
import { detectHookManager, hasEffectiveHook } from "../../src/lib/hook-manager.js";
import type { EffectiveHookIO, HookManagerResult } from "../../src/lib/hook-manager.js";

/**
 * Creates a mock access function that resolves for paths in the provided
 * set and rejects for all others (simulating file existence checks).
 */
function mockAccess(existingPaths: Set<string>): (path: string) => Promise<void> {
  return async (path: string) => {
    if (existingPaths.has(path)) return;
    throw new Error(`ENOENT: no such file or directory, access '${path}'`);
  };
}

function mockEffectiveHookIO(files: Record<string, string>): EffectiveHookIO {
  return {
    access: async (path) => {
      if (path in files) return;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    },
    readFile: async (path) => {
      const content = files[path];
      if (content !== undefined) return content;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    },
    resolveGitHookPath: async (_cwd, name) => `/fake/repo/.git/hooks/${name}`,
  };
}

describe("detectHookManager", () => {
  const cwd = "/fake/repo";

  it("detects husky when .husky/ directory exists", async () => {
    const access = mockAccess(new Set(["/fake/repo/.husky"]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "husky",
      configPath: "/fake/repo/.husky",
    });
  });

  it("detects lefthook when lefthook.yml exists", async () => {
    const access = mockAccess(new Set(["/fake/repo/lefthook.yml"]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "lefthook",
      configPath: "/fake/repo/lefthook.yml",
    });
  });

  it("detects lefthook when lefthook.yaml exists", async () => {
    const access = mockAccess(new Set(["/fake/repo/lefthook.yaml"]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "lefthook",
      configPath: "/fake/repo/lefthook.yaml",
    });
  });

  it("detects pre-commit when .pre-commit-config.yaml exists", async () => {
    const access = mockAccess(new Set(["/fake/repo/.pre-commit-config.yaml"]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "pre-commit",
      configPath: "/fake/repo/.pre-commit-config.yaml",
    });
  });

  it("returns null when no manager found", async () => {
    const access = mockAccess(new Set());
    const result = await detectHookManager(cwd, access);

    expect(result).toBeNull();
  });

  it("prefers husky over lefthook when both exist", async () => {
    const access = mockAccess(new Set([
      "/fake/repo/.husky",
      "/fake/repo/lefthook.yml",
    ]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "husky",
      configPath: "/fake/repo/.husky",
    });
  });

  it("prefers husky over pre-commit when both exist", async () => {
    const access = mockAccess(new Set([
      "/fake/repo/.husky",
      "/fake/repo/.pre-commit-config.yaml",
    ]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "husky",
      configPath: "/fake/repo/.husky",
    });
  });

  it("prefers lefthook over pre-commit when both exist", async () => {
    const access = mockAccess(new Set([
      "/fake/repo/lefthook.yml",
      "/fake/repo/.pre-commit-config.yaml",
    ]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "lefthook",
      configPath: "/fake/repo/lefthook.yml",
    });
  });

  it("prefers lefthook.yml over lefthook.yaml when both exist", async () => {
    const access = mockAccess(new Set([
      "/fake/repo/lefthook.yml",
      "/fake/repo/lefthook.yaml",
    ]));
    const result = await detectHookManager(cwd, access);

    expect(result).toEqual<HookManagerResult>({
      manager: "lefthook",
      configPath: "/fake/repo/lefthook.yml",
    });
  });
});

describe("hasEffectiveHook", () => {
  const cwd = "/fake/repo";

  it("finds a Husky hook in the manager's public hook directory", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.husky": "",
      "/fake/repo/.husky/prepare-commit-msg": "#!/usr/bin/env sh\n",
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(true);
  });

  it("ignores Husky's dispatcher shim when the public hook is absent", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.husky": "",
      "/fake/repo/.husky/_/prepare-commit-msg": "#!/usr/bin/env sh\n",
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(false);
  });

  it("finds a Lefthook section with configured commands", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/lefthook.yml": "prepare-commit-msg:\n  commands:\n    format:\n      run: format-message\n",
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(true);
  });

  it("ignores a Lefthook config without the requested section", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/lefthook.yml": "pre-commit:\n  commands:\n    lint:\n      run: npm test\n",
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(false);
  });

  it("finds an explicit pre-commit hook-stage activation", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.pre-commit-config.yaml": [
        "repos:",
        "  - repo: local",
        "    hooks:",
        "      - id: format-message",
        "        stages: [prepare-commit-msg]",
      ].join("\n"),
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(true);
  });

  it("finds a pre-commit default install hook type", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.pre-commit-config.yaml": [
        "default_install_hook_types: [pre-commit, prepare-commit-msg]",
        "repos: []",
      ].join("\n"),
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(true);
  });

  it("presence-biases an ambiguous pre-commit default stage signal", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.pre-commit-config.yaml": [
        "default_stages: [prepare-commit-msg]",
        "repos:",
        "  - repo: local",
        "    hooks:",
        "      - id: format-message",
      ].join("\n"),
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(true);
  });

  it("ignores a pre-commit config without a requested-stage signal", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.pre-commit-config.yaml": [
        "repos:",
        "  - repo: local",
        "    hooks:",
        "      - id: lint",
        "        stages: [pre-commit]",
      ].join("\n"),
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(false);
  });

  it("finds an executable raw Git hook when no manager is detected", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.git/hooks/prepare-commit-msg": "#!/usr/bin/env sh\n",
    });

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(true);
  });

  it("ignores an absent raw Git hook", async () => {
    const io = mockEffectiveHookIO({});

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(false);
  });

  it("ignores a non-executable raw Git hook", async () => {
    const io = mockEffectiveHookIO({
      "/fake/repo/.git/hooks/prepare-commit-msg": "echo format\n",
    });
    io.access = async (path, mode) => {
      if (path === "/fake/repo/.git/hooks/prepare-commit-msg" && mode !== undefined) {
        throw Object.assign(new Error(`EACCES: ${path}`), { code: "EACCES" });
      }
      if (path === "/fake/repo/.git/hooks/prepare-commit-msg") return;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    };

    await expect(hasEffectiveHook(cwd, "prepare-commit-msg", io)).resolves.toBe(false);
  });
});
