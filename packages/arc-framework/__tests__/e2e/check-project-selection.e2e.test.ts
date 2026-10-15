/** Repository declarations keep archived planning edits out of code checks. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const git = promisify(execFile);
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it.each(["increment", "segment"] as const)("selects only Markdown checks for an archived planning edit in %s", async form => {
  const root = await createDeclaredCheckRepository({});
  repositories.push(root);
  await git("git", ["restore", "src/a.ts"], { cwd: root });
  const declaration = await readFile(resolve(import.meta.dirname, "../../../../.arc/system/arc-checks.yml"), "utf8");
  await writeFile(join(root, ".arc/system/arc-checks.yml"), declaration);
  await mkdir(join(root, ".arc/completed/archive"), { recursive: true });
  const notes = join(root, ".arc/completed/archive/notes.md");
  await writeFile(notes, "# Archived notes\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "planning baseline"], { cwd: root });
  await writeFile(notes, "# Revised archived notes\n");
  const result = await runArc(["check", form, "--dry-run", "--json"], root);
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const checks: Array<{ id: string; outcome: string }> = JSON.parse(result.stdout).result.checks;
  expect(checks.filter(check => check.outcome !== "not selected").map(check => check.id))
    .toEqual(form === "increment" ? ["lint:md:staged"] : ["lint:md:staged", "lint:md"]);
}, 60_000);


it("selects the local E2E tier for a declaration-only change", async () => {
  const root = await createDeclaredCheckRepository({});
  repositories.push(root);
  await git("git", ["restore", "src/a.ts"], { cwd: root });
  const path = ".arc/system/arc-checks.yml";
  const declaration = await readFile(resolve(import.meta.dirname, "../../../../.arc/system/arc-checks.yml"), "utf8");
  await writeFile(join(root, path), declaration);
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "project declaration baseline"], { cwd: root });
  await writeFile(join(root, path), `${declaration}\n# Declaration-only change\n`);
  expect((await git("git", ["diff", "--name-only"], { cwd: root })).stdout.trim()).toBe(path);

  const result = await runArc(["check", "run", "test:e2e:local", "--changed", "--dry-run", "--json"], root);
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const checks = JSON.parse(result.stdout).result.checks;
  expect(checks).toMatchObject([{ id: "test:e2e:local", outcome: "would run" }]);
  expect(checks).toHaveLength(1);
  expect(checks[0].batches.flat()).toContain(path);
}, 60_000);

it.each([
  { change: "shipped workflow prose", path: "packages/arc-framework/arc/system/workflows/arc/example.md",
    outcome: "would run" },
  { change: "the installed project rules", path: ".arc/system/rules/DEV-RULES.PROJECT.md", outcome: "would run" },
  { change: "a backlog planning artifact", path: ".arc/backlog/planned/example/draft-example.md",
    outcome: "not selected" },
  { change: "personal notes", path: ".arc/user/someone/notes.md", outcome: "not selected" },
  { change: "source code", path: "src/a.ts", outcome: "not selected" },
])("selects the content integration tier for $change: $outcome", async ({ path, outcome }) => {
  const root = await createDeclaredCheckRepository({});
  repositories.push(root);
  await git("git", ["restore", "src/a.ts"], { cwd: root });
  const declaration = await readFile(resolve(import.meta.dirname, "../../../../.arc/system/arc-checks.yml"), "utf8");
  await writeFile(join(root, ".arc/system/arc-checks.yml"), declaration);
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), "base\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "content baseline"], { cwd: root });
  await writeFile(join(root, path), "changed\n");

  const result = await runArc(["check", "run", "test:integration:content", "--changed", "--dry-run", "--json"], root);
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "test:integration:content", outcome }]);
}, 60_000);
