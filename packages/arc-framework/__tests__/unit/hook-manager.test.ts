/**
 * Unit tests for hook manager detection.
 *
 * Tests the detectHookManager function which identifies whether a project
 * uses husky, lefthook, or pre-commit for git hook management.
 */

import { describe, it, expect } from "vitest";
import { detectHookManager } from "../../src/lib/hook-manager.js";
import type { HookManagerResult } from "../../src/lib/hook-manager.js";

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
