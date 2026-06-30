/**
 * Harness smoke tests for `scripts/classify-change.sh`.
 *
 * Establishes the shell-script unit-test seam the path-classification and
 * code-tree-hash work lands on: the subprocess spawn contract ({@link
 * runScript}), the script's subcommand-dispatch scaffold, and the temp-git-repo
 * scaffolding ({@link createTempRepo}) the tree-hash cases build on. Assertions
 * here cover only the dispatch surface that stays stable as the subcommands are
 * implemented — the `classify` / `tree-hash` behaviors get their own suites.
 */

import { describe, it, expect, afterEach } from "vitest";

import { CLASSIFY_SCRIPT, runScript } from "../helpers/run-script.js";
import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  execFileAsync,
  writeFile,
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

  it.each(["classify", "tree-hash", "decide"])(
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
});

describe("classify-change.sh classify", () => {
  async function classify(files: string[]): Promise<string> {
    const result = await runScript(CLASSIFY_SCRIPT, ["classify", ...files]);
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

  async function treeHash(repo: string, ref: string): Promise<string> {
    const result = await runScript(CLASSIFY_SCRIPT, ["tree-hash", ref], { cwd: repo });
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
  ): Promise<{ weight: string | undefined; reason: string | undefined }> {
    const result = await runScript(CLASSIFY_SCRIPT, ["decide", event, base, head], { cwd: repo });
    expect(result.exitCode).toBe(0);
    const weight = /^weight=(\S+)$/m.exec(result.stdout)?.[1];
    const reason = /^reason=(\S+)$/m.exec(result.stdout)?.[1];
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

    // The docs-only arm is decided purely from the changed set — no Checks-API
    // call. (The lookback seam, and a regression guard that docs-only never
    // invokes it, land with the verified-tree work.)
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
});
