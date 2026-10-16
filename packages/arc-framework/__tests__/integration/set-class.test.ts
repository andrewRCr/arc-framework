/** Class changes use the real handler, repository store, and checkout write admission. */
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { handleSetClass } from "../../src/handlers/lifecycle.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
const roots: string[] = [];
const originalCwd = process.cwd();
afterEach(async () => { process.chdir(originalCwd); process.exitCode = 0; await removeGitBackedDirs(roots.splice(0)); });
async function repository() {
  const root = await createTempRepoCore({ prefix: "arc-set-class-handler-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root), path = join(root, ".arc/active/meta-example.md");
  await mkdir(join(root, ".arc/active"), { recursive: true });
  await writeFile(path, makeMetaFixture("example", { owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop", branch: "feat/example" }));
  await exec("git", ["add", "-A"]); await exec("git", ["commit", "-m", "seed work unit"]);
  await exec("git", ["switch", "-c", "feat/example"]);
  process.chdir(root);
  return { root, path, exec, head: (await exec("git", ["rev-parse", "HEAD"])).stdout.trim() };
}
it("writes Class in the checkout without committing through the real handler", async () => {
  const repo = await repository();
  await handleSetClass("Heavy", "example");
  expect(parseMetaRecord(await readFile(repo.path, "utf8")).workClass).toBe("Heavy");
  expect((await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(repo.head);
});
it("refuses when the selected meta has no agreeing checkout copy", async () => {
  const repo = await repository();
  await unlink(repo.path);
  await handleSetClass("Heavy", "example");
  expect(process.exitCode).toBe(1);
  await expect(readFile(repo.path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect((await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(repo.head);
});
