/** Real worktree isolation of disposable execution records. */
import { afterEach, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckoutGitDir } from "../../src/lib/git/exec.js";
import { checkRecordDirectory, createCheckPassStore } from "../../src/lib/checks/record.js";
import { atomicCreateFile } from "../../src/lib/fs.js";

const git = createExecaGitExec();
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

async function checkouts(): Promise<{ primary: string; linked: string }> {
  const primary = await createTempRepoCore({ prefix: "arc-check-record-" });
  repositories.push(primary);
  await git("git", ["commit", "--allow-empty", "-m", "base"], { cwd: primary });
  const linked = join(primary, "linked-checkout");
  await git("git", ["worktree", "add", "-b", "linked", linked], { cwd: primary });
  return { primary, linked };
}

it("places each directory directly inside its worktree's own Git directory", async () => {
  const { primary, linked } = await checkouts();
  const primaryDirectory = await checkRecordDirectory(git, primary);
  const linkedDirectory = await checkRecordDirectory(git, linked);
  expect(primaryDirectory).toBe(join(await resolveCheckoutGitDir(git, primary), "arc-checks"));
  expect(linkedDirectory).toBe(join(await resolveCheckoutGitDir(git, linked), "arc-checks"));
  expect(linkedDirectory).not.toBe(primaryDirectory);
});

it("does not read the primary worktree's pass from a linked worktree", async () => {
  const { primary, linked } = await checkouts();
  const store = (cwd: string) => createCheckPassStore({
    directory: () => checkRecordDirectory(git, cwd),
    readFile: path => readFile(path, "utf8"), createFile: atomicCreateFile,
  });
  const record = { schemaVersion: 1 as const, key: "a".repeat(64), id: "lint", outcome: "passed" as const, output: "primary pass" };
  await store(primary).put(record);
  expect(await store(primary).get(record.key, record.id)).toEqual(record);
  expect(await store(linked).get(record.key, record.id)).toBeNull();
});
