/** Reuse never vouches for worktree content differing from a staged request. */
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
const command = [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','run\\n')"];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it.each([
  { scope: "staged", mode: "project" }, { scope: "staged", mode: "files" },
  { scope: "hook", mode: "project" }, { scope: "hook", mode: "files" },
])("runs and labels differing worktree inputs without reusing or recording, $scope $mode", async ({ scope, mode }) => {
  const root = await createDeclaredCheckRepository({ check: { command, gate: "commit", mode, inputs: ["src/**"] } });
  repositories.push(root);
  await git("git", ["add", "src/a.ts"], { cwd: root });
  const request = scope === "hook" ? ["check", "pre-commit", "--json"] : ["check", "run", "check", "--staged", "--json"];
  const before = await runArc(request, root);
  expect(before.exitCode, before.stderr).toBe(0);
  expect(JSON.parse(before.stdout).result.checks[0].outcome).toBe("passed");
  const records = await readdir(join(root, ".git/arc-checks"));
  await writeFile(join(root, "src/a.ts"), "unstaged input\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runArc(request, root);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "passed", divergent: ["src/a.ts"] });
  }
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\nrun\nrun\n");
  expect(await readdir(join(root, ".git/arc-checks"))).toEqual(records);
  await writeFile(join(root, "src/a.ts"), "changed\n");
  const restored = await runArc(request, root);
  expect(JSON.parse(restored.stdout).result.checks[0].outcome).toBe("reused");
});

it("records a pass when worktree differences lie outside its input pathspecs", async () => {
  const root = await createDeclaredCheckRepository({ check: { command, mode: "project", inputs: ["src/**", "!src/excluded.ts"] } });
  repositories.push(root);
  await git("git", ["add", "src/a.ts"], { cwd: root });
  await writeFile(join(root, "docs/b.md"), "outside the input set\n");
  await writeFile(join(root, "src/excluded.ts"), "excluded from the input set\n");
  const request = ["check", "run", "check", "--staged", "--json"];
  const first = await runArc(request, root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks[0].divergent).toBeUndefined();
  const second = await runArc(request, root);
  expect(JSON.parse(second.stdout).result.checks[0].outcome).toBe("reused");
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\n");
});

it("ignores excluded worktree files in the divergence comparison", async () => {
  const root = await createDeclaredCheckRepository({ check: { command, mode: "files", inputs: ["src/**"] } });
  repositories.push(root);
  await git("git", ["add", "src/a.ts"], { cwd: root });
  await writeFile(join(root, ".git/info/exclude"), "src/ignored.ts\n");
  await writeFile(join(root, "src/ignored.ts"), "ignored content\n");
  const request = ["check", "run", "check", "--staged", "--json"];
  const first = await runArc(request, root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks[0].divergent).toBeUndefined();
  const second = await runArc(request, root);
  expect(JSON.parse(second.stdout).result.checks[0].outcome).toBe("reused");
});
