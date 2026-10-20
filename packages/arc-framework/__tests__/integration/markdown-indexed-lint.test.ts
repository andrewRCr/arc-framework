import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { lint } from "markdownlint/promise";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeGitExec } from "../helpers/integration.js";
import { gitExec, readGitBlobBytes } from "../../src/lib/io-context.js";
import {
  runIndexedMarkdownCertification,
  type RunIndexedMarkdownCertificationOptions,
} from "../../src/lib/markdown/indexed-lint.js";
import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";

const execFileAsync = promisify(execFile);
const runtimeVersions = {
  markdownlint: "0.41.1", stringWidth: "8.2.1",
  cli2: { markdownlint: "0.41.1", stringWidth: "8.2.1" },
};

let root: string;

async function write(path: string, content: string | Uint8Array): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function rootConfig(config: Record<string, unknown>): string {
  return JSON.stringify({ config, ...MARKDOWN_SELECTION, customRules: [] });
}

function lockfile(markdownlint = "0.41.1"): string {
  return JSON.stringify({
    packages: {
      "": { devDependencies: { markdownlint } },
      "packages/arc-framework": { dependencies: { "string-width": "8.2.1" } },
      "node_modules/markdownlint": { version: markdownlint, dependencies: { "string-width": "8.2.1" } },
      "node_modules/markdownlint-cli2": { dependencies: { markdownlint: "0.41.1" } },
      "node_modules/string-width": { version: "8.2.1" },
    },
  });
}

async function stageFixture(config: Record<string, unknown> = { default: false, MD009: true }): Promise<void> {
  await write(".markdownlint-cli2.jsonc", rootConfig(config));
  await write("package.json", JSON.stringify({ devDependencies: { markdownlint: "0.41.1" } }));
  await write("packages/arc-framework/package.json", JSON.stringify({ dependencies: { "string-width": "8.2.1" } }));
  await write("package-lock.json", lockfile());
  await write("README.md", "# Valid\n");
  await execFileAsync("git", ["add", "--all"], { cwd: root });
}

function options(overrides: Partial<RunIndexedMarkdownCertificationOptions> = {}): RunIndexedMarkdownCertificationOptions {
  return {
    root,
    exec: makeGitExec(root),
    readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
    runtimeVersions,
    lint,
    ...overrides,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-markdown-index-lint-"));
  await execFileAsync("git", ["init", "-q"], { cwd: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("indexed Markdown certification", () => {
  it.each([true, false])("certifies an alternate index independently of the repository index (invalid=%s)", async invalid => {
    await stageFixture();
    await gitExec("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "fixture"], { cwd: root });
    const indexFile = join(root, ".git", "checked-index");
    const indexOptions = { cwd: root, indexFile };
    await gitExec("git", ["read-tree", "HEAD"], indexOptions);
    await write("README.md", invalid ? "# Repository index valid\n" : "repository trailing \n");
    await gitExec("git", ["add", "README.md"], { cwd: root });
    await write("README.md", invalid ? "trailing \n" : "# Checked index valid\n");
    await gitExec("git", ["add", "README.md"], indexOptions);
    const result = await runIndexedMarkdownCertification(options({
      exec: (command, args, execOptions) => gitExec(command, args, { ...execOptions, ...indexOptions }),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path, { indexFile }),
    }));
    expect(result.paths).toEqual(["README.md"]);
    expect(result.diagnostics.map(({ message }) => message)).toEqual(invalid
      ? ["README.md:1:9 MD009/no-trailing-spaces Trailing spaces"] : []);
  });

  it("rejects a committed Markdown violation with a clean index and succeeds after its indexed repair", async () => {
    await stageFixture();
    await write("README.md", "trailing \n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });
    await execFileAsync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "fixture"], { cwd: root });
    expect((await execFileAsync("git", ["diff", "--cached", "--name-only"], { cwd: root })).stdout).toBe("");
    const invalid = await runIndexedMarkdownCertification(options());
    expect(invalid.diagnostics.map(({ message }) => message)).toEqual([
      "README.md:1:9 MD009/no-trailing-spaces Trailing spaces",
    ]);
    await write("README.md", "# Repaired\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });
    await expect(runIndexedMarkdownCertification(options())).resolves.toMatchObject({ diagnostics: [] });
  });

  it("reports an invalid staged blob even when an unstaged worktree fix is valid", async () => {
    await stageFixture();
    await write("README.md", "trailing \n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });
    await write("README.md", "# Worktree fixed\n");

    const result = await runIndexedMarkdownCertification(options());
    expect(result.diagnostics.map(({ message }) => message)).toEqual([
      "README.md:1:9 MD009/no-trailing-spaces Trailing spaces",
    ]);
  });

  it("ignores an unstaged worktree violation when the indexed blob is valid", async () => {
    await stageFixture();
    await write("README.md", "trailing \n");

    await expect(runIndexedMarkdownCertification(options())).resolves.toMatchObject({ diagnostics: [] });
  });

  it("applies staged nested rules to the indexed candidate", async () => {
    await stageFixture();
    await write("docs/.markdownlint-cli2.jsonc", JSON.stringify({ config: { MD009: false } }));
    await write("docs/guide.md", "trailing \n");
    await execFileAsync("git", ["add", "--all"], { cwd: root });
    await write("docs/.markdownlint-cli2.jsonc", JSON.stringify({ config: { MD009: true } }));

    await expect(runIndexedMarkdownCertification(options())).resolves.toMatchObject({ diagnostics: [] });
  });

  it("runs descriptor validation over the same indexed content map", async () => {
    await stageFixture();
    await write(
      ".arc/active/tasks-demo.md",
      [
        "### `[ ]` **1.1 Demo**",
        "",
        "- _Goal:_ Wrapped descriptor",
        "  continuation.",
        "- _Note:_ Missing separator.",
        "",
      ].join("\n"),
    );
    await execFileAsync("git", ["add", ".arc/active/tasks-demo.md"], { cwd: root });

    const result = await runIndexedMarkdownCertification(options());
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        path: ".arc/active/tasks-demo.md",
        line: 5,
        message: expect.stringContaining("requires a blank line"),
      }),
    ]);
  });

  it("rejects a staged task list whose completed parent hides an open subtask", async () => {
    await stageFixture();
    const path = ".arc/active/tasks-hidden.md";
    await write(path, [
      "### `[x]` **1.1 Completed parent**",
      "",
      "    - `[ ]` **1.1.a Hidden open child**",
    ].join("\n"));
    await execFileAsync("git", ["add", path], { cwd: root });

    const result = await runIndexedMarkdownCertification(options());
    expect(result.diagnostics).toEqual([{
      path,
      line: 3,
      message: `${path}:3: Task-list structure is malformed: open subtask 1.1.a at line 3 appears beneath completed parent 1.1 at line 1`,
    }]);
  });

  it("runs segmentation validation over the same indexed content map", async () => {
    await stageFixture();
    await write(
      ".arc/active/tasks-segmented.md",
      [
        "## **Phase 1:** Build",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "### `[ ]` **1.1 Build the structure**",
        "",
        "- _Goal:_ Build the structure.",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    );
    await execFileAsync("git", ["add", ".arc/active/tasks-segmented.md"], { cwd: root });

    const result = await runIndexedMarkdownCertification(options());
    expect(result.diagnostics).toEqual([{
      path: ".arc/active/tasks-segmented.md",
      line: 1,
      message: ".arc/active/tasks-segmented.md:1: Segment closing at Phase 1 has no _Exit criterion:_",
    }]);
  });

  it("keeps the segmentation verdict bound to index bytes", async () => {
    await stageFixture();
    const path = ".arc/active/tasks-segmented.md";
    await write(path, [
      "## **Phase 1:** Build",
      "",
      "_Mode:_ `layer` — closes on settled structure.",
      "",
      "### `[ ]` **1.1 Build the structure**",
      "",
      "- _Goal:_ Build the structure.",
      "",
      "## **Phase 2:** Verification",
      "",
      "### `[ ]` **2.1 Verify the work unit**",
    ].join("\n"));
    await execFileAsync("git", ["add", path], { cwd: root });
    await write(path, [
      "## **Phase 1:** Build",
      "",
      "_Mode:_ `layer` — closes on settled structure.",
      "",
      "_Exit criterion:_ The structure is settled.",
      "",
      "### `[ ]` **1.1 Build the structure**",
      "",
      "- _Goal:_ Build the structure.",
      "",
      "## **Phase 2:** Verification",
      "",
      "### `[ ]` **2.1 Verify the work unit**",
    ].join("\n"));

    const result = await runIndexedMarkdownCertification(options());
    expect(result.diagnostics).toEqual([{
      path,
      line: 1,
      message: `${path}:1: Segment closing at Phase 1 has no _Exit criterion:_`,
    }]);
  });

  it("fails candidate/runtime dependency drift before invoking markdownlint", async () => {
    await stageFixture();
    await write("package-lock.json", lockfile("0.39.0"));
    await execFileAsync("git", ["add", "package-lock.json"], { cwd: root });
    const lintGroup = vi.fn(lint);

    await expect(runIndexedMarkdownCertification(options({ lint: lintGroup }))).rejects.toThrow(
      "locked root markdownlint resolves 0.39.0, expected 0.41.1",
    );
    expect(lintGroup).not.toHaveBeenCalled();
  });

  it("refuses nested CLI2 drift in the index and certifies the repaired dependency graph", async () => {
    await stageFixture();
    const candidate = JSON.parse(lockfile()) as { packages: Record<string, unknown> };
    candidate.packages["node_modules/markdownlint-cli2/node_modules/markdownlint"] = {
      version: "0.40.0", dependencies: { "string-width": "8.1.0" },
    };
    await write("package-lock.json", JSON.stringify(candidate));
    await gitExec("git", ["add", "package-lock.json"], { cwd: root });
    await expect(runIndexedMarkdownCertification(options())).rejects.toThrow(
      "CLI2 markdownlint resolves 0.40.0, expected 0.41.1",
    );

    await write("package-lock.json", lockfile());
    await gitExec("git", ["add", "package-lock.json"], { cwd: root });
    await expect(runIndexedMarkdownCertification(options())).resolves.toMatchObject({ diagnostics: [] });
  });

  it("attaches the explicit table formatter remedy to MD060 failures", async () => {
    await stageFixture({ default: false, MD060: { style: "aligned" } });
    await write("README.md", "| A | BB |\n| - | - |\n| x | y |\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });

    const result = await runIndexedMarkdownCertification(options());
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics).toEqual(result.diagnostics.map(() => expect.objectContaining({
      path: "README.md",
      remedy: "npm run format:tables -- 'README.md'",
    })));
  });

  it("reads every dependency, Markdown, and configuration blob once for a valid snapshot", async () => {
    await stageFixture();
    const readBlob = vi.fn((cwd: string, path: string) => readGitBlobBytes(cwd, null, path));

    const result = await runIndexedMarkdownCertification(options({ readBlob }));
    expect(result.diagnostics).toEqual([]);
    expect(readBlob.mock.calls.map(([, path]) => path).sort()).toEqual([
      ".markdownlint-cli2.jsonc",
      "README.md",
      "package-lock.json",
      "package.json",
      "packages/arc-framework/package.json",
    ]);
  });
});
