/** ADR checks read immutable Git objects, including snapshots of uncommitted files. */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, makeCommit } from "../helpers/integration.js";
import { gitExec } from "../../src/lib/io-context.js";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";
import { createWorktreeSnapshot } from "../../src/lib/checks/tree.js";

const script = fileURLToPath(new URL("../../src/scripts/check-adr-records.ts", import.meta.url));
const loader = import.meta.resolve("tsx");
const original = ".arc/reference/adr/adr-001-original.md";
const proposed = ".arc/reference/adr/adr-020-proposed.md";
const added = ".arc/reference/adr/adr-041-new.md";
const accepted = "Accepted (2026-10-10).\n\nOriginal realization note.";
let root: string;
let base: string;

async function git(args: string[]): Promise<string> {
  return (await gitExec("git", args, { cwd: root })).stdout.trim();
}
async function write(path: string, status: string | null): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), `# Decision\n\n${status === null ? "" : `## Status\n\n${status}\n\n`}## Context\n\nThe context.\n`);
}
async function commit(): Promise<string> {
  await git(["add", "-A"]);
  return makeCommit(root, "fixture content");
}
async function check(rule: "status" | "numbers", paths: string[], tree: string, comparison?: string) {
  const env = { ...environmentForGitCwd(root) };
  delete env.ARC_CHECK_TREE;
  delete env.ARC_CHECK_BASE;
  delete env.ARC_CHECK_MERGED;
  delete env.FORCE_COLOR;
  env.ARC_CHECK_TREE = tree;
  if (comparison !== undefined) env.ARC_CHECK_BASE = comparison;
  const result = await execa(process.execPath, ["--import", loader, script, rule, ...paths], {
    cwd: root, env, extendEnv: false, reject: false,
  });
  return { exitCode: result.exitCode, output: result.stdout + result.stderr };
}

beforeEach(async () => {
  root = await createTempRepo("arc-adr-check-");
  await write(original, accepted);
  await write(proposed, "Proposed.");
  base = await commit();
});
afterEach(async () => { await cleanupTempDir(root); });

describe("ADR Git-tree checks", () => {
  it.each(["Proposed.", null])("rejects a new ADR reading %s, then admits acceptance from the supplied tree", async status => {
    await write(added, status);
    const failure = await check("status", [added], await commit(), base);
    expect(failure.exitCode, failure.output).toBe(1);
    expect(failure.output).toContain(added);
    expect(failure.output).toMatch(/Accepted \(\d{4}-\d{2}-\d{2}\)/u);
    await write(added, "Accepted (2026-11-04).");
    const tree = await commit();
    await write(added, "Proposed.");
    expect(await check("status", [added], tree, base)).toEqual({ exitCode: 0, output: "" });
  });
  it.each(["Proposed.", null])("restores the base Status section after %s", async status => {
    await write(original, status);
    const failure = await check("status", [original], await commit(), base);
    expect(failure.exitCode, failure.output).toBe(1);
    expect(failure.output).toContain(`(${original} at ${base.slice(0, 7)}):\n  Accepted (2026-10-10).\n  \n  Original realization note.`);
    await write(original, accepted);
    expect(await check("status", [original], await commit(), base)).toEqual({ exitCode: 0, output: "" });
  });
  it("admits a renamed base-Proposed record", async () => {
    const renamed = ".arc/reference/adr/adr-020-renamed.md";
    await rename(join(root, proposed), join(root, renamed));
    expect(await check("status", [renamed], await commit(), base)).toEqual({ exitCode: 0, output: "" });
  });
  it("examines an uncommitted ADR through the controller's snapshot", async () => {
    const spaced = ".arc/reference/adr/adr-041-space name.md";
    await write(spaced, "Proposed.");
    expect(await git(["ls-tree", "--name-only", "HEAD", "--", spaced])).toBe("");
    const snapshot = await createWorktreeSnapshot(gitExec, root);
    try {
      await write(spaced, "Accepted.");
      const result = await check("status", [spaced], snapshot.tree, base);
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(`${spaced} is a new ADR reading Proposed`);
    } finally { await snapshot.remove(); }
  });
  it("refuses status without an inherited or supplied base", async () => {
    const result = await check("status", [proposed], base);
    expect(result.exitCode, result.output).toBe(1);
    expect(result.output).toContain("No base to compare ADRs against");
    expect(result.output).toContain("--range <merge-base>");
  });
  it("names an added collision and admits its renumber", async () => {
    const collision = ".arc/reference/adr/adr-001-collision.md";
    await write(collision, "Accepted.");
    const result = await check("numbers", [], await commit(), base);
    expect(result.exitCode, result.output).toBe(1);
    expect(result.output).toContain(original);
    expect(result.output).toContain(`Renumber ${collision} to ADR-021`);
    await rename(join(root, collision), join(root, ".arc/reference/adr/adr-021-renumbered.md"));
    expect(await check("numbers", [], await commit(), base)).toEqual({ exitCode: 0, output: "" });
  });
  it("reports collisions without a base and explains how to select the renumber", async () => {
    const collision = ".arc/reference/adr/adr-001-collision.md";
    await write(collision, "Accepted.");
    const result = await check("numbers", [], await commit());
    expect(result.exitCode, result.output).toBe(1);
    expect(result.output).toContain(original);
    expect(result.output).toContain(collision);
    expect(result.output).toContain("first-parent history");
    expect(result.output).toContain("Make the base branch resolvable and rerun");
  });
});
