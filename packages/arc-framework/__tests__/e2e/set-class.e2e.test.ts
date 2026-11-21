/** Class editing through the built CLI keeps the commit and other metadata intact. */
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { runCli } from "./store-default.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";

const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

it("changes Class without advancing state, committing, or replacing other fields", async () => {
  const root = await createTempRepoCore({ prefix: "arc-class-cli-", identity: "test-user" });
  roots.push(root);
  const exec = makeGitExec(root), identity = SlugSchema.parse("test-user");
  const init = await runCli(["--no-input", "init", "--name", "example", "--identity", "test-user", "--tools", ""],
    { cwd: root });
  expect(init.exitCode, JSON.stringify(init)).toBe(0);
  await exec("git", ["add", "-A"]);
  await exec("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "initialize"]);
  const { meta } = await seedWorkUnit(root, "example", { identity, branch: "feat/example", meta: { owner: "test-user",
    workClass: "Light", currentWorkflow: "process-task-loop", branch: "feat/example", nextTask: "Task 1.1 — Build feature" } });
  await exec("git", ["switch", "-c", "feat/example"]);
  const stored = async () => parseMetaRecord((await readStoreRecord(root, identity, meta.reference)).content);
  const before = await stored(), head = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  const result = await runCli(["--no-input", "set-class", "Heavy", "example"], { cwd: root });
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  expect(await stored()).toEqual({ ...before, workClass: "Heavy" });
  expect((await exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
});
