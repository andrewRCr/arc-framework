/** Delivery's reopen inspection receives the store-selected task projection without a tracked meta. */
import { afterEach, expect, it, vi } from "vitest";
import { permitDeliveryReopen } from "../../src/handlers/lifecycle-delivery-review.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { readConfigSettings } from "../../src/lib/config/status-reader.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { readWorkUnit } from "../../src/lib/store/lifecycle-write.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import * as terminal from "../../src/lib/terminal.js";
import type { Store } from "../../src/lib/store/index.js";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = 0; await removeGitBackedDirs(roots.splice(0)); });
it.each([false, true])("permits an unbound reopen using the stored task list with no task-list or metadata file, selected=%s", async selected => {
  const root = await createTempRepoCore({ prefix: "arc-reopen-store-permit-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root), h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-example.md" });
  const tasks = "# Task List: Example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n";
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner), tasks);
  await exec("git", ["commit", "--allow-empty", "-m", "Initialize checkout"]);
  const io = createUserIOContext(); io.exec = exec;
  io.readFile = async () => { throw new Error("Tracked metadata reads are unavailable"); };
  const { settings } = await readConfigSettings(root);
  const other = await h.seedMeta("other");
  const store = selected ? createClashDouble(h.store, { slug: "example", holders: [meta.reference, other.reference], mode: "mid-verb" }) : h.store;
  if (selected) lifecycleSuccess(await readWorkUnit(store, "example"));
  expect(await permitDeliveryReopen({ cwd: root, identity: "test-user", io, store }, "example", settings, selected ? meta : undefined)).toBe(true);
});

it("refuses reopen with the store's refusal of the inspected task list, and permits it once that read succeeds", async () => {
  const root = await createTempRepoCore({ prefix: "arc-reopen-store-refusal-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root), h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-example.md" });
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner),
    "# Task List: Example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n");
  await exec("git", ["commit", "--allow-empty", "-m", "Initialize checkout"]);
  const io = createUserIOContext(); io.exec = exec;
  const { settings } = await readConfigSettings(root);
  const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
    condition: "The task list's record objects are missing.", remedy: { text: "Fetch the missing objects, then retry." } };
  // Reopen reads the task list to bind its path, then the delivery inspection reads it again.
  let taskListReads = 0, refusing = true;
  const store = Object.create(h.store) as Store;
  store.read = async input => refusing && input.reference.kind === "work-item/task-list" && ++taskListReads % 2 === 0
    ? { status: "refused", refusal: { ...refusal, reference: input.reference } } : h.store.read(input);
  const errors: string[] = [];
  vi.spyOn(terminal.log, "error").mockImplementation(message => { errors.push(String(message)); });
  expect(await permitDeliveryReopen({ cwd: root, identity: "test-user", io, store }, "example", settings)).toBe(false);
  expect(errors).toEqual([`${refusal.code}: ${refusal.condition}\n${refusal.remedy.text}`]);
  expect(process.exitCode).toBe(1);
  refusing = false;
  process.exitCode = 0;
  expect(await permitDeliveryReopen({ cwd: root, identity: "test-user", io, store }, "example", settings)).toBe(true);
});

it("names a native task conflict through the public reopen permit and permits retry after repair", async () => {
  const root = await createTempRepoCore({ prefix: "arc-reopen-store-conflict-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root), h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-example.md" });
  const reference = recordReferences["work-item/task-list"](primary.reference.owner);
  await h.seed(reference, "# Task List\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build**\n");
  await exec("git", ["commit", "--allow-empty", "-m", "Initialize checkout"]);
  const io = createUserIOContext(); io.exec = exec;
  const { settings } = await readConfigSettings(root);
  const store = Object.create(h.store) as Store;
  const conflict = recordReferences["work-item/conflict-record"](primary.reference.owner, "task-conflict");
  let held = true;
  store.read = async input => {
    const result = await h.store.read(input);
    return held && input.reference.kind === "work-item/task-list" && result.status === "ok"
      ? { status: "ok", result: { ...result.result, conflicts: [conflict] } } : result;
  };
  const errors: string[] = [];
  vi.spyOn(terminal.log, "error").mockImplementation(message => { errors.push(String(message)); });
  const version = lifecycleSuccess(await store.version());
  expect(await permitDeliveryReopen({ cwd: root, identity: "test-user", io, store }, "example", settings, primary)).toBe(false);
  expect(errors).toEqual([`record-malformed: The task list has unresolved conflicts. Conflict records: ${JSON.stringify(conflict)}.\nResolve the named conflict records, then retry.`]);
  expect(lifecycleSuccess(await store.version())).toBe(version);
  held = false; process.exitCode = 0;
  expect(await permitDeliveryReopen({ cwd: root, identity: "test-user", io, store }, "example", settings, primary)).toBe(true);
});
