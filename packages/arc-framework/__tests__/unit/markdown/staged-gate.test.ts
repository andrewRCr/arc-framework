import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

import {
  assertIndexedMarkdownCheckerAlignment,
  resolveIndexedMarkdownCheckerPaths,
} from "../../../src/lib/markdown/checker-alignment.js";
import {
  isMarkdownGateTriggerPath,
  MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS,
} from "../../../src/lib/markdown/staged-gate.js";

describe("staged Markdown gate", () => {
  it.each([
    "README.md",
    "docs/temp-guide.md",
    ".markdownlint.yml",
    "packages/arc-framework/src/lib/markdown/selection.ts",
    "packages/arc-framework/src/lib/markdown/descriptor-spacing.ts",
    "packages/arc-framework/src/lib/task-list/segmentation.ts",
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
});

describe("staged Markdown checker alignment", () => {
  it.each(["mismatch", "missing", "read-failure"])("refuses fresh bulk alignment failures (%s)", async failure => {
    const path = "packages/arc-framework/src/checker.ts";
    const original = Buffer.from("export const value = 1;\n");
    const readFailure = new Error("Current index read failed");
    const options = {
      root: "/repo", runtimePaths: [path],
      readBlob: async () => original,
      readFile: async () => original,
      readBlobs: async (): Promise<ReadonlyMap<string, Uint8Array>> => {
        if (failure === "read-failure") throw readFailure;
        return failure === "missing" ? new Map() : new Map([[path, Buffer.from("export const value = 2;\n")]]);
      },
    };
    const result = assertIndexedMarkdownCheckerAlignment(options);
    if (failure === "read-failure") await expect(result).rejects.toBe(readFailure);
    else await expect(result).rejects.toThrow(failure === "missing" ? "Indexed Markdown checker is missing"
      : "Indexed Markdown checker differs from executing worktree bytes");
  });

  it("discovers the complete ordered dependency closure through a bulk-only reader", async () => {
    const entry = "packages/arc-framework/src/scripts/checker.ts";
    const first = "packages/arc-framework/src/scripts/first.ts";
    const second = "packages/arc-framework/src/scripts/second.ts";
    const shared = "packages/arc-framework/src/scripts/shared.ts";
    const sources = new Map([
      [entry, Buffer.from('import "./first.js";\nimport("./second.js");\n')],
      [first, Buffer.from('export * from "./shared.js";\n')],
      [second, Buffer.from('import "./shared.js";\n')],
      [shared, Buffer.from("export const value = 1;\n")],
    ]);
    const options = {
      root: "/repo", entryPaths: [entry],
      readBlob: async (): Promise<Uint8Array | null> => { throw new Error("This backend requires bulk reads"); },
      readBlobs: async (_root: string, paths: readonly string[]): Promise<ReadonlyMap<string, Uint8Array>> =>
        new Map(paths.flatMap(path => sources.has(path) ? [[path, sources.get(path)!]] : [])),
    };
    await expect(resolveIndexedMarkdownCheckerPaths(options)).resolves.toEqual([entry, first, second, shared]);
  });

  it.each(["missing", "invalid-utf8", "unsupported-import", "read-failure"])("refuses invalid bulk checker inputs (%s)", async failure => {
    const entry = "packages/arc-framework/src/scripts/checker.ts";
    const readFailure = new Error("Bulk object read failed");
    const bytes = failure === "invalid-utf8" ? Buffer.from([0xff]) : Buffer.from('import "../../../../outside.js";\n');
    const options = {
      root: "/repo", entryPaths: [entry],
      readBlob: async (): Promise<Uint8Array | null> => { throw new Error("This backend requires bulk reads"); },
      readBlobs: async (): Promise<ReadonlyMap<string, Uint8Array>> => {
        if (failure === "read-failure") throw readFailure;
        return failure === "missing" ? new Map() : new Map([[entry, bytes]]);
      },
    };
    const result = resolveIndexedMarkdownCheckerPaths(options);
    if (failure === "read-failure") await expect(result).rejects.toBe(readFailure);
    else await expect(result).rejects.toThrow(failure === "missing" ? "Indexed Markdown checker is missing"
      : failure === "invalid-utf8" ? "Indexed Markdown checker is not valid UTF-8"
        : "Indexed Markdown checker has an unsupported relative import");
  });

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
  });
});
