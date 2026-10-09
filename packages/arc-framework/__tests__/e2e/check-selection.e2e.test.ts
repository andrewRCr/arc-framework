/** Gate selection, widening, and existing file sets through the built CLI. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";
const git = promisify(execFile);
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
const checks = {
  files: { command: [process.execPath, "capture.cjs"], gate: "commit", mode: "files", inputs: ["src/**"] },
  narrow: { command: [process.execPath, "-e", "process.exit(13)"], gate: "commit", inputs: ["src/**"], widen: false },
  coverage: { command: [process.execPath, "-e", ""], inputs: ["docs/**", ".arc/system/arc-checks.yml"] },
};
it.each(["global", "declaration", "uncovered", "unresolved"] as const)("widens a %s change to all matching files while respecting opt-out", async cause => {
  const root = await createDeclaredCheckRepository(checks, cause === "global" ? { global_inputs: ["docs/**"] } : {});
  repositories.push(root);
  await writeFile(join(root, "src/a.ts"), "base\n");
  let scope = ["--changed"];
  if (cause === "global") await writeFile(join(root, "docs/b.md"), "global change\n");
  if (cause === "uncovered") await writeFile(join(root, "uncovered.txt"), "change\n");
  if (cause === "declaration") await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks, commit_fixes: "fail" }));
  if (cause === "unresolved") {
    await writeFile(join(root, ".arc/system/arc-config.yml"), "branch.base: absent\n");
    await git("git", ["add", "-A"], { cwd: root });
    await git("git", ["commit", "-m", "configuration"], { cwd: root });
    scope = ["--range"];
  }
  const result = await runArc(["check", "gate", "commit", ...scope, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "files", outcome: "passed" }, { id: "narrow", outcome: "not selected" },
  ]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ args: ["src/a.ts", "src/deleted.ts"] });
});

it("reports a CI-only exclusion and runs the same check when CI is explicit", async () => {
  const root = await createDeclaredCheckRepository({ ci: {
    command: [process.execPath, "capture.cjs"], gate: "commit", inputs: ["src/**"], ci_only: true,
  } });
  repositories.push(root);
  const excluded = await runArc(["check", "gate", "commit", "--json"], root);
  expect(excluded.exitCode, excluded.stderr).toBe(0);
  expect(JSON.parse(excluded.stdout).result.checks).toMatchObject([{ id: "ci", outcome: "not selected", reason: "CI-only check requires --ci" }]);
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const included = await runArc(["check", "gate", "commit", "--ci", "--json"], root);
  expect(included.exitCode, included.stderr).toBe(0);
  expect(JSON.parse(included.stdout).result.checks).toMatchObject([{ id: "ci", outcome: "passed" }]);
});

it("runs named checks independently of gate and widening and runs unchanged project inputs", async () => {
  const root = await createDeclaredCheckRepository({
    named: { command: [process.execPath, "capture.cjs"], inputs: ["src/**"], ci_only: true },
    other: { command: [process.execPath, "-e", "process.exit(13)"], gate: "commit", inputs: ["src/**"] },
  }, { global_inputs: ["docs/**"] });
  repositories.push(root);
  await writeFile(join(root, "src/a.ts"), "base\n");
  await writeFile(join(root, "docs/b.md"), "global change\n");
  const result = await runArc(["check", "run", "named", "--changed", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "named", outcome: "passed" }]);
  expect(JSON.parse(result.stdout).result.checks).toHaveLength(1);
});

it("keeps ignored changes unselected and runs opt-out checks when their own inputs change", async () => {
  const root = await createDeclaredCheckRepository({
    narrow: { ...checks.files, widen: false },
    wide: { ...checks.files, inputs: ["docs/**"] },
  });
  repositories.push(root);
  await writeFile(join(root, "src/a.ts"), "base\n");
  await writeFile(join(root, "receipt.json"), "ignored\n");
  const ignored = await runArc(["check", "gate", "commit", "--json"], root);
  expect(ignored.exitCode, ignored.stderr).toBe(0);
  expect(JSON.parse(ignored.stdout).result.checks).toMatchObject([
    { id: "narrow", outcome: "not selected", reason: "inputs unchanged" }, { id: "wide", outcome: "not selected" },
  ]);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("ignored\n");
  await writeFile(join(root, "src/a.ts"), "own change\n");
  const own = await runArc(["check", "gate", "commit", "--json"], root);
  expect(own.exitCode, own.stderr).toBe(0);
  expect(JSON.parse(own.stdout).result.checks).toMatchObject([{ id: "narrow", outcome: "passed" }, { id: "wide", outcome: "not selected" }]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ args: ["src/a.ts"] });
});

it("selects a project on deletion and widens on an uncovered deletion without passing missing paths", async () => {
  const root = await createDeclaredCheckRepository({
    project: { command: [process.execPath, "capture.cjs"], gate: "commit", inputs: ["src/deleted.ts"] },
    files: { ...checks.files, inputs: ["src/deleted.ts"] },
    wide: { ...checks.files, inputs: ["src/a.ts"] },
  });
  repositories.push(root);
  await writeFile(join(root, "src/a.ts"), "base\n");
  await rm(join(root, "src/deleted.ts"));
  const result = await runArc(["check", "gate", "commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "project", outcome: "passed" }, { id: "files", outcome: "not selected", reason: "no files to check" },
    { id: "wide", outcome: "not selected" },
  ]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ args: [] });
  await rm(join(root, "docs/b.md"));
  const widened = await runArc(["check", "gate", "commit", "--json", "--force"], root);
  expect(widened.exitCode, widened.stderr).toBe(0);
  expect(JSON.parse(widened.stdout).result.checks).toMatchObject([
    { id: "project", outcome: "passed" }, { id: "files", outcome: "not selected", reason: "no files to check" },
    { id: "wide", outcome: "passed" },
  ]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ args: ["src/a.ts"] });
});

it("selects named paths by Git inputs and widens a named global path", async () => {
  const root = await createDeclaredCheckRepository({
    project: { command: [process.execPath, "capture.cjs"], gate: "commit", inputs: ["src/**"] },
    coverage: checks.coverage,
  });
  repositories.push(root);
  const outside = await runArc(["check", "gate", "commit", "--paths", "docs/b.md", "--json"], root);
  expect(outside.exitCode, outside.stderr).toBe(0);
  expect(JSON.parse(outside.stdout).result.checks).toMatchObject([{ id: "project", outcome: "not selected", reason: "inputs unchanged" }]);
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const declaration = join(root, ".arc/system/arc-checks.yml");
  const value = JSON.parse(await readFile(declaration, "utf8"));
  await writeFile(declaration, JSON.stringify({ ...value, global_inputs: ["docs/**"] }));
  const global = await runArc(["check", "gate", "commit", "--paths", "docs/b.md", "--json"], root);
  expect(global.exitCode, global.stderr).toBe(0);
  expect(JSON.parse(global.stdout).result.checks).toMatchObject([{ id: "project", outcome: "passed" }]);
});
