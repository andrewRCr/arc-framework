/** Active merge conclusions select conflict history and authored resolution content. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";
import { runArc } from "./helpers.js";
const exec = promisify(execFile);
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
const command = [process.execPath, "-e", "console.log(JSON.stringify({args:process.argv.slice(1),base:process.env.ARC_CHECK_BASE,tree:process.env.ARC_CHECK_TREE,merged:process.env.ARC_CHECK_MERGED}))"];
async function git(root: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd: root, env: environmentForGitCwd(root) })).stdout.trim();
}
async function fixture(linked = false): Promise<{ root: string; head: string; parent: string; primary: string }> {
  let root = await createDeclaredCheckRepository({
    files: { command, gate: "commit", mode: "files", inputs: ["src/**"], cache: false },
    incoming: { command, gate: "commit", inputs: ["src/incoming.ts"], cache: false },
    coverage: { command, inputs: ["docs/**", ".arc/system/arc-checks.yml"] },
  }, { global_inputs: ["docs/**"] });
  const primary = root;
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const branch = await git(root, ["branch", "--show-current"]);
  await git(root, ["checkout", "-b", "incoming"]);
  await writeFile(join(root, "src/a.ts"), "incoming conflict\n");
  await writeFile(join(root, "src/deleted.ts"), "incoming second conflict\n");
  await writeFile(join(root, "src/incoming.ts"), "clean incoming\n");
  await writeFile(join(root, "docs/b.md"), "clean incoming global\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "incoming"]);
  const parent = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["checkout", branch]);
  await writeFile(join(root, "src/a.ts"), "our conflict\n");
  await writeFile(join(root, "src/deleted.ts"), "our second conflict\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "ours"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  if (linked) {
    root = `${primary}-linked`;
    await git(primary, ["worktree", "add", "-b", "linked", root]);
    repositories.push(root);
  }
  await expect(git(root, ["merge", "--no-commit", "incoming"])).rejects.toMatchObject({ code: 1 });
  await writeFile(join(root, "src/a.ts"), "our conflict\n");
  await writeFile(join(root, "src/deleted.ts"), "authored resolution\n");
  await writeFile(join(root, "src/resolution.ts"), "extra resolution edit\n");
  await git(root, ["add", "-A"]);
  return { root, head, parent, primary };
}
it("selects one-sided conflicts and resolution edits while excluding clean incoming content", async () => {
  const { root, head, parent } = await fixture();
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout).result;
  expect(report.checks).toMatchObject([{ id: "files", outcome: "passed" }, { id: "incoming", outcome: "not selected" }]);
  expect(JSON.parse(report.checks[0].output)).toEqual({
    args: ["src/a.ts", "src/deleted.ts", "src/resolution.ts"], base: head, tree: report.tree, merged: parent,
  });
  expect(report).toMatchObject({ base: head, merged: [parent] });
}, 60_000);

it.each(["global", "uncovered", "declaration"] as const)("widens a %s resolution edit using normal commit selection", async cause => {
  const { root } = await fixture();
  if (cause === "global") await writeFile(join(root, "docs/b.md"), "authored global resolution\n");
  if (cause === "uncovered") await writeFile(join(root, "uncovered.txt"), "authored uncovered resolution\n");
  if (cause === "declaration") {
    const path = join(root, ".arc/system/arc-checks.yml");
    const declaration = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...declaration, commit_fixes: "fail" }));
  }
  await git(root, ["add", "-A"]);
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout).result;
  expect(report.checks).toMatchObject([{ id: "files", outcome: "passed" }, { id: "incoming", outcome: "passed" }]);
  expect(JSON.parse(report.checks[0].output).args).toEqual(["src/a.ts", "src/deleted.ts", "src/incoming.ts", "src/resolution.ts"]);
}, 60_000);

it("retains a conflicted path resolved with the first parent's unchanged content", async () => {
  const { root } = await fixture();
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(JSON.parse(result.stdout).result.checks[0].output).args).toContain("src/a.ts");
}, 60_000);

it("exports the first parent, exact index tree, and active incoming parent", async () => {
  const { root, head, parent } = await fixture();
  const tree = await git(root, ["write-tree"]);
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(JSON.parse(result.stdout).result.checks[0].output)).toMatchObject({ base: head, tree, merged: parent });
}, 60_000);

it("reads a linked worktree's own conflict history instead of its primary's message", async () => {
  const { root, primary } = await fixture(true);
  await writeFile(join(primary, ".git/MERGE_MSG"), "#\tsrc/incoming.ts\n");
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(JSON.parse(result.stdout).result.checks[0].output).args)
    .toEqual(["src/a.ts", "src/deleted.ts", "src/resolution.ts"]);
}, 60_000);

it.each(["MERGE_HEAD", "MERGE_MSG"])("refuses unreadable %s metadata and retries successfully after repair", async name => {
  const { root, head, parent } = await fixture();
  const path = await git(root, ["rev-parse", "--path-format=absolute", "--git-path", name]);
  const original = await readFile(path, "utf8");
  if (name === "MERGE_HEAD") await writeFile(path, "invalid parent\n");
  else await rm(path);
  const refused = await runArc(["check", "pre-commit", "--json"], root);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(refused.stdout).toContain("Repair the checkout's merge metadata");
  expect(refused.stdout).toContain("retry git commit");
  await writeFile(path, original);
  const repaired = await runArc(["check", "pre-commit", "--json"], root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result).toMatchObject({ base: head, merged: [parent] });
}, 60_000);
