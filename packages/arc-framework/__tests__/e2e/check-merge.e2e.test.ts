/** Active merge conclusions select conflict history and authored resolution content. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createDeclaredCheckRepository, installDeclaredCommitHook } from "../fixtures/checks/repository.js";
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
async function fixture(linked = false, commentChar?: string, filesCommand = command): Promise<{ root: string; head: string; parent: string; primary: string }> {
  let root = await createDeclaredCheckRepository({
    files: { command: filesCommand, gate: "commit", mode: "files", inputs: ["src/**"], cache: false },
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
  if (commentChar !== undefined) await git(root, ["config", "core.commentChar", commentChar]);
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

it("retains a historical conflict under Git's configured comment character", async () => {
  const { root } = await fixture(false, ";");
  expect(await readFile(join(root, ".git/MERGE_MSG"), "utf8")).toContain(";\tsrc/a.ts");
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(JSON.parse(result.stdout).result.checks[0].output).args).toContain("src/a.ts");
}, 60_000);

it.each([false, true])("blocks a newline conflict conclusion through the native commit hook (ambiguous: %s)", async ambiguous => {
  const path = ambiguous ? "src/two\n\tsrc/lines.ts" : "src/two\nlines.ts";
  const repairable = [process.execPath, "-e", "process.exit(require('node:fs').existsSync('receipt.json')?0:1)"];
  const root = await createDeclaredCheckRepository({
    project: { command: repairable, gate: "commit", inputs: [ambiguous ? "docs/**" : "src/**"], cache: false },
    files: { command, gate: "commit", mode: "files", inputs: ["src/**"], cache: false },
    untouched: { command, gate: "commit", inputs: ["docs/**"], cache: false },
  });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), "base\n");
  if (ambiguous) {
    await writeFile(join(root, "src/two"), "another possible record\n");
    await writeFile(join(root, "src/lines.ts"), "another possible record\n");
  }
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "newline baseline"]);
  const branch = await git(root, ["branch", "--show-current"]);
  await git(root, ["checkout", "-b", "incoming"]);
  await writeFile(join(root, path), "incoming\n");
  await git(root, ["add", "--", path]);
  await git(root, ["commit", "-m", "incoming"]);
  await git(root, ["checkout", branch]);
  await writeFile(join(root, path), "ours\n");
  await git(root, ["add", "--", path]);
  await git(root, ["commit", "-m", "ours"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  await expect(git(root, ["merge", "--no-commit", "incoming"])).rejects.toMatchObject({ code: 1 });
  await writeFile(join(root, path), "ours\n");
  await git(root, ["add", "--", path]);
  await installDeclaredCommitHook(root);
  await expect(git(root, ["commit", "--no-edit"])).rejects.toMatchObject({ code: 1 });
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
  const failed = await runArc(["check", "pre-commit", "--json"], root);
  expect(failed.exitCode, failed.stdout + failed.stderr).toBe(1);
  const checks = JSON.parse(failed.stdout).result.checks;
  expect(checks).toMatchObject([
    { id: "project", outcome: "failed" }, { id: "files", outcome: "passed" },
    { id: "untouched", outcome: ambiguous ? "passed" : "not selected" },
  ]);
  expect(JSON.parse(checks[1].output).args).toEqual(ambiguous
    ? ["src/a.ts", "src/deleted.ts", "src/lines.ts", "src/two", path] : [path]);
  if (ambiguous) {
    await writeFile(join(root, "src/a.ts"), "authored resolution\n");
    await git(root, ["add", "src/a.ts"]);
    const retry = await runArc(["check", "run", "files", "--staged", "--json"], root);
    expect(retry.exitCode, retry.stdout + retry.stderr).toBe(0);
    expect(JSON.parse(JSON.parse(retry.stdout).result.checks[0].output).args)
      .toEqual(["src/a.ts", "src/deleted.ts", "src/lines.ts", "src/two", path]);
  }
  await writeFile(join(root, "receipt.json"), "check repaired\n");
  await git(root, ["commit", "--no-edit"]);
  expect((await git(root, ["rev-list", "--parents", "-n", "1", "HEAD"])).split(" ")).toHaveLength(3);
  expect(await git(root, ["rev-parse", "HEAD"])).not.toBe(head);
}, 60_000);

it("gates a modify/delete conflict kept deleted without passing missing files", async () => {
  const repairable = [process.execPath, "-e", "process.exit(require('node:fs').existsSync('receipt.json')?0:1)"];
  const root = await createDeclaredCheckRepository({
    project: { command: repairable, gate: "commit", inputs: ["src/a.ts"], cache: false },
    files: { command, gate: "commit", mode: "files", inputs: ["src/a.ts"], cache: false },
    untouched: { command: repairable, gate: "commit", inputs: ["docs/**"], cache: false },
  });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const branch = await git(root, ["branch", "--show-current"]);
  await git(root, ["checkout", "-b", "incoming"]);
  await writeFile(join(root, "src/a.ts"), "incoming modification\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "incoming"]);
  const parent = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["checkout", branch]);
  await git(root, ["rm", "src/a.ts"]);
  await git(root, ["commit", "-m", "delete"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  await expect(git(root, ["merge", "--no-commit", "incoming"])).rejects.toMatchObject({ code: 1 });
  await git(root, ["rm", "src/a.ts"]);
  expect(await readFile(join(root, ".git/MERGE_MSG"), "utf8")).toContain("#\tsrc/a.ts");
  for (const repaired of [false, true]) {
    if (repaired) await writeFile(join(root, "receipt.json"), "check repaired\n");
    const result = await runArc(["check", "pre-commit", "--json"], root);
    expect(result.exitCode, result.stdout + result.stderr).toBe(repaired ? 0 : 1);
    expect(JSON.parse(result.stdout).result).toMatchObject({ base: head, merged: [parent], checks: [
      { id: "project", outcome: repaired ? "passed" : "failed" },
      { id: "files", outcome: "not selected", reason: "no files to check" },
      { id: "untouched", outcome: "not selected", reason: "inputs unchanged" },
    ] });
  }
}, 60_000);

it("reruns a failed merge check with its historical conflicts and parents until repaired", async () => {
  const failing = [...command.slice(0, -1), `${command.at(-1)};process.exit(require('node:fs').existsSync('receipt.json')?0:1)`];
  const { root, head, parent } = await fixture(false, undefined, failing);
  await git(root, ["read-tree", "--reset", "-u", head]);
  const failed = await runArc(["check", "pre-commit", "--json"], root);
  expect(failed.exitCode, failed.stderr).toBe(1);
  const original = JSON.parse(failed.stdout).result;
  expect(original.checks[0]).toMatchObject({ outcome: "failed", remedy: "arc check run files --staged" });
  expect(JSON.parse(original.checks[0].output).args).toContain("src/a.ts");
  const retryArgs = [...original.checks[0].remedy.split(" ").slice(1), "--json"];
  for (const repaired of [false, true]) {
    if (repaired) await writeFile(join(root, "receipt.json"), "check repaired\n");
    const retry = await runArc(retryArgs, root);
    expect(retry.exitCode, retry.stdout + retry.stderr).toBe(repaired ? 0 : 1);
    const report = JSON.parse(retry.stdout).result;
    expect(report).toMatchObject({ base: head, tree: original.tree, merged: [parent],
      checks: [{ id: "files", outcome: repaired ? "passed" : "failed" }] });
    expect(JSON.parse(report.checks[0].output)).toEqual(JSON.parse(original.checks[0].output));
  }
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

it.each(["MERGE_HEAD", "MERGE_MSG"].flatMap(name => ["hook", "staged"].map(form => ({ name, form }))))(
  "refuses unreadable $name metadata for a $form request and retries successfully after repair", async ({ name, form }) => {
  const { root, head, parent } = await fixture();
  const args = form === "hook" ? ["check", "pre-commit", "--json"] : ["check", "run", "files", "--staged", "--json"];
  const path = await git(root, ["rev-parse", "--path-format=absolute", "--git-path", name]);
  const original = await readFile(path, "utf8");
  if (name === "MERGE_HEAD") await writeFile(path, "invalid parent\n");
  else await rm(path);
  const refused = await runArc(args, root);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(refused.stdout).toContain("Repair the checkout's merge metadata");
  expect(refused.stdout).toContain("retry git commit");
  await writeFile(path, original);
  const repaired = await runArc(args, root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result).toMatchObject({ base: head, merged: [parent] });
}, 60_000);
