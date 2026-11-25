/** Checked-tree and base metadata exported only to file checks. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";
const git = promisify(execFile);
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
const command = [process.execPath, "-e", "console.log(JSON.stringify({args:process.argv.slice(1),base:process.env.ARC_CHECK_BASE,tree:process.env.ARC_CHECK_TREE,merged:process.env.ARC_CHECK_MERGED}))"];
async function fixture(): Promise<string> {
  const root = await createDeclaredCheckRepository({
    files: { command, gate: "commit", mode: "files", inputs: ["src/**"] },
    project: { command, gate: "commit", inputs: ["src/**"] },
  });
  repositories.push(root);
  return root;
}
it.each([
  { scope: ["--staged"] }, { scope: ["--changed"] }, { scope: ["--range", "HEAD"] },
  { scope: ["--all"] }, { scope: ["--paths", "src/a.ts"] },
])("exports the exact base and checked tree for $scope without leaking ambient context", async ({ scope }) => {
  const root = await fixture();
  await git("git", ["add", "src/a.ts"], { cwd: root });
  await writeFile(join(root, "src/a.ts"), "worktree\n");
  const head = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const result = await runArc(["check", "gate", "commit", ...scope, "--json"], root,
    { env: { ARC_CHECK_BASE: "ambient-base", ARC_CHECK_TREE: "ambient-tree", ARC_CHECK_MERGED: "ambient-parent" } });
  expect(result.exitCode, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout).result;
  expect(JSON.parse(report.checks[0].output)).toMatchObject({ base: head, tree: report.tree });
  expect(JSON.parse(report.checks[0].output)).not.toHaveProperty("merged");
  expect(JSON.parse(report.checks[1].output)).toEqual({ args: [] });
});

it("exports only the merged-in parents on a range's first-parent line and none for all scope", async () => {
  const root = await fixture();
  await writeFile(join(root, "src/a.ts"), "base\n");
  await writeFile(join(root, ".arc/system/arc-config.yml"), "branch.base: base-branch\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "configuration"], { cwd: root });
  await git("git", ["branch", "base-branch"], { cwd: root });
  const branch = (await git("git", ["branch", "--show-current"], { cwd: root })).stdout.trim();
  const base = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await git("git", ["checkout", "-b", "topic-one"], { cwd: root });
  await writeFile(join(root, "src/side-one.ts"), "side one\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "side one"], { cwd: root });
  await git("git", ["checkout", "-b", "nested"], { cwd: root });
  await writeFile(join(root, "src/nested.ts"), "nested\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "nested"], { cwd: root });
  const nested = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await git("git", ["checkout", "topic-one"], { cwd: root });
  await git("git", ["merge", "--no-ff", "nested", "-m", "nested merge"], { cwd: root });
  const first = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await git("git", ["checkout", branch], { cwd: root });
  await git("git", ["merge", "--no-ff", "topic-one", "-m", "first merge"], { cwd: root });
  const own = await runArc(["check", "gate", "commit", "--range", "HEAD^1", "--force", "--json"], root);
  expect(own.exitCode, own.stderr).toBe(0);
  expect(JSON.parse(JSON.parse(own.stdout).result.checks[0].output)).toMatchObject({ base, merged: first });
  await git("git", ["checkout", "-b", "topic-two"], { cwd: root });
  await writeFile(join(root, "src/side-two.ts"), "side two\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "side two"], { cwd: root });
  const second = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await git("git", ["checkout", branch], { cwd: root });
  await git("git", ["merge", "--no-ff", "topic-two", "-m", "second merge"], { cwd: root });
  const range = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(range.exitCode, range.stderr).toBe(0);
  const context = JSON.parse(JSON.parse(range.stdout).result.checks[0].output);
  expect(context).toMatchObject({ base, merged: `${second} ${first}` });
  expect(context.merged).not.toContain(nested);
  const forecast = await runArc(["check", "gate", "commit", "--range", base, "--dry-run", "--json"], root);
  expect(forecast.exitCode, forecast.stderr).toBe(0);
  expect(JSON.parse(forecast.stdout).result).toMatchObject({ base,
    tree: JSON.parse(range.stdout).result.tree, merged: [second, first],
  });
  const all = await runArc(["check", "gate", "commit", "--all", "--force", "--json"], root);
  expect(all.exitCode, all.stderr).toBe(0);
  expect(JSON.parse(JSON.parse(all.stdout).result.checks[0].output)).not.toHaveProperty("merged");
});

it("exports the tree while omitting unavailable base and merged context", async () => {
  const root = await fixture();
  await writeFile(join(root, ".arc/system/arc-config.yml"), "branch.base: absent\n");
  const result = await runArc(["check", "gate", "commit", "--range", "--json"], root,
    { env: { ARC_CHECK_BASE: "ambient-base", ARC_CHECK_TREE: "ambient-tree", ARC_CHECK_MERGED: "ambient-parent" } });
  expect(result.exitCode, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout).result;
  const context = JSON.parse(report.checks[0].output);
  expect(context).toMatchObject({ tree: report.tree });
  expect(context).not.toHaveProperty("base");
  expect(context).not.toHaveProperty("merged");
  expect(JSON.parse(report.checks[1].output)).toEqual({ args: [] });
});
