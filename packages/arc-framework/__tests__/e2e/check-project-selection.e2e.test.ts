/** Repository declarations keep archived planning edits out of code checks. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
