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
import { createTempRepo, cleanupTempDir, makeCommit } from "../helpers/integration.js";

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

  it.each(["classify", "tree-hash"])(
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
