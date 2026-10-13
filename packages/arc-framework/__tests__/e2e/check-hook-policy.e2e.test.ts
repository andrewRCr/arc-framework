/** Commit-only skip policy and partial staging through the built CLI. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";
import { runArc } from "./helpers.js";
const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });
const command = [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json', 'run\\n')"];
async function fixture(mode = "project"): Promise<string> {
  const root = await createDeclaredCheckRepository({ content: { command, gate: "commit", mode, inputs: ["src/**"] } });
  roots.push(root);
  await exec("git", ["add", "src/a.ts"], { cwd: root, env: environmentForGitCwd(root) });
  return root;
}
async function records(root: string): Promise<string[]> {
  return (await readdir(join(root, ".git/arc-checks")).catch(() => []))
    .filter(name => /^[0-9a-f]{64}\.json$/u.test(name)).sort();
}
it("skips a named hook check without recording and overrides a reusable pass", async () => {
  const root = await fixture();
  const request = ["check", "pre-commit", "--json"];
  const skipped = await runArc(request, root, { env: { ARC_SKIP: "content" } });
  expect(skipped.exitCode, skipped.stderr).toBe(0);
  expect(JSON.parse(skipped.stdout).result.checks).toMatchObject([{ id: "content", outcome: "skipped" }]);
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await records(root)).toEqual([]);
  const normal = await runArc(request, root);
  expect(normal.exitCode, normal.stderr).toBe(0);
  expect(JSON.parse(normal.stdout).result.checks).toMatchObject([{ id: "content", outcome: "passed" }]);
  const passes = await records(root);
  expect(passes).toHaveLength(1);
  const reusable = await runArc(request, root);
  expect(JSON.parse(reusable.stdout).result.checks).toMatchObject([{ outcome: "reused" }]);
  const skippedAgain = await runArc(request, root, { env: { ARC_SKIP: "content" } });
  expect(JSON.parse(skippedAgain.stdout).result.checks).toMatchObject([{ outcome: "skipped" }]);
  expect(await records(root)).toEqual(passes);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\n");
}, 60_000);

it.each(["project", "files"])("refuses partially staged %s inputs and resumes after whole-file staging or a named skip", async mode => {
  const root = await fixture(mode);
  await writeFile(join(root, "src/a.ts"), "changed\nunstaged hunk\n");
  const request = ["check", "pre-commit", "--json"];
  const refused = await runArc(request, root);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(refused.stdout).toContain("src/a.ts");
  expect(refused.stdout).toMatch(/Stage.*whole/u);
  expect(refused.stdout).toContain("ARC_SKIP=content");
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await records(root)).toEqual([]);
  await exec("git", ["add", "src/a.ts"], { cwd: root, env: environmentForGitCwd(root) });
  const staged = await runArc(request, root);
  expect(staged.exitCode, staged.stderr).toBe(0);
  expect(JSON.parse(staged.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  const passes = await records(root);
  await writeFile(join(root, "src/a.ts"), "changed\nunstaged hunk\nsecond unstaged hunk\n");
  const skipped = await runArc(request, root, { env: { ARC_SKIP: "content" } });
  expect(skipped.exitCode, skipped.stderr).toBe(0);
  expect(JSON.parse(skipped.stdout).result.checks).toMatchObject([{ outcome: "skipped" }]);
  expect(await records(root)).toEqual(passes);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\n");
}, 60_000);

it.each([false, true])("reports unknown skip IDs without excluding checks, json=%s", async json => {
  const root = await fixture();
  const result = await runArc(["check", "pre-commit", ...(json ? ["--json"] : [])], root,
    { env: { ARC_SKIP: "id-not-declared,id-not-declared" } });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain("id-not-declared");
  if (json) expect(JSON.parse(result.stdout).result).toMatchObject({ ignoredSkips: ["id-not-declared"], checks: [{ outcome: "passed" }] });
  else {
    expect(result.stdout).toContain("ignored");
    expect(result.stdout).toContain("content: passed");
  }
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\n");
}, 60_000);

it.each([
  ["increment"], ["segment"], ["gate", "commit"], ["gate", "push"], ["gate", "merge"],
  ["new-head", "--from", "HEAD"], ["run", "content"],
])("ignores ambient skips for the ordinary request %s", async (...form) => {
  const root = await fixture();
  const result = await runArc(["check", ...form, "--json", "--force"], root, { env: { ARC_SKIP: "content,unknown" } });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "content", outcome: "passed" }]);
  expect(JSON.parse(result.stdout).result).not.toHaveProperty("ignoredSkips");
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\n");
}, 60_000);

it("permits other unstaged and untracked inputs while keeping the run unrecorded", async () => {
  const root = await fixture();
  await writeFile(join(root, "src/deleted.ts"), "other unstaged input\n");
  await writeFile(join(root, "src/untracked.ts"), "untracked input\n");
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: "passed",
    divergent: ["src/deleted.ts", "src/untracked.ts"] }]);
  expect(await records(root)).toEqual([]);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\n");
}, 60_000);

it("does not refuse partial inputs belonging only to a check excluded by CI policy", async () => {
  const root = await createDeclaredCheckRepository({
    content: { command, gate: "commit", inputs: ["src/**"] },
    ci: { command, gate: "commit", inputs: ["docs/**"], ci_only: true },
  });
  roots.push(root);
  await writeFile(join(root, "docs/b.md"), "staged documentation\n");
  await exec("git", ["add", "src/a.ts", "docs/b.md"], { cwd: root, env: environmentForGitCwd(root) });
  await writeFile(join(root, "docs/b.md"), "staged documentation\nunstaged hunk\n");
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "content", outcome: "passed" }, { id: "ci", outcome: "not selected", reason: "CI-only check requires --ci" },
  ]);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\n");
}, 60_000);
