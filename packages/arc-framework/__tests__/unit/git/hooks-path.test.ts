/**
 * Unit tests for hooks-path classification (missing core.hooksPath guard).
 */

import { describe, expect, it, vi } from "vitest";

import {
  classifyHooksPath,
  formatMissingHooksPathMessage,
  isDisabledHooksPath,
  resolveHooksPathVerdict,
  type HooksPathGitExec,
} from "../../../src/lib/git/hooks-path.js";

describe("isDisabledHooksPath", () => {
  it("recognizes intentional no-op paths", () => {
    expect(isDisabledHooksPath("/dev/null")).toBe(true);
    expect(isDisabledHooksPath("NUL")).toBe(true);
    expect(isDisabledHooksPath("nul")).toBe(true);
    // Windows device path \\.\NUL normalizes to //./nul after slash rewrite.
    expect(isDisabledHooksPath("\\\\.\\NUL")).toBe(true);
  });

  it("does not treat ordinary hooks directories or paths ending in nul as disabled", () => {
    expect(isDisabledHooksPath(".husky/_")).toBe(false);
    expect(isDisabledHooksPath("/repo/.git/hooks")).toBe(false);
    expect(isDisabledHooksPath("/repo/hooks/nul")).toBe(false);
    expect(isDisabledHooksPath("/tmp/project-nul")).toBe(false);
  });
});

describe("classifyHooksPath", () => {
  it("accepts a present configured path", () => {
    expect(classifyHooksPath({
      resolvedPath: "/repo/.husky/_",
      configured: ".husky/_",
      exists: true,
    })).toEqual({
      kind: "ok",
      resolvedPath: "/repo/.husky/_",
      reason: "present",
    });
  });

  it("accepts an unset path when the default hooks dir exists", () => {
    expect(classifyHooksPath({
      resolvedPath: "/repo/.git/hooks",
      configured: null,
      exists: true,
    })).toEqual({
      kind: "ok",
      resolvedPath: "/repo/.git/hooks",
      reason: "unset-default-present",
    });
  });

  it("accepts intentional /dev/null even when the path does not exist as a directory", () => {
    expect(classifyHooksPath({
      resolvedPath: "/dev/null",
      configured: "/dev/null",
      exists: false,
    })).toEqual({
      kind: "ok",
      resolvedPath: "/dev/null",
      reason: "disabled",
    });
  });

  it("refuses a configured husky path that is missing", () => {
    expect(classifyHooksPath({
      resolvedPath: "/worktree/.husky/_",
      configured: ".husky/_",
      exists: false,
    })).toEqual({
      kind: "missing",
      configured: ".husky/_",
      resolvedPath: "/worktree/.husky/_",
    });
  });

  it("refuses when the resolved path is empty", () => {
    expect(classifyHooksPath({
      resolvedPath: "  ",
      configured: ".husky/_",
      exists: false,
    })).toEqual({
      kind: "missing",
      configured: ".husky/_",
      resolvedPath: "",
    });
  });
});

describe("formatMissingHooksPathMessage", () => {
  it("names the configured path, resolved path, and invoking command", () => {
    const message = formatMissingHooksPathMessage(
      {
        kind: "missing",
        configured: ".husky/_",
        resolvedPath: "/worktree/.husky/_",
      },
      "arc release commit",
    );
    expect(message).toContain("core.hooksPath '.husky/_'");
    expect(message).toContain("/worktree/.husky/_");
    expect(message).toContain("arc release commit");
    expect(message).toContain("npm install");
    expect(message.endsWith("\n")).toBe(true);
  });
});

describe("resolveHooksPathVerdict", () => {
  it("builds git args, classifies a present absolute hooks path, and records config", async () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    const exec: HooksPathGitExec = async (command, args, opts) => {
      calls.push({ command, args: [...args], cwd: opts.cwd });
      if (args[0] === "rev-parse") return { stdout: "/worktree/.husky/_\n" };
      if (args[0] === "config") return { stdout: ".husky/_\n" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    };
    const pathExists = vi.fn(() => true);

    await expect(resolveHooksPathVerdict("/worktree", exec, pathExists)).resolves.toEqual({
      kind: "ok",
      resolvedPath: "/worktree/.husky/_",
      reason: "present",
    });
    expect(calls).toEqual([
      {
        command: "git",
        args: ["rev-parse", "--path-format=absolute", "--git-path", "hooks"],
        cwd: "/worktree",
      },
      {
        command: "git",
        args: ["config", "--get", "core.hooksPath"],
        cwd: "/worktree",
      },
    ]);
    expect(pathExists).toHaveBeenCalledWith("/worktree/.husky/_");
  });

  it("treats config --get rejection as unset and resolves relative hooks paths", async () => {
    const exec: HooksPathGitExec = async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: "relative-hooks\n" };
      if (args[0] === "config") throw new Error("exit 1: key unset");
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    };

    await expect(
      resolveHooksPathVerdict("/worktree", exec, (path) => path === "/worktree/relative-hooks"),
    ).resolves.toEqual({
      kind: "ok",
      resolvedPath: "/worktree/relative-hooks",
      reason: "unset-default-present",
    });
  });

  it("returns missing when the resolved hooks directory does not exist", async () => {
    const exec: HooksPathGitExec = async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: "/worktree/.husky/_\n" };
      if (args[0] === "config") return { stdout: ".husky/_\n" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    };

    await expect(
      resolveHooksPathVerdict("/worktree", exec, () => false),
    ).resolves.toEqual({
      kind: "missing",
      configured: ".husky/_",
      resolvedPath: "/worktree/.husky/_",
    });
  });
});
