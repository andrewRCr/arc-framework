/**
 * Harness smoke tests for `scripts/classify-change.sh`.
 *
 * Establishes the shell-script integration-test seam the path-classification and
 * code-tree-hash work lands on: the subprocess spawn contract ({@link
 * runScript}), the script's subcommand-dispatch scaffold, and the temp-git-repo
 * scaffolding ({@link createTempRepo}) the tree-hash cases build on. Assertions
 * here cover only the dispatch surface that stays stable as the subcommands are
 * implemented — the `classify` / `tree-hash` behaviors get their own suites.
 */

import { describe, it, expect, afterEach } from "vitest";
import { chmod, symlink } from "node:fs/promises";
import { load } from "js-yaml";
import { z } from "zod";

import { ARC_CONTRACT_SUITES } from "../../src/lib/local-vitest-runner.js";
import { CLASSIFY_SCRIPT, runScript } from "../helpers/run-script.js";
import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  execFileAsync,
  writeFile,
  readFile,
  mkdir,
  join,
  dirname,
} from "../helpers/integration.js";

/** Usage-error exit status (unknown or missing subcommand). */
const EX_USAGE = 64;

describe("classify-change.sh harness", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  it("prints usage and exits with a usage error when no command is given", async () => {
    const result = await runScript(CLASSIFY_SCRIPT, []);

    expect(result.exitCode).toBe(EX_USAGE);
    expect(result.stderr).toContain("Usage: classify-change.sh");
    expect(result.stderr).toContain("classify");
    expect(result.stderr).toContain("tree-hash");
  });

  it("rejects an unknown command with a usage error", async () => {
    const result = await runScript(CLASSIFY_SCRIPT, ["bogus"]);

    expect(result.exitCode).toBe(EX_USAGE);
    expect(result.stderr).toContain("Unknown command: bogus");
  });

  it("prints usage and exits cleanly for --help", async () => {
    const result = await runScript(CLASSIFY_SCRIPT, ["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Usage: classify-change.sh");
  });

  it.each(["classify", "tree-hash", "duplicate-push", "decide"])(
    "recognizes the %s subcommand (not a usage error)",
    async (command) => {
      const result = await runScript(CLASSIFY_SCRIPT, [command]);

      expect(result.exitCode).not.toBe(EX_USAGE);
      expect(result.stderr).not.toContain("Unknown command");
    },
  );

  it("spawns against a temp git repo cwd (tree-hash scaffolding)", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    await makeCommit(repo, "initial commit");

    const result = await runScript(CLASSIFY_SCRIPT, ["--help"], { cwd: repo });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Usage: classify-change.sh");
  });

  it("delegates canonical parsing and tree identity to the shared module", async () => {
    const source = await readFile(CLASSIFY_SCRIPT, "utf-8");

    expect(source).toContain("packages/arc-framework/src/lib/change-facts.ts");
    expect(source).toContain('node "${CHANGE_FACTS_MODULE}" classification');
    expect(source).toContain('node "${CHANGE_FACTS_MODULE}" tree-hash');
    expect(source).not.toContain("_classify_raw_diff_file");
    expect(source).not.toContain("CODE_SURFACE_GLOBS");
  });
});

describe("classify-change.sh planning-lane", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function fakeCli(
    exitCode: number,
    stdout: string,
    stderr: string,
    expectedArgs: readonly string[],
  ): Promise<string> {
    const directory = await createTempRepo();
    tempDirs.push(directory);
    const path = join(directory, "planning-cli.mjs");
    await writeFile(path, [
      `const expected = ${JSON.stringify(expectedArgs)};`,
      "const actual = process.argv.slice(2);",
      "if (JSON.stringify(actual) !== JSON.stringify(expected)) {",
      "  process.stderr.write(`unexpected arguments: ${JSON.stringify(actual)}\\n`);",
      "  process.exit(97);",
      "}",
      `process.stdout.write(${JSON.stringify(stdout)});`,
      `process.stderr.write(${JSON.stringify(stderr)});`,
      `process.exit(${exitCode});`,
      "",
    ].join("\n"));
    return path;
  }

  async function fakeNpx(expected: readonly string[]): Promise<string> {
    const directory = await createTempRepo();
    tempDirs.push(directory);
    const path = join(directory, "npx");
    await writeFile(path, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `expected=(${expected.map((value) => JSON.stringify(value)).join(" ")})`,
      'actual=("$@")',
      'test "$#" -eq "${#expected[@]}"',
      'for index in "${!expected[@]}"; do test "${actual[$index]}" = "${expected[$index]}"; done',
      "printf 'planning\\n'",
      "",
    ].join("\n"));
    await chmod(path, 0o755);
    return directory;
  }

  it("routes exact refs and the data repository through the built canonical command", async () => {
    const base = "a".repeat(40);
    const head = "b".repeat(40);
    const cli = await fakeCli(0, "planning\n", "", [
      "review", "planning-lane", base, head, "--repository", "/data/repository",
    ]);

    const result = await runScript(CLASSIFY_SCRIPT, ["planning-lane", base, head], {
      env: { ARC_PLANNING_CLI: cli, CLASSIFY_REPOSITORY_DIR: "/data/repository" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("planning");
  });

  it("propagates a canonical refusal without printing a reviewed fallback", async () => {
    const base = "a".repeat(40);
    const head = "b".repeat(40);
    const cli = await fakeCli(1, "", "receipt/path.json\n", [
      "review", "planning-lane", base, head, "--repository", "/data/repository",
    ]);
    const result = await runScript(CLASSIFY_SCRIPT, [
      "planning-lane",
      base,
      head,
    ], {
      env: { ARC_PLANNING_CLI: cli, CLASSIFY_REPOSITORY_DIR: "/data/repository" },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("receipt/path.json\n");
  });

  it("uses the repository npx arc command when the CLI override is unset", async () => {
    const base = "a".repeat(40);
    const head = "b".repeat(40);
    const repository = "/data/repository";
    const bin = await fakeNpx([
      "arc", "review", "planning-lane", base, head, "--repository", repository,
    ]);

    const result = await runScript(CLASSIFY_SCRIPT, ["planning-lane", base, head], {
      env: {
        ARC_PLANNING_CLI: "",
        CLASSIFY_REPOSITORY_DIR: repository,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result).toMatchObject({ exitCode: 0, stdout: "planning\n", stderr: "" });
  });
});

describe("classify-change.sh lane", () => {
  async function lane(files: string[]): Promise<string> {
    const input = files.length === 0 ? Buffer.alloc(0) : Buffer.from(`${files.join("\0")}\0`);
    const result = await runScript(CLASSIFY_SCRIPT, ["lane", "--stdin0"], { stdin: input });
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  }

  it("preserves the legacy auto lane for planning artifacts", async () => {
    expect(await lane([".arc/active/tasks-example.md", ".arc/backlog/planned/other/meta-other.md"])).toBe("auto");
  });

  it("admits exact transition records without admitting adjacent executable content", async () => {
    expect(await lane([
      ".arc/active/spec-origin.md",
      ".arc/system/.internal/transitions/origin.json",
    ])).toBe("auto");
    expect(await lane([
      ".arc/active/spec-origin.md",
      ".arc/system/.internal/transitions/origin.json",
      ".arc/system/.internal/scripts/check.sh",
    ])).toBe("reviewed");
  });

  it("fails safe for empty, mixed, and arbitrary pathnames", async () => {
    expect(await lane([])).toBe("reviewed");
    expect(await lane([".arc/active/tasks-example.md", "README.md"])).toBe("reviewed");
    expect(await lane([".arc/active/tasks-line\nbreak.md"])).toBe("reviewed");
  });
});

describe("classify-change.sh portability", () => {
  async function portability(files: string[]): Promise<string> {
    const input = files.length === 0 ? Buffer.alloc(0) : Buffer.from(`${files.join("\0")}\0`);
    const result = await runScript(CLASSIFY_SCRIPT, ["portability", "--stdin0"], { stdin: input });
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  }

  it("targets concurrency primitives and their focused tests", async () => {
    expect(await portability(["packages/arc-framework/src/lib/fs.ts"])).toBe("true");
    expect(await portability(["packages/arc-framework/src/lib/kernel/fs-retry.ts"])).toBe("true");
    expect(await portability(["packages/arc-framework/src/lib/local-test-admission.ts"])).toBe("true");
    expect(await portability(["packages/arc-framework/__tests__/unit/fs.test.ts"])).toBe("true");
    expect(await portability(["packages/arc-framework/src/lib/advisory-lock.ts"])).toBe("true");
    expect(await portability(["packages/arc-framework/__tests__/unit/advisory-lock.test.ts"])).toBe("true");
    expect(await portability(["packages/arc-framework/src/lib/git/ref-tree.ts"])).toBe("true");
    expect(await portability(["packages/arc-framework/__tests__/e2e/state-ref-race.e2e.test.ts"])).toBe("true");
  });

  it("does not target unrelated code changes", async () => {
    expect(await portability(["packages/arc-framework/src/lib/config.ts"])).toBe("false");
    expect(await portability(["README.md", "packages/arc-framework/src/commands/status.ts"])).toBe("false");
  });

  it("fails safe for an empty path set and targets its own scheduling surfaces", async () => {
    expect(await portability([])).toBe("true");
    expect(await portability(["package-lock.json"])).toBe("true");
    expect(await portability([".github/workflows/ci.yml"])).toBe("true");
    expect(await portability(["scripts/classify-change.sh"])).toBe("true");
  });
});

describe("classify-change.sh duplicate-push", () => {
  const tempDirs: string[] = [];
  const headSha = "1111111111111111111111111111111111111111";

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function duplicatePush(
    event: string,
    refName: string,
    head: string,
    fixtures?: string,
  ): Promise<string> {
    const env = fixtures === undefined ? {} : { CLASSIFY_OPEN_PULLS_DIR: fixtures };
    const result = await runScript(CLASSIFY_SCRIPT, ["duplicate-push", event, refName, head], { env });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^(true|false)$/);
    return result.stdout.trim();
  }

  async function fixtureDir(lines: string): Promise<string> {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const pullsDir = join(repo, ".pulls");
    await mkdir(pullsDir, { recursive: true });
    await writeFile(join(pullsDir, `${headSha}.tsv`), lines);
    return pullsDir;
  }

  it("is true for a push whose branch and head SHA match an open PR", async () => {
    const pullsDir = await fixtureDir(`chore/example\t${headSha}\n`);

    expect(await duplicatePush("push", "chore/example", headSha, pullsDir)).toBe("true");
  });

  it("is false for non-push events even when the head has an open PR", async () => {
    const pullsDir = await fixtureDir(`chore/example\t${headSha}\n`);

    expect(await duplicatePush("pull_request", "chore/example", headSha, pullsDir)).toBe("false");
  });

  it("is false when no open PR fixture exists for the head SHA", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const pullsDir = join(repo, ".pulls");
    await mkdir(pullsDir, { recursive: true });

    expect(await duplicatePush("push", "chore/example", headSha, pullsDir)).toBe("false");
  });

  it("is false when the open PR is for a different branch or stale head", async () => {
    const pullsDir = await fixtureDir(
      `chore/other\t${headSha}\nchore/example\t2222222222222222222222222222222222222222\n`,
    );

    expect(await duplicatePush("push", "chore/example", headSha, pullsDir)).toBe("false");
  });
});

describe("classify-change.sh classify", () => {
  async function classify(files: string[]): Promise<string> {
    const result = await runScript(CLASSIFY_SCRIPT, ["classify", ...files]);
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  }

  async function classifyNul(files: string[]): Promise<string> {
    const input = files.length === 0 ? Buffer.alloc(0) : Buffer.from(`${files.join("\0")}\0`);
    const result = await runScript(CLASSIFY_SCRIPT, ["classify", "--stdin0"], { stdin: input });
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  }

  it("is light when every changed file is genuine docs", async () => {
    expect(
      await classify(["README.md", ".arc/system/rules/DEV-RULES.ARC.md", "docs/guide.md"]),
    ).toBe("light");
    expect(await classify(["mkdocs.yml"])).toBe("light");
  });

  it.each([
    ["src source", ["packages/arc-framework/src/lib/classify.ts"]],
    ["the CI workflow", [".github/workflows/ci.yml"]],
    ["the check declaration", [".arc/system/arc-checks.yml"]],
    ["test source", ["packages/arc-framework/__tests__/unit/x.test.ts"]],
  ])("is heavy when the change touches %s", async (_label, files) => {
    expect(await classify(files)).toBe("heavy");
  });

  it.each([
    ["shipped arc fixtures", ["packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md"]],
    ["template fixtures", ["packages/arc-framework/templates/template-tasks.md"]],
    ["the init recipe", ["packages/arc-framework/init-recipe.json"]],
  ])("is heavy for fixture-as-code: %s", async (_label, files) => {
    expect(await classify(files)).toBe("heavy");
  });

  it.each([
    ["root package.json", ["package.json"]],
    ["a package tsconfig", ["packages/arc-framework/tsconfig.test.json"]],
    ["the vitest config", ["packages/arc-framework/vitest.config.ts"]],
    ["a repo-root shell script", ["scripts/classify-change.sh"]],
  ])("is heavy for build/test config: %s", async (_label, files) => {
    expect(await classify(files)).toBe("heavy");
  });

  it.each([
    ["an activated project extension", [".arc/system/extensions/pre-pr-open.md"]],
    ["any project extension surface", [".arc/system/extensions/pre-merge.md"]],
  ])("is heavy for behavior-bearing extension surfaces: %s", async (_label, files) => {
    expect(await classify(files)).toBe("heavy");
  });

  it("keeps non-extension .arc/system markdown light", async () => {
    expect(await classify([".arc/system/workflows/arc/process-task-loop.md"])).toBe("light");
  });

  it("is heavy (fail-safe) for a path in neither the code nor genuine-docs set", async () => {
    expect(await classify(["some/unknown/asset.bin"])).toBe("heavy");
    expect(await classify(["LICENSE"])).toBe("heavy");
  });

  it("is heavy (fail-safe) for empty input", async () => {
    expect(await classify([])).toBe("heavy");
  });

  it("is heavy when a docs-only set is joined by a single code file", async () => {
    expect(
      await classify(["README.md", "packages/arc-framework/src/cli.ts"]),
    ).toBe("heavy");
  });

  it("keeps every focused ARC contract suite on the heavy path when its wiring changes", async () => {
    const root = dirname(dirname(CLASSIFY_SCRIPT));
    const manifest = JSON.parse(
      await readFile(join(root, "packages/arc-framework/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const command = manifest.scripts["test:arc-contracts"];

    expect(command).toBe("node --import tsx src/scripts/run-local-test-tier.ts arc-contracts");
    for (const suite of ARC_CONTRACT_SUITES) {
      const path = `packages/arc-framework/__tests__/integration/${suite}.test.ts`;
      expect(await readFile(join(root, path), "utf8")).not.toBe("");
      expect(await classify([path])).toBe("heavy");
    }
    expect(await classify(["packages/arc-framework/package.json"])).toBe("heavy");
    expect(await classify(["package.json"])).toBe("heavy");
  });

  it("keeps NUL-delimited filenames with whitespace and newlines intact", async () => {
    expect(await classifyNul(["docs/a file.md", "docs/line\nbreak.md"])).toBe("light");
    expect(await classifyNul(["docs/a file.md", "packages/arc-framework/src/line\nbreak.ts"])).toBe("heavy");
  });

  it("is heavy for an empty NUL-delimited input", async () => {
    expect(await classifyNul([])).toBe("heavy");
  });
});

describe("classify-change.sh tree-hash", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  /** Write files (relative paths) into the repo, commit them, return the commit SHA. */
  async function writeAndCommit(
    repo: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string> {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(repo, rel);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    }
    const git = ["-c", "core.hooksPath=/dev/null"];
    await execFileAsync("git", [...git, "add", "-A"], { cwd: repo });
    await execFileAsync("git", [...git, "commit", "-m", message], { cwd: repo });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    return stdout.trim();
  }

  async function treeHash(repo: string, ref: string, env: NodeJS.ProcessEnv = {}): Promise<string> {
    const result = await runScript(CLASSIFY_SCRIPT, ["tree-hash", ref], { cwd: repo, env });
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  }

  it("is stable across a docs-only delta layered on the same code tree", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const codeCommit = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n", "README.md": "v1\n" },
      "code + docs",
    );
    const docsCommit = await writeAndCommit(repo, { "README.md": "v2\n" }, "docs only");

    const hash = await treeHash(repo, codeCommit);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect(await treeHash(repo, docsCommit)).toBe(hash);
  });

  it("changes when a code-surface file changes", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const before = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code",
    );
    const after = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 2;\n" },
      "code change",
    );

    expect(await treeHash(repo, after)).not.toBe(await treeHash(repo, before));
  });

  it("preserves identity across ordinary packaged ARC Markdown content changes", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const path = "packages/arc-framework/arc/system/rules/example.md";
    const before = await writeAndCommit(repo, { [path]: "before\n" }, "packaged prose");
    const after = await writeAndCommit(repo, { [path]: "after\n" }, "edit packaged prose");

    expect(await treeHash(repo, after)).toBe(await treeHash(repo, before));
  });

  it.each([
    ["extension", "packages/arc-framework/arc/system/extensions/example.md"],
    ["internal machinery", "packages/arc-framework/arc/system/.internal/example.md"],
    ["authored template", "packages/arc-framework/arc/reference/templates/example.md"],
    ["template source", "packages/arc-framework/arc/reference/example.template.md"],
    ["non-Markdown content", "packages/arc-framework/arc/reference/example.json"],
  ])("changes identity for packaged %s content", async (_label, path) => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const before = await writeAndCommit(repo, { [path]: "before\n" }, "sensitive content");
    const after = await writeAndCommit(repo, { [path]: "after\n" }, "edit sensitive content");

    expect(await treeHash(repo, after)).not.toBe(await treeHash(repo, before));
  });

  it("changes identity for packaged shape and mode changes", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const first = "packages/arc-framework/arc/system/rules/first.md";
    const second = "packages/arc-framework/arc/system/rules/second.md";
    const base = await writeAndCommit(repo, { [first]: "one\n" }, "one packaged path");
    const added = await writeAndCommit(repo, { [second]: "two\n" }, "add packaged path");
    await execFileAsync("git", ["update-index", "--chmod=+x", second], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "change mode"], {
      cwd: repo,
    });
    const { stdout: modeOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    await execFileAsync("git", ["mv", first, `${first}.renamed.md`], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "rename path"], {
      cwd: repo,
    });
    const { stdout: renamedOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    await execFileAsync("git", ["rm", "-f", second], { cwd: repo });
    await symlink("target.md", join(repo, second));
    await execFileAsync("git", ["add", second], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "change object type"], {
      cwd: repo,
    });
    const { stdout: typeOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });

    const hashes = await Promise.all([
      treeHash(repo, base),
      treeHash(repo, added),
      treeHash(repo, modeOutput.trim()),
      treeHash(repo, renamedOutput.trim()),
      treeHash(repo, typeOutput.trim()),
    ]);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("keeps tab- and newline-bearing code and packaged paths distinct", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const codePath = "packages/arc-framework/src/tab\tname.ts";
    const packagedPath = "packages/arc-framework/arc/system/rules/line\nbreak.md";
    const before = await writeAndCommit(
      repo,
      { [codePath]: "one\n", [packagedPath]: "before\n" },
      "unusual paths",
    );
    const proseOnly = await writeAndCommit(repo, { [packagedPath]: "after\n" }, "edit packaged prose");
    const codeChanged = await writeAndCommit(repo, { [codePath]: "two\n" }, "edit unusual code");

    expect(await treeHash(repo, proseOnly)).toBe(await treeHash(repo, before));
    expect(await treeHash(repo, codeChanged)).not.toBe(await treeHash(repo, proseOnly));
  });

  it("does not require GNU sort for NUL-safe tree ordering", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const ref = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code",
    );
    const shimDir = join(repo, ".shims");
    const sortShim = join(shimDir, "sort");
    await mkdir(shimDir, { recursive: true });
    await writeFile(sortShim, "#!/bin/sh\nexit 99\n");
    await chmod(sortShim, 0o755);

    const hash = await treeHash(repo, ref, {
      PATH: `${shimDir}:${process.env.PATH ?? ""}`,
    });

    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("fails closed for malformed enumeration and serialization failures", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const ref = await writeAndCommit(repo, { "README.md": "docs\n" }, "docs");
    const fixtures = join(repo, ".trees");
    await mkdir(fixtures, { recursive: true });
    await writeFile(join(fixtures, `${ref}.raw`), Buffer.from("malformed\0"));

    const malformed = await runScript(CLASSIFY_SCRIPT, ["tree-hash", ref], {
      cwd: repo,
      env: { CLASSIFY_TREE_LIST_DIR: fixtures },
    });
    expect(malformed.exitCode).not.toBe(0);
    expect(malformed.stdout).toBe("");

    const failed = await runScript(CLASSIFY_SCRIPT, ["tree-hash", ref], {
      cwd: repo,
      env: { CLASSIFY_TREE_SERIALIZE_FAIL: "true" },
    });
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stdout).toBe("");
  });

  it.each([
    ["a noncanonical mode", `777777 blob ${"1".repeat(40)}\tdocs/example.md\0`],
    ["an inconsistent mode/type pair", `100644 commit ${"1".repeat(40)}\tdocs/example.md\0`],
    [
      "mixed object ID widths",
      `100644 blob ${"1".repeat(40)}\tpackages/arc-framework/src/one.ts\0` +
        `100644 blob ${"2".repeat(64)}\tpackages/arc-framework/src/two.ts\0`,
    ],
  ])("fails closed when tree enumeration contains %s", async (_label, listing) => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const ref = await writeAndCommit(repo, { "README.md": "docs\n" }, "docs");
    const fixtures = join(repo, ".trees");
    await mkdir(fixtures, { recursive: true });
    await writeFile(join(fixtures, `${ref}.raw`), Buffer.from(listing));

    const result = await runScript(CLASSIFY_SCRIPT, ["tree-hash", ref], {
      cwd: repo,
      env: { CLASSIFY_TREE_LIST_DIR: fixtures },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("changes when a code-surface file mode changes", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const before = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code",
    );
    await execFileAsync("git", ["update-index", "--chmod=+x", "packages/arc-framework/src/a.ts"], {
      cwd: repo,
    });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "mode change"], {
      cwd: repo,
    });
    const { stdout: after } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });

    expect(await treeHash(repo, after.trim())).not.toBe(await treeHash(repo, before));
  });

  it("does not change when only a genuine-docs file changes", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const before = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n", ".arc/notes.md": "a\n" },
      "code + arc docs",
    );
    const after = await writeAndCommit(repo, { ".arc/notes.md": "b\n" }, "arc docs only");

    expect(await treeHash(repo, after)).toBe(await treeHash(repo, before));
  });

  it("changes when a project extension surface changes", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const before = await writeAndCommit(
      repo,
      {
        "packages/arc-framework/src/a.ts": "export const x = 1;\n",
        ".arc/system/extensions/pre-merge.md": "---\nactive: false\n---\n",
      },
      "code + inactive extension",
    );
    const after = await writeAndCommit(
      repo,
      { ".arc/system/extensions/pre-merge.md": "---\nactive: true\n---\n" },
      "extension activation only",
    );

    expect(await treeHash(repo, after)).not.toBe(await treeHash(repo, before));
  });

  it("changes when a code-surface file is removed", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const before = await writeAndCommit(
      repo,
      {
        "packages/arc-framework/src/a.ts": "export const a = 1;\n",
        "packages/arc-framework/src/b.ts": "export const b = 2;\n",
      },
      "two code files",
    );
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "rm", "packages/arc-framework/src/b.ts"], {
      cwd: repo,
    });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "remove b"], { cwd: repo });
    const { stdout: after } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });

    expect(await treeHash(repo, after.trim())).not.toBe(await treeHash(repo, before));
  });

  it("fails (fail-safe heavy) on a bad ref without emitting a hash", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    await makeCommit(repo, "initial");

    const result = await runScript(CLASSIFY_SCRIPT, ["tree-hash", "no-such-ref"], { cwd: repo });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("fails when no ref is given", async () => {
    const result = await runScript(CLASSIFY_SCRIPT, ["tree-hash"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});

describe("classify-change.sh decide (pure arms)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  /** Write files into the repo, commit them, and return the commit SHA. */
  async function writeAndCommit(
    repo: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string> {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(repo, rel);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    }
    const git = ["-c", "core.hooksPath=/dev/null"];
    await execFileAsync("git", [...git, "add", "-A"], { cwd: repo });
    await execFileAsync("git", [...git, "commit", "-m", message], { cwd: repo });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    return stdout.trim();
  }

  /** Run `decide` and parse the `weight=` / `reason=` output lines. */
  async function decide(
    repo: string,
    event: string,
    base: string,
    head: string,
    env: NodeJS.ProcessEnv = {},
  ): Promise<{ weight: string | undefined; reason: string | undefined }> {
    const result = await runScript(
      CLASSIFY_SCRIPT,
      ["decide", event, base, head],
      { cwd: repo, env },
    );
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    const weightLine = lines[0];
    const reasonLine = lines[1];
    if (weightLine === undefined || reasonLine === undefined) {
      throw new Error("decide output lines missing after length assertion");
    }
    expect(weightLine).toMatch(/^weight=(light|heavy)$/);
    expect(reasonLine).toMatch(/^reason=(docs-only|verified|unverified)$/);
    const weight = weightLine.slice("weight=".length);
    const reason = reasonLine.slice("reason=".length);
    return { weight, reason };
  }

  it("is light/docs-only when the whole change touches no code surface", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n", "README.md": "v1\n" },
      "code + docs",
    );
    const head = await writeAndCommit(
      repo,
      { "README.md": "v2\n", ".arc/notes.md": "n\n" },
      "docs only",
    );

    // The docs-only arm is decided purely from the changed set.
    expect(await decide(repo, "pull_request", base, head)).toEqual({
      weight: "light",
      reason: "docs-only",
    });
  });

  it("is heavy/unverified when the change touches the code surface", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "v1\n" }, "docs");
    const head = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code change",
    );

    expect(await decide(repo, "pull_request", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("is light/docs-only for an ordinary packaged ARC Markdown modification", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const path = "packages/arc-framework/arc/system/rules/example.md";
    const base = await writeAndCommit(repo, { [path]: "before\n" }, "packaged prose");
    const head = await writeAndCommit(repo, { [path]: "after\n" }, "edit packaged prose");

    expect(await decide(repo, "pull_request", base, head)).toEqual({
      weight: "light",
      reason: "docs-only",
    });
  });

  it.each([
    ["extension", "packages/arc-framework/arc/system/extensions/example.md"],
    ["internal machinery", "packages/arc-framework/arc/system/.internal/example.md"],
    ["authored template", "packages/arc-framework/arc/reference/templates/example.md"],
    ["template source", "packages/arc-framework/arc/reference/example.template.md"],
    ["non-Markdown content", "packages/arc-framework/arc/reference/example.json"],
  ])("keeps packaged %s modifications heavy", async (_label, path) => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { [path]: "before\n" }, "packaged content");
    const head = await writeAndCommit(repo, { [path]: "after\n" }, "edit packaged content");

    expect(await decide(repo, "pull_request", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("keeps packaged membership changes and cross-boundary endpoints heavy", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const packaged = "packages/arc-framework/arc/system/rules/example.md";
    const base = await writeAndCommit(repo, { "docs/example.md": "content\n" }, "docs source");
    await mkdir(dirname(join(repo, packaged)), { recursive: true });
    await execFileAsync("git", ["mv", "docs/example.md", packaged], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "move into package"], {
      cwd: repo,
    });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });

    expect(await decide(repo, "pull_request", base, stdout.trim())).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("keeps rename-out and copy-source packaged endpoints heavy", async () => {
    const renameRepo = await createTempRepo();
    tempDirs.push(renameRepo);
    const packaged = "packages/arc-framework/arc/system/rules/source.md";
    const renameBase = await writeAndCommit(renameRepo, { [packaged]: "shared\n" }, "packaged source");
    await mkdir(join(renameRepo, "docs"), { recursive: true });
    await execFileAsync("git", ["mv", packaged, "docs/moved.md"], { cwd: renameRepo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "move out of package"], {
      cwd: renameRepo,
    });
    const { stdout: renameOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: renameRepo });
    expect(await decide(renameRepo, "pull_request", renameBase, renameOutput.trim())).toEqual({
      weight: "heavy",
      reason: "unverified",
    });

    const copyRepo = await createTempRepo();
    tempDirs.push(copyRepo);
    const copyBase = await writeAndCommit(copyRepo, { [packaged]: "shared\n" }, "packaged source");
    const copyHead = await writeAndCommit(copyRepo, { "docs/copied.md": "shared\n" }, "copy out of package");
    expect(await decide(copyRepo, "pull_request", copyBase, copyHead)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("reduces mixed ordinary packaged prose and code facts to heavy", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const prose = "packages/arc-framework/arc/system/rules/example.md";
    const code = "packages/arc-framework/src/example.ts";
    const base = await writeAndCommit(repo, { [prose]: "before\n", [code]: "export const x = 1;\n" }, "base");
    const head = await writeAndCommit(repo, { [prose]: "after\n", [code]: "export const x = 2;\n" }, "mixed");

    expect(await decide(repo, "pull_request", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("keeps real packaged adds and deletes heavy", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const path = "packages/arc-framework/arc/system/rules/example.md";
    const base = await writeAndCommit(repo, { "README.md": "base\n" }, "base");
    const added = await writeAndCommit(repo, { [path]: "content\n" }, "add packaged path");
    expect(await decide(repo, "pull_request", base, added)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });

    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "rm", path], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "delete packaged path"], {
      cwd: repo,
    });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    expect(await decide(repo, "pull_request", added, stdout.trim())).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("keeps real packaged copies and within-tree renames heavy", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const source = "packages/arc-framework/arc/system/rules/source.md";
    const copy = "packages/arc-framework/arc/system/rules/copy.md";
    const base = await writeAndCommit(repo, { [source]: "shared\n" }, "packaged source");
    const copied = await writeAndCommit(repo, { [copy]: "shared\n" }, "copy packaged path");
    expect(await decide(repo, "pull_request", base, copied)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });

    await execFileAsync("git", ["mv", source, `${source}.renamed.md`], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "rename packaged path"], {
      cwd: repo,
    });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    expect(await decide(repo, "pull_request", copied, stdout.trim())).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("keeps real packaged mode and object-type changes heavy", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const path = "packages/arc-framework/arc/system/rules/example.md";
    const base = await writeAndCommit(repo, { [path]: "content\n" }, "packaged prose");
    await execFileAsync("git", ["update-index", "--chmod=+x", path], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "change packaged mode"], {
      cwd: repo,
    });
    const { stdout: modeOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    const mode = modeOutput.trim();
    expect(await decide(repo, "pull_request", base, mode)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });

    await execFileAsync("git", ["rm", "-f", path], { cwd: repo });
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await symlink("target.md", join(repo, path));
    await execFileAsync("git", ["add", path], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "change packaged type"], {
      cwd: repo,
    });
    const { stdout: typeOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    expect(await decide(repo, "pull_request", mode, typeOutput.trim())).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("preserves unusual packaged Markdown filenames through raw parsing", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const path = "packages/arc-framework/arc/system/rules/tab\tline\nbreak.md";
    const base = await writeAndCommit(repo, { [path]: "before\n" }, "unusual packaged path");
    const head = await writeAndCommit(repo, { [path]: "after\n" }, "edit unusual packaged path");

    expect(await decide(repo, "pull_request", base, head)).toEqual({
      weight: "light",
      reason: "docs-only",
    });
  });

  it("keeps stable executable packaged Markdown heavy", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const path = "packages/arc-framework/arc/system/rules/example.md";
    await writeAndCommit(repo, { [path]: "before\n" }, "packaged prose");
    await execFileAsync("git", ["update-index", "--chmod=+x", path], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "make executable"], {
      cwd: repo,
    });
    const { stdout: baseOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    const head = await writeAndCommit(repo, { [path]: "after\n" }, "edit executable prose");

    expect(await decide(repo, "pull_request", baseOutput.trim(), head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  const exactRename = `R${100}`;
  const exactCopy = `C${100}`;

  it.each([
    ["A", "000000", "100644", "zero", "one"],
    ["D", "100644", "000000", "one", "zero"],
    [exactRename, "100644", "100644", "one", "two"],
    [exactCopy, "100644", "100644", "one", "two"],
    ["T", "100644", "120000", "one", "two"],
    ["U", "100644", "100644", "one", "two"],
  ])(
    "fails closed for injected packaged raw status %s",
    async (status, oldMode, newMode, oldOidKind, newOidKind) => {
      const repo = await createTempRepo();
      tempDirs.push(repo);
      const base = await writeAndCommit(repo, { "README.md": "one\n" }, "base");
      const head = await writeAndCommit(repo, { "README.md": "two\n" }, "head");
      const fixture = join(repo, `raw-${status}.bin`);
      const objectIds = {
        zero: "0".repeat(40),
        one: "1".repeat(40),
        two: "2".repeat(40),
      };
      const oldOid = objectIds[oldOidKind as keyof typeof objectIds];
      const newOid = objectIds[newOidKind as keyof typeof objectIds];
      const paths = status.startsWith("R") || status.startsWith("C")
        ? "packages/arc-framework/arc/old.md\0packages/arc-framework/arc/new.md\0"
        : "packages/arc-framework/arc/example.md\0";
      await writeFile(fixture, Buffer.from(`:${oldMode} ${newMode} ${oldOid} ${newOid} ${status}\0${paths}`));

      expect(await decide(repo, "pull_request", base, head, { CLASSIFY_RAW_DIFF_FILE: fixture })).toEqual({
        weight: "heavy",
        reason: "unverified",
      });
    },
  );

  it.each([
    ["missing destination", exactRename, "packages/arc-framework/arc/old.md\0"],
    ["missing path", "M", ""],
    ["trailing bytes", "M", "packages/arc-framework/arc/example.md\0trailing"],
    ["short rename score", `R${1}`, "docs/old.md\0docs/new.md\0"],
    ["out-of-range rename score", `R${101}`, "docs/old.md\0docs/new.md\0"],
    ["same-path rename", exactRename, "docs/same.md\0docs/same.md\0"],
    ["same-path copy", exactCopy, "docs/same.md\0docs/same.md\0"],
  ])("fails closed for malformed raw input: %s", async (_label, status, paths) => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "one\n" }, "base");
    const head = await writeAndCommit(repo, { "README.md": "two\n" }, "head");
    const fixture = join(repo, "raw-malformed.bin");
    const ones = "1".repeat(40);
    const twos = "2".repeat(40);
    await writeFile(fixture, Buffer.from(`:100644 100644 ${ones} ${twos} ${status}\0${paths}`));

    expect(await decide(repo, "pull_request", base, head, { CLASSIFY_RAW_DIFF_FILE: fixture })).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it.each([
    ["modified without an old endpoint", "M", "000000", "100644", "zero", "one", false],
    ["added with an old endpoint", "A", "100644", "100644", "one", "two", false],
    ["deleted with a new endpoint", "D", "100644", "100644", "one", "two", false],
    ["rename without an old endpoint", exactRename, "000000", "100644", "zero", "one", true],
    ["mode and object presence disagree", "M", "100644", "100644", "zero", "one", false],
    ["mixed object ID widths", "M", "100644", "100644", "one", "one64", false],
    ["noncanonical Git modes", "M", "100640", "100640", "one", "two", false],
    ["no-op modification", "M", "100644", "100644", "one", "one", false],
    ["modified across object types", "M", "100644", "120000", "one", "two", false],
    ["type change within one object type", "T", "100644", "100755", "one", "two", false],
  ])(
    "fails closed for status-inconsistent raw input: %s",
    async (_label, status, oldMode, newMode, oldOidKind, newOidKind, twoPaths) => {
      const repo = await createTempRepo();
      tempDirs.push(repo);
      const base = await writeAndCommit(repo, { "README.md": "one\n" }, "base");
      const head = await writeAndCommit(repo, { "README.md": "two\n" }, "head");
      const fixture = join(repo, "raw-endpoint-incomplete.bin");
      const objectIds = {
        zero: "0".repeat(40),
        one: "1".repeat(40),
        one64: "1".repeat(64),
        two: "2".repeat(40),
      };
      const oldOid = objectIds[oldOidKind as keyof typeof objectIds];
      const newOid = objectIds[newOidKind as keyof typeof objectIds];
      const paths = twoPaths ? "docs/old.md\0docs/new.md\0" : "docs/example.md\0";
      await writeFile(fixture, Buffer.from(`:${oldMode} ${newMode} ${oldOid} ${newOid} ${status}\0${paths}`));

      expect(await decide(repo, "pull_request", base, head, { CLASSIFY_RAW_DIFF_FILE: fixture })).toEqual({
        weight: "heavy",
        reason: "unverified",
      });
    },
  );

  it("classifies newline-bearing paths through the NUL-safe diff transport", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "v1\n" }, "docs");
    const docsHead = await writeAndCommit(repo, { "docs/line\nbreak.md": "docs\n" }, "unusual docs path");

    expect(await decide(repo, "pull_request", base, docsHead)).toEqual({
      weight: "light",
      reason: "docs-only",
    });

    const codeHead = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/line\nbreak.ts": "export const value = 1;\n" },
      "unusual code path",
    );
    expect(await decide(repo, "pull_request", docsHead, codeHead)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("is heavy/unverified for an empty change set (base === head)", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const sha = await writeAndCommit(repo, { "README.md": "v1\n" }, "docs");

    expect(await decide(repo, "pull_request", sha, sha)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("is heavy/unverified (fail-safe) when an endpoint ref does not resolve", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const head = await writeAndCommit(repo, { "README.md": "v1\n" }, "docs");

    expect(await decide(repo, "pull_request", "0000000000000000000000000000000000000000", head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("is heavy/unverified on a push that touches code (no lookback on push)", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "v1\n" }, "docs");
    const head = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code change",
    );

    expect(await decide(repo, "push", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("uses the before-to-after endpoint diff for push events", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const root = await writeAndCommit(repo, { "README.md": "base\n" }, "base");
    const before = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code before",
    );
    await execFileAsync("git", ["checkout", "-b", "replacement", root], { cwd: repo });
    const after = await writeAndCommit(repo, { "README.md": "after\n" }, "docs after");

    expect(await decide(repo, "push", before, after)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });
});

describe("classify-change.sh decide (tested-tree record)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function writeAndCommit(
    repo: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string> {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(repo, rel);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    }
    const git = ["-c", "core.hooksPath=/dev/null"];
    await execFileAsync("git", [...git, "add", "-A"], { cwd: repo });
    await execFileAsync("git", [...git, "commit", "-m", message], { cwd: repo });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    return stdout.trim();
  }

  /** Run `decide`, passing the tested-tree record answer when one is given, and parse its output lines. */
  async function decide(
    repo: string,
    event: string,
    base: string,
    head: string,
    verified?: string,
  ): Promise<{ weight: string; reason: string }> {
    const args = ["decide", event, base, head, ...(verified === undefined ? [] : [verified])];
    const result = await runScript(CLASSIFY_SCRIPT, args, { cwd: repo });
    expect(result.exitCode).toBe(0);
    const [weightLine, reasonLine, ...rest] = result.stdout.trimEnd().split("\n");
    expect(rest).toEqual([]);
    expect(weightLine).toMatch(/^weight=(light|heavy)$/u);
    expect(reasonLine).toMatch(/^reason=(docs-only|verified|unverified)$/u);
    return { weight: weightLine!.slice("weight=".length), reason: reasonLine!.slice("reason=".length) };
  }

  async function codeChange(): Promise<{ repo: string; base: string; head: string }> {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "base\n" }, "base");
    const head = await writeAndCommit(repo, { "packages/arc-framework/src/a.ts": "export const x = 1;\n" }, "code");
    return { repo, base, head };
  }

  it("is light/verified when a pull request's tested tree carries a verified record", async () => {
    const { repo, base, head } = await codeChange();
    expect(await decide(repo, "pull_request", base, head, "true")).toEqual({ weight: "light", reason: "verified" });
  });

  it.each([undefined, "", "false", "TRUE", "yes", "true "])(
    "keeps a code-touching pull request heavy/unverified when the record answer is %j",
    async (verified) => {
      const { repo, base, head } = await codeChange();
      expect(await decide(repo, "pull_request", base, head, verified)).toEqual({ weight: "heavy", reason: "unverified" });
    },
  );

  it("ignores a verified record on a push", async () => {
    const { repo, base, head } = await codeChange();
    expect(await decide(repo, "push", base, head, "true")).toEqual({ weight: "heavy", reason: "unverified" });
  });

  it("never lets a verified record skip an unresolvable change set", async () => {
    const { repo, head } = await codeChange();
    expect(await decide(repo, "pull_request", "0".repeat(40), head, "true"))
      .toEqual({ weight: "heavy", reason: "unverified" });
  });

  it("keeps a docs-only pull request light without a verified record", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "packages/arc-framework/src/a.ts": "export const x = 1;\n" }, "code");
    const head = await writeAndCommit(repo, { "README.md": "docs\n" }, "docs only");
    expect(await decide(repo, "pull_request", base, head, "false")).toEqual({ weight: "light", reason: "docs-only" });
  });
});

/**
 * A pull-request run tests GitHub's merge of its head into the current base, so the verified record is keyed by that
 * merged tree. The head commit's own tree is not enough: a docs-only commit on verified code keeps the head's code tree,
 * while the base may have moved the code the merge tests.
 */
describe("classify-change.sh tested-tree identity", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function git(repo: string, ...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo });
    return stdout.trim();
  }

  async function commit(repo: string, files: Record<string, string>, message: string): Promise<string> {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(join(repo, rel)), { recursive: true });
      await writeFile(join(repo, rel), content);
    }
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", message);
    return git(repo, "rev-parse", "HEAD");
  }

  /** Merge `head` into `base` as a pull-request test merge does, returning the merge commit. */
  async function testMerge(repo: string, base: string, head: string): Promise<string> {
    await git(repo, "checkout", "-q", "--detach", base);
    await git(repo, "merge", "--no-ff", "-q", "-m", `merge ${head} into ${base}`, head);
    return git(repo, "rev-parse", "HEAD");
  }

  async function treeHash(repo: string, ref: string): Promise<string> {
    const result = await runScript(CLASSIFY_SCRIPT, ["tree-hash", ref], { cwd: repo });
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  }

  async function scenario(): Promise<{ repo: string; base: string; verified: string; docsOnTop: string }> {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await commit(repo, { "packages/arc-framework/src/shared.ts": "export const s = 1;\n" }, "base");
    await git(repo, "checkout", "-q", "-b", "feature");
    const verified = await commit(repo, { "packages/arc-framework/src/a.ts": "export const x = 1;\n" }, "code");
    const docsOnTop = await commit(repo, { "README.md": "docs\n" }, "docs on verified code");
    return { repo, base, verified, docsOnTop };
  }

  it("misses a record when the base moved the code under an unchanged head code tree", async () => {
    const { repo, base, verified, docsOnTop } = await scenario();
    const recorded = await testMerge(repo, base, verified);
    await git(repo, "checkout", "-q", "--detach", base);
    const movedBase = await commit(repo, { "packages/arc-framework/src/shared.ts": "export const s = 2;\n" }, "base code");

    // The head commits share a code tree, which is all a head-keyed lookback compares.
    expect(await treeHash(repo, docsOnTop)).toBe(await treeHash(repo, verified));
    expect(await treeHash(repo, await testMerge(repo, movedBase, docsOnTop))).not.toBe(await treeHash(repo, recorded));
  });

  it("matches a record across a docs-only head commit and a docs-only base advance", async () => {
    const { repo, base, verified, docsOnTop } = await scenario();
    const recorded = await testMerge(repo, base, verified);
    await git(repo, "checkout", "-q", "--detach", base);
    const docsBase = await commit(repo, { "CHANGELOG.md": "notes\n" }, "base docs");

    expect(await treeHash(repo, await testMerge(repo, docsBase, docsOnTop))).toBe(await treeHash(repo, recorded));
  });
});

describe("CI verified-tree record", () => {
  const workflowPath = join(dirname(CLASSIFY_SCRIPT), "../.github/workflows/ci.yml");
  const step = z.object({
    id: z.string().optional(),
    if: z.string().optional(),
    run: z.string().optional(),
    uses: z.string().optional(),
    env: z.record(z.string(), z.unknown()).optional(),
    with: z.record(z.string(), z.unknown()).optional(),
    "continue-on-error": z.boolean().optional(),
  });
  const workflowSchema = z.object({
    jobs: z.record(z.string(), z.object({
      name: z.string(),
      if: z.string().optional(),
      needs: z.union([z.string(), z.array(z.string())]).optional(),
      permissions: z.unknown().optional(),
      outputs: z.record(z.string(), z.string()).optional(),
      steps: z.array(step),
    })),
  });
  type Workflow = z.infer<typeof workflowSchema>;
  type Job = Workflow["jobs"][string];

  const readWorkflow = (): Promise<string> => readFile(workflowPath, "utf-8");
  const parseWorkflow = (source: string): Workflow => workflowSchema.parse(load(source));
  const needsOf = (job: Job): string[] => job.needs === undefined ? [] : [job.needs].flat();

  function jobOf(workflow: Workflow, id: string): Job {
    const job = workflow.jobs[id];
    if (job === undefined) throw new Error(`missing job ${id}`);
    return job;
  }

  function stepOf(job: Job, id: string): z.infer<typeof step> {
    const found = job.steps.find((entry) => entry.id === id);
    if (found === undefined) throw new Error(`missing step ${id}`);
    return found;
  }

  /** Jobs a light run skips, entirely or by step: every one must pass before a tree counts as verified. */
  function heavyJobIds(source: string): string[] {
    const workflow = parseWorkflow(source);
    const heavyCondition = /needs\.classify\.outputs\.weight\s*!=\s*['"]light['"]/u;
    const durationPreparationCommand = "node --import tsx packages/arc-framework/__tests__/helpers/prepare-duration-input.ts "
      + "packages/arc-framework/.test-cost-runs/duration-input";
    const preparationCommands = new Set([
      "npm ci", durationPreparationCommand,
      "git show-ref --verify --quiet refs/heads/main || git branch main origin/main",
      "node --import tsx scripts/run-ci-checks.mjs validate",
      'node --import tsx packages/arc-framework/src/cli.ts check gate merge --ci --dry-run --json > "$RUNNER_TEMP/arc-check-forecast.json"\n'
        + 'mv "$RUNNER_TEMP/arc-check-forecast.json" .arc-check-forecast.json',
    ]);
    const preparationAction = /^actions\/(?:checkout|setup-node|cache(?:\/restore)?|upload-artifact)@/u;
    const ids: string[] = [];
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      // Shared setup publishes artifacts, so it is the sole non-verification exception.
      // Fail closed if that job acquires any verification command or action.
      if (jobId === "setup") {
        expect(job.steps.every((entry) => entry.run !== undefined
          ? preparationCommands.has(entry.run.trim())
          : preparationAction.test(entry.uses ?? "")), "Shared setup must remain artifact preparation only").toBe(true);
        ids.push(jobId);
        continue;
      }
      if (heavyCondition.test(job.if ?? "") || job.steps.some((entry) => heavyCondition.test(entry.if ?? ""))) {
        ids.push(jobId);
      }
    }
    return ids;
  }

  /** Heavy jobs the record job does not both wait for and require to succeed. */
  function recordCoverageGaps(source: string): string[] {
    const record = jobOf(parseWorkflow(source), "record-verified-tree");
    const needs = new Set(needsOf(record));
    return heavyJobIds(source).filter((id) => !needs.has(id)
      || !(record.if ?? "").includes(`needs.${id}.result == 'success'`));
  }

  /** Fold both spellings of the tested tree into one token so the lookup and save keys compare directly. */
  const normalizedKey = (key: unknown): string => String(key)
    .replace("steps.tested.outputs.tree", "TESTED_TREE")
    .replace("needs.classify.outputs.tested_tree", "TESTED_TREE");

  it("records a tree only after every heavy job succeeds on a heavy pull-request run", async () => {
    const source = await readWorkflow();
    const ids = heavyJobIds(source);
    expect(ids).toEqual(expect.arrayContaining(["setup", "build", "lint-typecheck", "unit", "integration", "e2e"]));
    expect(recordCoverageGaps(source)).toEqual([]);
    const record = jobOf(parseWorkflow(source), "record-verified-tree");
    expect(needsOf(record).sort()).toEqual(["classify", ...ids].sort());
    expect(record.if).toContain("github.event_name == 'pull_request'");
    expect(record.if).toContain("needs.classify.outputs.weight == 'heavy'");
  });

  const verificationSteps = [
    ["node", "run: node scripts/verify.mjs"],
    ["npx", "run: npx verify-tool"],
    ["arbitrary npm script", "run: npm run verify:custom"],
    ["action", "uses: example/verification@v1"],
  ];
  it.each(verificationSteps.flatMap(([label, entry]) => [
    [label, "job", entry], [label, "step", entry],
  ]))("refuses a record that omits a new %s verification under a heavy %s condition", async (_label, at, entry) => {
    const condition = "${{ needs.classify.outputs.weight != 'light' }}";
    const addedJob = [
      "", "  future-verification:", "    name: Future Heavy Verification",
      ...(at === "job" ? [`    if: ${condition}`] : []),
      "    steps:", `    - ${entry}`,
      ...(at === "step" ? [`      if: ${condition}`] : []),
      "",
    ].join("\n");

    expect(recordCoverageGaps(await readWorkflow() + addedJob)).toEqual(["future-verification"]);
  });

  it.each([
    ["command", /run: npm ci/u, "run: node scripts/verify.mjs"],
    ["duration command", /prepare-duration-input\.ts/u, "verify-duration-input.ts"],
    ["action", /uses: actions\/upload-artifact@[^\n]+/u, "uses: example/verification@v1"],
  ] as const)("rejects a verification %s in the shared setup exception", async (_label, pattern, replacement) => {
    const workflow = await readWorkflow();
    const start = workflow.indexOf("  setup:");
    const end = workflow.indexOf("  build:", start);
    const setup = workflow.slice(start, end);
    expect(setup).toMatch(pattern);

    expect(() => heavyJobIds(workflow.slice(0, start) + setup.replace(pattern, replacement) + workflow.slice(end)))
      .toThrow("Shared setup must remain artifact preparation only");
  });

  it("keeps the advisory record out of the required roll-up", async () => {
    const workflow = parseWorkflow(await readWorkflow());
    const record = jobOf(workflow, "record-verified-tree");
    expect(needsOf(jobOf(workflow, "ci_ok"))).not.toContain("record-verified-tree");
    expect(record.permissions).toEqual({});
    const save = record.steps.find((entry) => entry.uses?.startsWith("actions/cache/save@"));
    expect(save?.["continue-on-error"]).toBe(true);
  });

  it("looks the record up under the key it is saved with, for the commit every heavy job tests", async () => {
    const source = await readWorkflow();
    const workflow = parseWorkflow(source);
    const classify = jobOf(workflow, "classify");
    const tested = stepOf(classify, "tested");
    const lookup = stepOf(classify, "verified");
    const decision = stepOf(classify, "c");
    const save = jobOf(workflow, "record-verified-tree").steps.find((entry) => entry.uses?.startsWith("actions/cache/save@"));

    expect(classify.outputs?.tested_tree).toBe("${{ steps.tested.outputs.tree }}");
    expect(tested.env?.TESTED_SHA).toBe("${{ github.sha }}");
    expect(tested.run).toContain('tree-hash "$TESTED_SHA"');
    expect(lookup.uses).toMatch(/^actions\/cache\/restore@/u);
    expect(lookup.with?.["lookup-only"]).toBe(true);
    expect(lookup.with?.path).toBe(save?.with?.path);
    expect(normalizedKey(lookup.with?.key)).toBe(normalizedKey(save?.with?.key));
    expect(normalizedKey(lookup.with?.key)).toContain("github.event.pull_request.number");
    expect(decision.env?.TESTED_TREE_VERIFIED).toBe("${{ steps.verified.outputs.cache-hit }}");
    expect(decision.run).toContain('decide "$event" "$all_base" "$all_head" "$TESTED_TREE_VERIFIED"');
    // Every job the record vouches for must test `github.sha`, which a checkout `ref` would override.
    for (const id of ["classify", ...heavyJobIds(source)]) {
      for (const entry of jobOf(workflow, id).steps.filter((candidate) => candidate.uses?.startsWith("actions/checkout@"))) {
        expect(entry.with?.ref, `${id} checks out another ref`).toBeUndefined();
      }
    }
  });
});
