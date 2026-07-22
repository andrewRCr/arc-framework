import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeGitExec } from "../helpers/integration.js";
import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";
import { runWorktreeMarkdownlint } from "../../src/lib/markdown/worktree-lint.js";
import { runMarkdownLintComposition } from "../../src/scripts/lint-markdown.js";

const execFileAsync = promisify(execFile);

let root: string;

async function write(path: string, content: string): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function rootConfig(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ config: { default: true }, ...MARKDOWN_SELECTION, ...overrides });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-markdown-worktree-lint-"));
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await write(".markdownlint-cli2.jsonc", rootConfig());
  await write("docs/.markdownlint-cli2.jsonc", "{ // nested\n \"config\": { \"MD046\": false }\n}\n");
  await write("README.md", "# Fixture\n");
  await write("docs/guide.md", "# Guide\n");
  await execFileAsync("git", ["add", "--all"], { cwd: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("worktree Markdown lint", () => {
  it("validates configs and passes shared-selector paths explicitly", async () => {
    const executeLinter = vi.fn(async () => 0);
    const result = await runWorktreeMarkdownlint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
      executeLinter,
    });

    expect(result).toEqual({ exitCode: 0, paths: ["README.md", "docs/guide.md"] });
    expect(executeLinter).toHaveBeenCalledWith(root, [
      "--no-globs",
      "--",
      "README.md",
      "docs/guide.md",
    ]);
  });

  it("fails before linting when root or nested selection options drift", async () => {
    const executeLinter = vi.fn(async () => 0);
    await write(".markdownlint-cli2.jsonc", rootConfig({ globs: ["docs/**/*.md"] }));
    await expect(runWorktreeMarkdownlint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
      executeLinter,
    })).rejects.toThrow("Root globs do not match the authoritative selector in order");
    expect(executeLinter).not.toHaveBeenCalled();

    await write(".markdownlint-cli2.jsonc", rootConfig());
    await write("docs/.markdownlint-cli2.jsonc", JSON.stringify({ ignores: ["generated/**"] }));
    await expect(runWorktreeMarkdownlint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
      executeLinter,
    })).rejects.toThrow("Nested configuration must not define ignores");
    expect(executeLinter).not.toHaveBeenCalled();
  });
});

describe("Markdown lint composition", () => {
  it("runs markdownlint before descriptors and short-circuits failures", async () => {
    const calls: string[] = [];
    const success = await runMarkdownLintComposition(async (stage) => {
      calls.push(stage);
      return 0;
    });
    expect(success).toBe(0);
    expect(calls).toEqual(["lint:md:markdownlint", "lint:md:descriptors"]);

    calls.length = 0;
    const failure = await runMarkdownLintComposition(async (stage) => {
      calls.push(stage);
      return 1;
    });
    expect(failure).toBe(1);
    expect(calls).toEqual(["lint:md:markdownlint"]);
  });
});
