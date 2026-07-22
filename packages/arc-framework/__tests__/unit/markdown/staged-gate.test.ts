import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

import {
  assertIndexedMarkdownCheckerAlignment,
  resolveIndexedMarkdownCheckerPaths,
} from "../../../src/lib/markdown/checker-alignment.js";
import {
  isMarkdownGateTriggerPath,
  MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS,
  runStagedMarkdownGate,
} from "../../../src/lib/markdown/staged-gate.js";

describe("staged Markdown gate", () => {
  it.each([
    "README.md",
    "docs/temp-guide.md",
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
    ".arc/active/temp-draft.md",
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
  it("discovers transitive runtime dependencies from indexed sources", async () => {
    const sources = new Map<string, string>([
      [
        "packages/arc-framework/src/scripts/lint-markdown-staged.ts",
        'import { validateManagedPath } from "../lib/kernel/index.js";\n',
      ],
      [
        "packages/arc-framework/src/scripts/verify-markdown-dependencies.ts",
        "export const version = 1;\n",
      ],
      [
        "packages/arc-framework/src/lib/kernel/index.ts",
        'export { validateManagedPath } from "./canonical/managed-path.js";\n',
      ],
      [
        "packages/arc-framework/src/lib/kernel/canonical/managed-path.ts",
        'import { isWellFormedUnicode } from "./unicode.js";\n',
      ],
      [
        "packages/arc-framework/src/lib/kernel/canonical/unicode.ts",
        "export const isWellFormedUnicode = (): boolean => true;\n",
      ],
    ]);
    const readBlob = vi.fn(async (_root: string, path: string) => {
      const source = sources.get(path);
      return source === undefined ? null : Buffer.from(source);
    });

    await expect(resolveIndexedMarkdownCheckerPaths({
      root: "/repo",
      readBlob,
      entryPaths: [
        "packages/arc-framework/src/scripts/lint-markdown-staged.ts",
        "packages/arc-framework/src/scripts/verify-markdown-dependencies.ts",
      ],
    })).resolves.toEqual([
      "packages/arc-framework/src/scripts/lint-markdown-staged.ts",
      "packages/arc-framework/src/scripts/verify-markdown-dependencies.ts",
      "packages/arc-framework/src/lib/kernel/index.ts",
      "packages/arc-framework/src/lib/kernel/canonical/managed-path.ts",
      "packages/arc-framework/src/lib/kernel/canonical/unicode.ts",
    ]);
  });

  it("accepts identical indexed and executing implementation bytes", async () => {
    const bytes = Buffer.from("implementation\n");
    const readBlob = vi.fn(async () => bytes);
    const readFile = vi.fn(async () => bytes);

    await expect(assertIndexedMarkdownCheckerAlignment({ root: "/repo", readBlob, readFile })).resolves.toBeUndefined();
    expect(readBlob).toHaveBeenCalledTimes(MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS.length * 2);
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

  it("refuses an unstaged transitive runtime dependency divergence", async () => {
    const transitive = "packages/arc-framework/src/lib/kernel/canonical/managed-path.ts";
    const runtimePaths = [...MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS, transitive];
    const readBlob = vi.fn(async () => Buffer.from("indexed\n"));
    const readFile = vi.fn(async (path: string) =>
      Buffer.from(path.endsWith(transitive) ? "worktree\n" : "indexed\n"));

    await expect(assertIndexedMarkdownCheckerAlignment({
      root: "/repo",
      readBlob,
      readFile,
      runtimePaths,
    })).rejects.toThrow(
      `Indexed Markdown checker differs from executing worktree bytes: ${transitive}`,
    );
    const certify = vi.fn(async () => undefined);
    await expect(runStagedMarkdownGate({
      root: "/repo",
      exec: vi.fn(async () => ({ stdout: `${transitive}\0`, stderr: "" })),
      certify,
      runtimePaths: new Set(runtimePaths),
    })).resolves.toMatchObject({ triggered: true });
    expect(certify).toHaveBeenCalledOnce();
  });
});
