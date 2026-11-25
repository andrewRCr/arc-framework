/** Class editing through the built CLI keeps the commit and other metadata intact. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import { runCli } from "../helpers/run-cli.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";

const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

it("changes Class without advancing state, committing, or replacing other fields", async () => {
  const root = await createTempRepoCore({ prefix: "arc-class-cli-", identity: "test-user" });
  roots.push(root);
  const exec = makeGitExec(root), path = join(root, ".arc/active/meta-example.md");
  await mkdir(join(root, ".arc/active"), { recursive: true });
  await writeFile(path, makeMetaFixture("example", { owner: "test-user", workClass: "Light",
    currentWorkflow: "process-task-loop", branch: "feat/example", nextTask: "Task 1.1 — Build feature" }));
  await exec("git", ["add", "-A"]);
  await exec("git", ["commit", "-m", "seed work unit"]);
  await exec("git", ["switch", "-c", "feat/example"]);
  const before = parseMetaRecord(await readFile(path, "utf8")), head = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  const result = await runCli(["--no-input", "set-class", "Heavy", "example"], { cwd: root });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(parseMetaRecord(await readFile(path, "utf8"))).toEqual({ ...before, workClass: "Heavy" });
  expect((await exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
});
