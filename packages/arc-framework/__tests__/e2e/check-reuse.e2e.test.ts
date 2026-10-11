/** Complete declared dependencies determine pass reuse through the built CLI. */
import { afterEach, expect, it } from "vitest";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";
const repositories: string[] = [];
const git = promisify(execFile);
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
const command = [process.execPath, "-e", "console.log('checked')"];
it("reruns a project check when a declared global input changes", async () => {
  const root = await createDeclaredCheckRepository({ project: { command, gate: "commit", inputs: ["src/**"] } },
    { global_inputs: ["docs/**"] });
  repositories.push(root);
  const first = await runArc(["check", "increment", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks).toMatchObject([{ id: "project", outcome: "passed" }]);
  const repeated = await runArc(["check", "increment", "--json"], root);
  expect(repeated.exitCode, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).result.checks).toMatchObject([{ id: "project", outcome: "reused" }]);
  await writeFile(join(root, "docs/b.md"), "changed global input\n");
  const changed = await runArc(["check", "increment", "--json"], root);
  expect(changed.exitCode, changed.stderr).toBe(0);
  expect(JSON.parse(changed.stdout).result.checks).toMatchObject([{ id: "project", outcome: "passed" }]);
});

it("keys received files by base content and reuses across unrelated base and tree movement", async () => {
  const root = await createDeclaredCheckRepository({ files: { command, mode: "files", inputs: ["src/a.ts"] } });
  repositories.push(root);
  const original = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await writeFile(join(root, "src/a.ts"), "different base\n");
  await git("git", ["add", "src/a.ts"], { cwd: root });
  await git("git", ["commit", "-m", "different base"], { cwd: root });
  const base = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await writeFile(join(root, "src/a.ts"), "changed\n");
  const first = await runArc(["check", "run", "files", "--range", original, "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  const different = await runArc(["check", "run", "files", "--range", base, "--json"], root);
  expect(different.exitCode, different.stderr).toBe(0);
  expect(JSON.parse(different.stdout).result.tree).toBe(JSON.parse(first.stdout).result.tree);
  expect(JSON.parse(different.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  const repeated = await runArc(["check", "run", "files", "--range", base, "--json"], root);
  expect(repeated.exitCode, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).result.checks).toMatchObject([{ outcome: "reused" }]);
  await writeFile(join(root, "docs/b.md"), "unrelated\n");
  await git("git", ["add", "docs/b.md"], { cwd: root });
  await git("git", ["commit", "-m", "unrelated"], { cwd: root });
  const moved = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const reusable = await runArc(["check", "run", "files", "--range", moved, "--json"], root);
  expect(reusable.exitCode, reusable.stderr).toBe(0);
  expect(JSON.parse(reusable.stdout).result.tree).not.toBe(JSON.parse(repeated.stdout).result.tree);
  expect(JSON.parse(reusable.stdout).result.checks).toMatchObject([{ outcome: "reused" }]);
});

it("keys merged-in content without keying unrelated parent identities", async () => {
  const root = await createDeclaredCheckRepository({ files: { command, mode: "files", inputs: ["src/a.ts"] } });
  repositories.push(root);
  const base = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const branch = (await git("git", ["branch", "--show-current"], { cwd: root })).stdout.trim();
  for (const [side, content] of [["one", "one\n"], ["two", "two\n"], ["unrelated", "two\n"]]) {
    await git("git", ["checkout", "-B", side!, base], { cwd: root });
    await writeFile(join(root, "src/a.ts"), content!);
    if (side === "unrelated") await writeFile(join(root, "docs/b.md"), "different parent\n");
    await git("git", ["add", "-A"], { cwd: root });
    await git("git", ["commit", "-m", side!], { cwd: root });
  }
  const results: Array<{ tree: string; merged: string[]; checks: Array<{ outcome: string }> }> = [];
  for (const side of ["one", "two", "unrelated"]) {
    await git("git", ["checkout", "-B", branch, base], { cwd: root });
    await git("git", ["merge", "--no-ff", "-m", `merge ${side}`, side], { cwd: root });
    await writeFile(join(root, "src/a.ts"), "final\n");
    const result = await runArc(["check", "run", "files", "--range", base, "--json"], root);
    expect(result.exitCode, result.stderr).toBe(0);
    results.push(JSON.parse(result.stdout).result);
    await writeFile(join(root, "src/a.ts"), side === "one" ? "one\n" : "two\n");
  }
  expect(results[1]!.tree).toBe(results[0]!.tree);
  expect(results[1]!.merged).not.toEqual(results[0]!.merged);
  expect(results.map(result => result.checks[0]!.outcome)).toEqual(["passed", "passed", "reused"]);
});

it("keys each resolved check entry while treating matching declaration bytes as ordinary inputs", async () => {
  const checks = { first: { command, inputs: ["src/**"] }, second: { command, inputs: ["src/**"] }, whole: { command } };
  const root = await createDeclaredCheckRepository(checks);
  repositories.push(root);
  const first = await runArc(["check", "run", "first", "second", "whole", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks.map((check: { outcome: string }) => check.outcome)).toEqual(["passed", "passed", "passed"]);
  checks.first.command = [process.execPath, "-e", "console.log('different')"];
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks }));
  const changed = await runArc(["check", "run", "first", "second", "whole", "--json"], root);
  expect(changed.exitCode, changed.stderr).toBe(0);
  expect(JSON.parse(changed.stdout).result.checks).toMatchObject([
    { id: "first", outcome: "passed" }, { id: "second", outcome: "reused" }, { id: "whole", outcome: "passed" },
  ]);
});

it("excludes ambient environment variables but keys explicitly declared environment fingerprints", async () => {
  const root = await createDeclaredCheckRepository({
    ambient: { command, inputs: ["src/**"] },
    fingerprint: { command, inputs: ["src/**"], runtime_inputs: [[process.execPath, "-e", "process.stdout.write(process.env.ARC_REUSE_TEST_VALUE)"]] },
  });
  repositories.push(root);
  const first = await runArc(["check", "run", "ambient", "fingerprint", "--json"], root, { env: { ARC_REUSE_TEST_VALUE: "one" } });
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks).toMatchObject([{ outcome: "passed" }, { outcome: "passed" }]);
  const changed = await runArc(["check", "run", "ambient", "fingerprint", "--json"], root, { env: { ARC_REUSE_TEST_VALUE: "two" } });
  expect(changed.exitCode, changed.stderr).toBe(0);
  expect(JSON.parse(changed.stdout).result.checks).toMatchObject([
    { id: "ambient", outcome: "reused" }, { id: "fingerprint", outcome: "passed" },
  ]);
});

it("runs runtime fingerprints from the declared root with literal arguments", async () => {
  const literal = "literal;$(printf shell-expansion)";
  const script = "const fs=require('node:fs');fs.writeFileSync('receipt.json',JSON.stringify({cwd:process.cwd(),argument:process.argv[1]}));process.stdout.write(fs.readFileSync('b.md'))";
  const root = await createDeclaredCheckRepository({ project: {
    command, inputs: ["src/**"], root: "docs", runtime_inputs: [[process.execPath, "-e", script, literal]],
  } });
  repositories.push(root);
  const first = await runArc(["check", "run", "project", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  const observation = await readFile(join(root, "docs/receipt.json"), "utf8").catch(() => "null");
  expect(JSON.parse(observation)).toEqual({ cwd: join(root, "docs"), argument: literal });
  const repeated = await runArc(["check", "run", "project", "--json"], root);
  expect(repeated.exitCode, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).result.checks).toMatchObject([{ outcome: "reused" }]);
});

it.each([
  { runtime: [["arc-runtime-program-does-not-exist"]], cache: true },
  { runtime: [[process.execPath, "-e", "process.exit(19)"]], cache: true },
  { runtime: [], cache: false },
])("runs without recording when runtime=$runtime and cache=$cache", async ({ runtime, cache }) => {
  const root = await createDeclaredCheckRepository({ project: { command, inputs: ["src/**"], runtime_inputs: runtime, cache } });
  repositories.push(root);
  for (let repeat = 0; repeat < 2; repeat++) {
    const result = await runArc(["check", "run", "project", "--json"], root);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  }
  const records = await readdir(join(root, ".git/arc-checks")).catch(() => []);
  expect(records.filter(name => /^[0-9a-f]{64}\.json$/u.test(name))).toEqual([]);
});

it.each(["global", "check"] as const)("reruns when %s runtime output changes", async level => {
  const runtime = [[process.execPath, "-e", "process.stdout.write(require('node:fs').readFileSync('docs/b.md'))"]];
  const root = await createDeclaredCheckRepository({ project: { command, inputs: ["src/**"],
    ...(level === "check" ? { runtime_inputs: runtime } : {}),
  } }, level === "global" ? { global_runtime_inputs: runtime } : {});
  repositories.push(root);
  const first = await runArc(["check", "run", "project", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks).toMatchObject([{ id: "project", outcome: "passed" }]);
  const repeated = await runArc(["check", "run", "project", "--json"], root);
  expect(repeated.exitCode, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).result.checks).toMatchObject([{ id: "project", outcome: "reused" }]);
  await writeFile(join(root, "docs/b.md"), "changed runtime output\n");
  const changed = await runArc(["check", "run", "project", "--json"], root);
  expect(changed.exitCode, changed.stderr).toBe(0);
  expect(JSON.parse(changed.stdout).result.checks).toMatchObject([{ id: "project", outcome: "passed" }]);
});
