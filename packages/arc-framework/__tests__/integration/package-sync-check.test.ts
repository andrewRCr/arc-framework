/** Repository sync checks consume real index blobs and commit ancestry. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDir, DEFAULT_PROMPTS, initInTempRepo } from "../helpers/integration.js";
import { gitExec } from "../../src/lib/io-context.js";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";

const script = fileURLToPath(new URL("../../../../scripts/check-package-sync.sh", import.meta.url));
const instance = ".arc/system/rules/DEV-RULES.PROJECT.md";
const source = "packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.md";
const frameworkInstance = ".arc/system/rules/DEV-RULES.ARC.md";
const frameworkSource = "packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md";
let root: string;
let base: string;

async function git(args: string[], indexFile?: string): Promise<string> {
  return (await gitExec("git", args, { cwd: root, indexFile })).stdout.trim();
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function commit(): Promise<string> {
  await git(["add", "-A"]);
  await git(["commit", "-qm", "fixture content"]);
  return git(["rev-parse", "HEAD"]);
}

async function mergeIncoming(content = "# Framework defaults\n", keepOverride = false): Promise<string> {
  await git(["checkout", "-qb", "incoming", base]);
  await write(instance, content);
  const incoming = await commit();
  await git(["checkout", "-q", "main"]);
  await write("unrelated.txt", "main-side edit\n");
  await commit();
  await git(["merge", "--no-ff", "--no-commit", "incoming"]);
  if (keepOverride) await write(instance, "# Retained project overrides\n");
  await commit();
  return incoming;
}

async function check(paths: string[], options: { base?: string; merged?: string[]; indexFile?: string } = {}) {
  const env = { ...environmentForGitCwd(root) };
  delete env.ARC_CHECK_BASE;
  delete env.ARC_CHECK_MERGED;
  if (options.base !== undefined) env.ARC_CHECK_BASE = options.base;
  if (options.merged !== undefined) env.ARC_CHECK_MERGED = options.merged.join(" ");
  if (options.indexFile !== undefined) env.GIT_INDEX_FILE = options.indexFile;
  const result = await execa("bash", [script, ...paths], { cwd: root, env, reject: false });
  return { exitCode: result.exitCode, output: result.stdout + result.stderr };
}

beforeEach(async () => {
  root = await initInTempRepo({ ...DEFAULT_PROMPTS, tools: [] });
  // Fixture history seeds the checker inputs independently of installed commit hooks.
  await git(["config", "core.hooksPath", ".git/fixture-hooks"]);
  await write(source, "# Framework defaults\n");
  await write(instance, "# Project overrides\n");
  await write(frameworkSource, "# Shared framework\n");
  await write(frameworkInstance, "# Shared framework\n");
  base = await commit();
});

afterEach(async () => { await cleanupTempDir(root); });

describe("package sync check", () => {
  it.each([{ paths: [] }, { paths: [instance] }])("requires the exported base for supplied scope $paths", async ({ paths }) => {
    const result = await check(paths);
    expect(result.exitCode, result.output).toBe(1);
    expect(result.output).toContain("ARC_CHECK_BASE is required");
  });

  it("leaves staged paths unselected when the supplied scope is empty", async () => {
    await write(instance, "# Framework defaults\n");
    await git(["add", instance]);
    const result = await check([], { base });
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).not.toContain(instance);
  });

  it.each([false, true])("accepts a merged-in parent's content over the requested range (longer=%s)", async longer => {
    const incoming = await mergeIncoming();
    if (longer) {
      await write("later.txt", "later unrelated edit\n");
      await commit();
    }

    const result = await check([instance], { base, merged: [incoming] });
    expect(result.exitCode, result.output).toBe(0);
  });

  it("accepts an instance blob equal to a merged-in parent whose copies differ", async () => {
    const incoming = await mergeIncoming("# Incoming project overrides\n");
    await write(source, "# Incoming project overrides\n");
    await commit();

    const result = await check([instance, source], { base, merged: [incoming] });
    expect(result.exitCode, result.output).toBe(0);
  });

  it("does not count an override removed by a merged-in parent after identical edits to both copies", async () => {
    const incoming = await mergeIncoming();
    await write(instance, "# Both copies edited\n");
    await write(source, "# Both copies edited\n");
    await commit();

    const result = await check([instance, source], { base, merged: [incoming] });
    expect(result.exitCode, result.output).toBe(0);
  });

  it("fails a blind copy at its own commit even when a longer range has a parent that removed the override", async () => {
    const incoming = await mergeIncoming("# Framework defaults\n", true);
    const copyBase = await git(["rev-parse", "HEAD"]);
    await write(instance, "# Framework defaults\n");
    await git(["add", instance]);

    const own = await check([instance], { base: copyBase });
    expect(own.exitCode, own.output).toBe(1);
    const range = await check([instance], { base, merged: [incoming] });
    expect(range.exitCode, range.output).toBe(0);
  });

  it.each([true, false])("reads both copies from the supplied index instead of the worktree (clobbered=%s)", async clobbered => {
    const indexFile = join(root, ".git", "checked-index");
    await git(["read-tree", base], indexFile);
    await write(instance, "# Framework defaults\n");
    await git(["add", instance], indexFile);
    if (clobbered) {
      await write(source, "# Unstaged package edit\n");
    } else {
      await write(source, "# Indexed package edit\n");
      await git(["add", source], indexFile);
      await write(source, "# Framework defaults\n");
    }

    const result = await check([instance, source], { base, indexFile });
    expect(result.exitCode, result.output).toBe(clobbered ? 1 : 0);
  });

  it("checks supplied paths for a committed blind copy with the index equal to HEAD", async () => {
    await write(instance, "# Framework defaults\n");
    await commit();

    const result = await check([instance], { base });
    expect(result.exitCode, result.output).toBe(1);
    expect(result.output).toContain(instance);
    expect(result.output).toContain("overwrote those overrides");
  });

  it.each([true, false])("uses the supplied path set for a Framework counterpart (included=%s)", async included => {
    await write(frameworkInstance, "# Edited framework\n");
    await write(frameworkSource, "# Edited framework\n");
    await commit();

    const result = await check(included ? [frameworkInstance, frameworkSource] : [frameworkInstance], { base });
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output.includes("without package counterpart")).toBe(!included);
  });
});
