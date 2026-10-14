/** A file check on a range leaves unchecked the files a base merge on that range brought in unchanged, and names them. */
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

/** Track `origin/main` as main's upstream, the remote tip a range's merged-in parents must already be on. */
async function trackRemoteBase(root: string): Promise<void> {
  await git(root, ["remote", "add", "origin", join(root, ".missing-origin")]);
  await git(root, ["config", "branch.main.remote", "origin"]);
  await git(root, ["config", "branch.main.merge", "refs/heads/main"]);
  await publishBase(root, "main");
}
async function publishBase(root: string, revision: string): Promise<void> {
  await git(root, ["update-ref", "refs/remotes/origin/main", await git(root, ["rev-parse", revision])]);
}
const echoAndFail = [process.execPath, "-e", "console.log(process.argv.slice(1).join(' ')); process.exit(1)"];

it("leaves the files a base merge brought in unchanged out of a range's file check", async () => {
  const root = await createDeclaredCheckRepository({ files: { command: echoAndFail, gate: "commit", mode: "files", inputs: ["src/**"] } });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await trackRemoteBase(root);
  await git(root, ["checkout", "-b", "feature"]);
  await commit(root, { "src/a.ts": "own\n" }, "own");
  await git(root, ["checkout", "main"]);
  await commit(root, { "src/incoming.ts": "incoming\n", "src/both.ts": "incoming\n" }, "incoming");
  await publishBase(root, "main");
  await git(root, ["checkout", "feature"]);
  await git(root, ["merge", "--no-ff", "main", "-m", "merge base"]);
  // docs/b.md is outside every check's inputs, so the request widens and the file check examines every source file.
  await commit(root, { "src/both.ts": "own after merge\n", "docs/b.md": "changed\n" }, "after merge");

  const json = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(json.exitCode, json.stderr).toBe(1);
  const [check] = JSON.parse(json.stdout).result.checks;
  expect(check.output).toContain("src/deleted.ts");
  expect(check.output).toContain("src/a.ts");
  expect(check.output).toContain("src/both.ts");
  expect(check.output).not.toContain("src/incoming.ts");
  expect(check).toMatchObject({ id: "files", outcome: "failed", mergedIn: ["src/incoming.ts"] });

  const human = await runArc(["check", "gate", "commit", "--range", base, "--force"], root);
  expect(human.exitCode, human.stderr).toBe(1);
  expect(human.stdout.split(/\r?\n/u)).toContain("Not checked, merged in unchanged: 1 file");
});

it("runs no file check when every file the range changed came in unchanged through a base merge", async () => {
  const root = await createDeclaredCheckRepository({
    files: { command: [process.execPath, "-e", "process.exit(1)"], gate: "commit", mode: "files", inputs: ["src/**"] },
  });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await trackRemoteBase(root);
  await git(root, ["checkout", "-b", "feature"]);
  await git(root, ["checkout", "main"]);
  await commit(root, { "src/incoming.ts": "incoming\n" }, "incoming");
  await publishBase(root, "main");
  await git(root, ["checkout", "feature"]);
  await git(root, ["merge", "--no-ff", "main", "-m", "merge base"]);

  const json = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(json.exitCode, json.stderr).toBe(0);
  expect(JSON.parse(json.stdout).result.checks[0]).toMatchObject({ id: "files", outcome: "not selected",
    reason: "every changed file was merged in unchanged", mergedIn: ["src/incoming.ts"] });

  const human = await runArc(["check", "gate", "commit", "--range", base, "--force"], root);
  expect(human.exitCode, human.stderr).toBe(0);
  expect(human.stdout).toContain("files: not selected [enforcement] (every changed file was merged in unchanged)");
  expect(human.stdout.split(/\r?\n/u)).toContain("Not checked, merged in unchanged: 1 file");
});

it("checks the files a merge brought in that the remote base branch does not carry", async () => {
  const root = await createDeclaredCheckRepository({ files: { command: echoAndFail, gate: "commit", mode: "files", inputs: ["src/**"] } });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await trackRemoteBase(root);
  await git(root, ["checkout", "-b", "feature"]);
  await git(root, ["checkout", "-b", "topic"]);
  await commit(root, { "src/topic.ts": "topic\n" }, "topic");
  await git(root, ["checkout", "main"]);
  await commit(root, { "src/unpublished.ts": "unpublished\n" }, "unpublished");
  await git(root, ["checkout", "feature"]);
  await git(root, ["merge", "--no-ff", "topic", "-m", "merge topic"]);
  await git(root, ["merge", "--no-ff", "main", "-m", "merge local base"]);

  const json = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(json.exitCode, json.stderr).toBe(1);
  const [check] = JSON.parse(json.stdout).result.checks;
  expect(check.output).toContain("src/topic.ts");
  expect(check.output).toContain("src/unpublished.ts");
  expect(check).not.toHaveProperty("mergedIn");
});

it("checks a file the range changed itself, though the base it merged back already carries it", async () => {
  const root = await createDeclaredCheckRepository({ files: { command: echoAndFail, gate: "commit", mode: "files", inputs: ["src/**"] } });
  repositories.push(root);
  await git(root, ["restore", "src/a.ts"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await trackRemoteBase(root);
  await git(root, ["checkout", "-b", "feature"]);
  await commit(root, { "src/own.ts": "own\n" }, "own");
  await git(root, ["checkout", "main"]);
  await git(root, ["merge", "--no-ff", "feature", "-m", "land feature"]);
  await publishBase(root, "main");
  await git(root, ["checkout", "feature"]);
  await git(root, ["merge", "--no-ff", "main", "-m", "merge base"]);

  const json = await runArc(["check", "gate", "commit", "--range", base, "--force", "--json"], root);
  expect(json.exitCode, json.stderr).toBe(1);
  const [check] = JSON.parse(json.stdout).result.checks;
  expect(check.output).toContain("src/own.ts");
  expect(check).not.toHaveProperty("mergedIn");
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
