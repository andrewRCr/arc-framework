/** A file check on a range leaves unchecked the files a merge on that range brought in unchanged, and names them. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";
import { runArc } from "./helpers.js";
const exec = promisify(execFile);
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
async function git(root: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd: root, env: environmentForGitCwd(root) })).stdout.trim();
}
async function commit(root: string, files: Record<string, string>, message: string): Promise<void> {
  for (const [path, content] of Object.entries(files)) await writeFile(join(root, path), content);
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", message]);
}

it("leaves the files a merge brought in unchanged out of a range's file check", async () => {
  const root = await createDeclaredCheckRepository({
    files: { command: [process.execPath, "-e", "console.log(process.argv.slice(1).join(' ')); process.exit(1)"],
      gate: "commit", mode: "files", inputs: ["src/**"] },
  });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["branch", "--show-current"]);
  await git(root, ["checkout", "-b", "incoming"]);
  await commit(root, { "src/incoming.ts": "incoming\n", "src/both.ts": "incoming\n" }, "incoming");
  await git(root, ["checkout", branch]);
  await commit(root, { "src/a.ts": "own\n" }, "own");
  await git(root, ["merge", "--no-ff", "incoming", "-m", "merge incoming"]);
  // docs/b.md is outside every check's inputs, so the request widens and the file check examines every source file.
  await commit(root, { "src/both.ts": "own after merge\n", "docs/b.md": "changed\n" }, "after merge");

  const json = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(json.exitCode, json.stderr).toBe(1);
  const [check] = JSON.parse(json.stdout).result.checks;
  expect(check.output).toContain("src/deleted.ts");
  expect(check.output).toContain("src/both.ts");
  expect(check.output).not.toContain("src/incoming.ts");
  expect(check).toMatchObject({ id: "files", outcome: "failed", mergedIn: ["src/incoming.ts"] });

  const human = await runArc(["check", "gate", "commit", "--range", base, "--force"], root);
  expect(human.exitCode, human.stderr).toBe(1);
  expect(human.stdout.split(/\r?\n/u)).toContain("Not checked, merged in unchanged: 1 file");
});

it("runs no file check when every file the range changed came in unchanged through a merge", async () => {
  const root = await createDeclaredCheckRepository({
    files: { command: [process.execPath, "-e", "process.exit(1)"], gate: "commit", mode: "files", inputs: ["src/**"] },
  });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["branch", "--show-current"]);
  await git(root, ["checkout", "-b", "incoming"]);
  await commit(root, { "src/incoming.ts": "incoming\n" }, "incoming");
  await git(root, ["checkout", branch]);
  await git(root, ["merge", "--no-ff", "incoming", "-m", "merge incoming"]);

  const json = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(json.exitCode, json.stderr).toBe(0);
  expect(JSON.parse(json.stdout).result.checks[0]).toMatchObject({ id: "files", outcome: "not selected",
    reason: "every changed file was merged in unchanged", mergedIn: ["src/incoming.ts"] });

  const human = await runArc(["check", "gate", "commit", "--range", base, "--force"], root);
  expect(human.exitCode, human.stderr).toBe(0);
  expect(human.stdout).toContain("files: not selected [enforcement] (every changed file was merged in unchanged)");
  expect(human.stdout.split(/\r?\n/u)).toContain("Not checked, merged in unchanged: 1 file");
});

it("leaves every file in when the checked range carries no merge", async () => {
  const root = await createDeclaredCheckRepository({
    files: { command: [process.execPath, "-e", "process.exit(1)"], gate: "commit", mode: "files", inputs: ["src/**"] },
  });
  repositories.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await commit(root, {}, "own");

  const result = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks[0]).not.toHaveProperty("mergedIn");
});
