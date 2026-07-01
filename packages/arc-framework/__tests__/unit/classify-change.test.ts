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

describe("classify-change.sh decide (verified-tree lookback)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  /** Heavy check-run display names — must mirror HEAVY_CHECK_NAMES in classify-change.sh. */
  const HEAVY_CHECKS = [
    "Lint, Typecheck & Unit Tests",
    "Integration & E2E Tests",
    "Portability (concurrency guards) (ubuntu-latest)",
    "Portability (concurrency guards) (macos-latest)",
    "Portability (concurrency guards) (windows-latest)",
  ];

  /** Render [name, conclusion] pairs as the normalized "<name>\t<conclusion>" lines the seam returns. */
  function checkLines(runs: Array<[string, string]>): string {
    return runs.map(([name, conclusion]) => `${name}\t${conclusion}`).join("\n") + "\n";
  }

  /** All heavy checks at `success`. */
  function allGreen(): string {
    return checkLines(HEAVY_CHECKS.map((name) => [name, "success"]));
  }

  /** All heavy checks green except `name`, which takes `conclusion` (e.g. `failure`, or `""` for in-progress). */
  function greenExcept(name: string, conclusion: string): string {
    return checkLines(HEAVY_CHECKS.map((n) => [n, n === name ? conclusion : "success"]));
  }

  /** All heavy checks green except `name`, which is absent from the set entirely. */
  function greenOmitting(name: string): string {
    return checkLines(HEAVY_CHECKS.filter((n) => n !== name).map((n) => [n, "success"]));
  }

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

  /** Write a check-runs fixture for `sha` into the injected directory. */
  async function injectChecks(checksDir: string, sha: string, tsv: string): Promise<void> {
    await writeFile(join(checksDir, `${sha}.tsv`), tsv);
  }

  /** Run `decide` with check-runs injected from `checksDir`, parsing the `weight=` / `reason=` lines. */
  async function decide(
    repo: string,
    checksDir: string,
    event: string,
    base: string,
    head: string,
  ): Promise<{ weight: string | undefined; reason: string | undefined }> {
    const result = await runScript(CLASSIFY_SCRIPT, ["decide", event, base, head], {
      cwd: repo,
      env: { CLASSIFY_CHECK_RUNS_DIR: checksDir },
    });
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

  /**
   * A linear repo where a verified code commit is layered with a docs-only
   * commit, so HEAD and the code commit share a code-tree hash: base → code → docs(HEAD).
   */
  async function layeredRepo(): Promise<{
    repo: string;
    checksDir: string;
    base: string;
    code: string;
    head: string;
  }> {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "base\n" }, "base");
    const code = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code",
    );
    const head = await writeAndCommit(repo, { "README.md": "docs\n" }, "docs on top of verified code");
    const checksDir = join(repo, ".checks");
    await mkdir(checksDir, { recursive: true });
    return { repo, checksDir, base, code, head };
  }

  it("is light/verified when a commit carrying HEAD's code tree has all heavy checks green", async () => {
    const { repo, checksDir, base, code, head } = await layeredRepo();
    // The prior code commit (not HEAD) holds the green run; HEAD is a docs-only
    // delta on top, so its code tree matches and the lookback reaches back to it.
    await injectChecks(checksDir, code, allGreen());

    expect(await decide(repo, checksDir, "pull_request", base, head)).toEqual({
      weight: "light",
      reason: "verified",
    });
  });

  const TARGET = "Integration & E2E Tests";

  it("uses the latest duplicate check run when reruns share a display name", async () => {
    const { repo, checksDir, base, code, head } = await layeredRepo();
    await injectChecks(checksDir, code, allGreen() + `${TARGET}\tfailure\n`);

    expect(await decide(repo, checksDir, "pull_request", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it.each([
    ["a failed", greenExcept(TARGET, "failure")],
    ["an in-progress (empty conclusion)", greenExcept(TARGET, "")],
    ["an absent", greenOmitting(TARGET)],
  ])("is heavy/unverified when the matching commit has %s heavy check", async (_label, tsv) => {
    const { repo, checksDir, base, code, head } = await layeredRepo();
    await injectChecks(checksDir, code, tsv);

    expect(await decide(repo, checksDir, "pull_request", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("is heavy/unverified when no commit in range carries HEAD's code tree (green run on a different tree)", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "base\n" }, "base");
    const oldCode = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code v1",
    );
    const head = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 2;\n" },
      "code v2",
    );
    const checksDir = join(repo, ".checks");
    await mkdir(checksDir, { recursive: true });
    // The green run is on the v1 tree, which no longer matches HEAD's v2 tree;
    // it must be filtered out by the hash check rather than skip the suite.
    await injectChecks(checksDir, oldCode, allGreen());

    expect(await decide(repo, checksDir, "pull_request", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("does not look back on a push even when HEAD itself has a green run", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(repo, { "README.md": "base\n" }, "base");
    const head = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n" },
      "code",
    );
    const checksDir = join(repo, ".checks");
    await mkdir(checksDir, { recursive: true });
    await injectChecks(checksDir, head, allGreen());

    expect(await decide(repo, checksDir, "push", base, head)).toEqual({
      weight: "heavy",
      reason: "unverified",
    });
  });

  it("decides docs-only without consulting the Checks API (empty injected dir still resolves light)", async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const base = await writeAndCommit(
      repo,
      { "packages/arc-framework/src/a.ts": "export const x = 1;\n", "README.md": "v1\n" },
      "code + docs",
    );
    const head = await writeAndCommit(repo, { "README.md": "v2\n" }, "docs only");
    const checksDir = join(repo, ".checks");
    await mkdir(checksDir, { recursive: true });
    // No fixtures injected: if the docs-only arm consulted the API, the absent
    // run would force heavy. It must short-circuit to light without looking.
    expect(await decide(repo, checksDir, "pull_request", base, head)).toEqual({
      weight: "light",
      reason: "docs-only",
    });
  });
});
