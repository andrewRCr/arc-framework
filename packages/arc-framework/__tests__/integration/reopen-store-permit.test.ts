/** Delivery's reopen inspection receives the store-selected task projection without a tracked meta. */
import { afterEach, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { permitDeliveryReopen } from "../../src/handlers/lifecycle-delivery-review.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { readConfigSettings } from "../../src/lib/config/status-reader.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
const roots: string[] = [];
afterEach(async () => { process.exitCode = 0; await removeGitBackedDirs(roots.splice(0)); });
it("permits an unbound reopen using only the projected task list at delivery's filesystem seam", async () => {
  const root = await createTempRepoCore({ prefix: "arc-reopen-store-permit-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root), h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-example.md" });
  const tasks = "# Task List: Example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n";
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner), tasks);
  await mkdir(join(root, ".arc/active"), { recursive: true }); await writeFile(join(root, ".arc/active/tasks-example.md"), tasks);
  await exec("git", ["add", "-A"]); await exec("git", ["commit", "-m", "project task list"]);
  const io = createUserIOContext(); io.exec = exec;
  io.readFile = async () => { throw new Error("Tracked metadata reads are unavailable"); };
  const { settings } = await readConfigSettings(root);
  expect(await permitDeliveryReopen({ cwd: root, identity: "test-user", io, store: h.store }, "example", settings)).toBe(true);
});
