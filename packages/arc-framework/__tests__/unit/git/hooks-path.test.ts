/**
 * Unit tests for hooks-path classification (missing core.hooksPath guard).
 */

import { describe, expect, it } from "vitest";

import {
  classifyHooksPath,
  formatMissingHooksPathMessage,
  isDisabledHooksPath,
} from "../../../src/lib/git/hooks-path.js";

describe("isDisabledHooksPath", () => {
  it("recognizes intentional no-op paths", () => {
    expect(isDisabledHooksPath("/dev/null")).toBe(true);
    expect(isDisabledHooksPath("NUL")).toBe(true);
    expect(isDisabledHooksPath("nul")).toBe(true);
    expect(isDisabledHooksPath("\\\\.\\NUL")).toBe(true);
  });

  it("does not treat ordinary hooks directories as disabled", () => {
    expect(isDisabledHooksPath(".husky/_")).toBe(false);
    expect(isDisabledHooksPath("/repo/.git/hooks")).toBe(false);
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
