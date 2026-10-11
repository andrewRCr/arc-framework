import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeGitExec } from "../helpers/integration.js";
import { gitExec } from "../../src/lib/io-context.js";
import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";
import { runWorktreeMarkdownlint } from "../../src/lib/markdown/worktree-lint.js";
import {
  enforceStagedMarkdownWorktreeAlignment,
  runMarkdownLintComposition,
} from "../../src/scripts/lint-markdown.js";

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
  vi.unstubAllEnvs();
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

  it("includes untracked non-ignored Markdown in the worktree selection", async () => {
    await write("docs/new-page.md", "# New page\n");
    const executeLinter = vi.fn<(root: string, args: readonly string[]) => Promise<number>>()
      .mockResolvedValue(1);
    const result = await runWorktreeMarkdownlint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
      executeLinter,
    });

    expect(result.exitCode).toBe(1);
    expect([...result.paths].sort()).toEqual(["README.md", "docs/guide.md", "docs/new-page.md"].sort());
    expect(executeLinter).toHaveBeenCalledTimes(1);
    const linterArgs = executeLinter.mock.calls[0]?.[1] ?? [];
    expect(linterArgs[0]).toBe("--no-globs");
    expect(linterArgs[1]).toBe("--");
    expect([...linterArgs.slice(2)].sort()).toEqual(["README.md", "docs/guide.md", "docs/new-page.md"].sort());
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

describe("staged Markdown worktree alignment", () => {
  it.each([true, false])("compares the worktree with the inherited index (drift=%s)", async drift => {
    await gitExec("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "fixture"], { cwd: root });
    const indexFile = join(root, ".git", "checked-index");
    const options = { cwd: root, indexFile };
    await gitExec("git", ["read-tree", "HEAD"], options);
    const worktree = "# Guide\n\nWorktree content.\n";
    const other = "# Guide\n\nDifferent indexed content.\n";
    await write("docs/guide.md", drift ? worktree : other);
    await gitExec("git", ["add", "docs/guide.md"], { cwd: root });
    await write("docs/guide.md", drift ? other : worktree);
    await gitExec("git", ["add", "docs/guide.md"], options);
    await write("docs/guide.md", worktree);
    vi.stubEnv("GIT_INDEX_FILE", indexFile);
    const messages: string[] = [];

    const result = await enforceStagedMarkdownWorktreeAlignment(root, message => { messages.push(message); });
    expect(result).toBe(drift ? 1 : 0);
    if (drift) expect(messages.join("\n")).toContain("docs/guide.md");
    else expect(messages).toEqual([]);
  });

  it("fails closed when a staged Markdown path still differs in the worktree", async () => {
    await execFileAsync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "init"], {
      cwd: root,
    });
    await write("docs/guide.md", "# Guide\n\nStaged body.\n");
    await execFileAsync("git", ["add", "docs/guide.md"], { cwd: root });
    await write("docs/guide.md", "# Guide\n\nWorktree-only fix.\n");

    const lines: string[] = [];
    const previous = process.cwd();
    process.chdir(root);
    try {
      const exitCode = await enforceStagedMarkdownWorktreeAlignment(root, (message) => {
        lines.push(message);
      });
      expect(exitCode).toBe(1);
    } finally {
      process.chdir(previous);
    }
    expect(lines.join("\n")).toContain("docs/guide.md");
    expect(lines.join("\n")).toContain("lint:md:staged");
  });

  it("passes when staged Markdown paths match the worktree", async () => {
    await execFileAsync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "init"], {
      cwd: root,
    });
    await write("docs/guide.md", "# Guide\n\nAligned.\n");
    await execFileAsync("git", ["add", "docs/guide.md"], { cwd: root });

    const previous = process.cwd();
    process.chdir(root);
    try {
      await expect(enforceStagedMarkdownWorktreeAlignment(root)).resolves.toBe(0);
    } finally {
      process.chdir(previous);
    }
  });
});
