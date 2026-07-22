import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

import { assertIndexedMarkdownCheckerAlignment } from "../../../src/lib/markdown/checker-alignment.js";
import {
  isMarkdownGateTriggerPath,
  MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS,
  runStagedMarkdownGate,
} from "../../../src/lib/markdown/staged-gate.js";

describe("staged Markdown gate", () => {
  it.each([
    "README.md",
    ".markdownlint.yml",
    "packages/arc-framework/src/lib/markdown/selection.ts",
    "packages/arc-framework/src/lib/markdown/descriptor-spacing.ts",
    "packages/arc-framework/src/scripts/lint-markdown-staged.ts",
    "packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md",
    "package.json",
    "packages/arc-framework/package.json",
    "package-lock.json",
  ])("triggers for %s", (path) => {
    expect(isMarkdownGateTriggerPath(path)).toBe(true);
  });

  it.each([
    "notes.txt",
    ".arc/completed/old.md",
    ".arc/user/andrew/USER-INBOX.md",
  ])("ignores unrelated or excluded path %s", (path) => {
    expect(isMarkdownGateTriggerPath(path)).toBe(false);
  });

  it("returns before certification for unrelated staged paths", async () => {
    const certify = vi.fn(async () => undefined);
    const exec = vi.fn(async () => ({ stdout: "notes.txt\0", stderr: "" }));

    await expect(runStagedMarkdownGate({ root: "/repo", exec, certify })).resolves.toEqual({
      triggered: false,
      changedPaths: ["notes.txt"],
    });
    expect(certify).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith("git", [
      "diff",
      "--cached",
      "--name-only",
      "--no-renames",
      "--diff-filter=ACMRD",
      "-z",
    ], { cwd: "/repo" });
  });

  it("runs certification once for any relevant staged path", async () => {
    const certify = vi.fn(async () => undefined);
    const exec = vi.fn(async () => ({ stdout: "notes.txt\0README.md\0", stderr: "" }));

    await expect(runStagedMarkdownGate({ root: "/repo", exec, certify })).resolves.toMatchObject({
      triggered: true,
    });
    expect(certify).toHaveBeenCalledTimes(1);
  });
});

describe("staged Markdown checker alignment", () => {
  it("accepts identical indexed and executing implementation bytes", async () => {
    const bytes = Buffer.from("implementation\n");
    const readBlob = vi.fn(async () => bytes);
    const readFile = vi.fn(async () => bytes);

    await expect(assertIndexedMarkdownCheckerAlignment({ root: "/repo", readBlob, readFile })).resolves.toBeUndefined();
    expect(readBlob).toHaveBeenCalledTimes(MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS.length);
    expect(readFile).toHaveBeenCalledTimes(MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS.length);
  });

  it("refuses an unstaged checker divergence", async () => {
    const divergent = MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS[3];
    const readBlob = vi.fn(async () => Buffer.from("indexed\n"));
    const readFile = vi.fn(async (path: string) =>
      Buffer.from(path.endsWith(divergent ?? "") ? "worktree\n" : "indexed\n"));

    await expect(assertIndexedMarkdownCheckerAlignment({ root: "/repo", readBlob, readFile })).rejects.toThrow(
      `Indexed Markdown checker differs from executing worktree bytes: ${divergent}`,
    );
  });
});
