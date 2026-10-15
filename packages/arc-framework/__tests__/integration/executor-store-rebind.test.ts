/** Production default stores follow spawned checkouts while explicit injection stays shared. */
import { afterEach, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVerbBase, buildExecutor } from "../../src/handlers/lifecycle-shared.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { recordReferences, OwnerIdentitySchema } from "../../src/lib/store/identity.js";
import { runActivate } from "../../src/lib/work-unit/verbs/activate-deactivate.js";
import { runTaskClose } from "../../src/lib/work-unit/verbs/task-close.js";
import { readWorkUnit } from "../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
const originalCwd = process.cwd(), roots: string[] = [];
afterEach(async () => { process.chdir(originalCwd); process.exitCode = 0; await removeGitBackedDirs(roots.splice(0)); });
async function fixture(json = true) {
  const parent = await createTempRepoCore({ prefix: "arc-executor-rebind-", identity: "test-user" }); roots.push(parent);
  const child = `${parent}.child`; roots.push(child);
  const exec = makeGitExec(parent);
  await mkdir(join(parent, ".arc", "active"), { recursive: true });
  const meta = (orientation: string) => renderMetaFile("example", { owner: "test-user", state: "Active", workClass: "Light", currentWorkflow: "process-task-loop", nextAction: orientation });
  await writeFile(join(parent, ".arc", "active", "meta-example.md"), meta("Parent checkout orientation"));
  await exec("git", ["add", "-A"]); await exec("git", ["commit", "-m", "fixture"]);
  await exec("git", ["worktree", "add", "--detach", child]);
  await writeFile(join(child, ".arc", "active", "meta-example.md"), meta("Child checkout orientation"));
  process.chdir(parent);
  const base = await resolveVerbBase(undefined, json); if (base === null) throw new Error("Production base did not resolve");
  return { parent, child, base };
}
it.each([false, true])("reopens the production store at the spawned checkout and reuses its first opening initially, json=%s", async (json) => {
  const { child, base } = await fixture(json), { executor } = await buildExecutor(base);
  if (executor.store === undefined) throw new Error("Missing production store");
  expect(executor.store).toBe(base.store);
  expect(lifecycleSuccess(await readWorkUnit(executor.store, "example")).fields).toMatchObject({ nextAction: "Parent checkout orientation" });
  const rebound = executor.withCwd?.(child); if (rebound?.store === undefined) throw new Error("No rebound operational store");
  expect(lifecycleSuccess(await readWorkUnit(rebound.store, "example")).fields).toMatchObject({ nextAction: "Child checkout orientation" });
  expect(rebound.store).not.toBe(executor.store);
  expect(lifecycleSuccess(await readWorkUnit(executor.store, "example")).fields).toMatchObject({ nextAction: "Parent checkout orientation" });
});
it("preserves a directly injected backend when rebinding the constructor", async () => {
  const { child, base } = await fixture(), h = createLifecycleHarness(); await h.seedMeta("example", { nextAction: "Injected orientation" });
  const executor = buildExecutorContext({ cwd: base.cwd, io: base.io, identity: base.identity, store: h.store, teamMode: false, baseBranch: "main", internalTemplateDir: "/templates" });
  const rebound = executor.withCwd?.(child); expect(rebound?.store).toBe(h.store);
  if (rebound?.store === undefined) throw new Error("Missing injected store");
  expect(lifecycleSuccess(await readWorkUnit(rebound.store, "example")).fields).toMatchObject({ nextAction: "Injected orientation" });
});
it("preserves an injected backend replacing the production base's default instance", async () => {
  const { child, base } = await fixture(), h = createLifecycleHarness(); await h.seedMeta("example", { nextAction: "Replacement orientation" });
  const { executor } = await buildExecutor({ ...base, store: h.store });
  const rebound = executor.withCwd?.(child); expect(rebound?.store).toBe(h.store);
  if (rebound?.store === undefined) throw new Error("Missing replacement store");
  expect(lifecycleSuccess(await readWorkUnit(rebound.store, "example")).fields).toMatchObject({ nextAction: "Replacement orientation" });
});

const projectUid = "a09e9654-95ad-4e6c-a74f-460845f0bd36";
async function seedProject(h: ReturnType<typeof createLifecycleHarness>) {
  return h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: projectUid })), "{}");
}
it("lazily binds the production project UID once across rebinding and real activation", async () => {
  const { child, base } = await fixture(), h = createLifecycleHarness();
  await seedProject(h);
  const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" });
  const list = h.store.list.bind(h.store); let identityReads = 0;
  h.store.list = async (input) => { if (input.kind === "project-registry/identity") identityReads++; return list(input); };
  const { executor } = await buildExecutor({ ...base, store: h.store });
  expect(identityReads).toBe(0);
  expect(typeof executor.projectId).toBe("function");
  expect(await executor.projectId?.()).toBe(projectUid);
  const rebound = executor.withCwd?.(child);
  expect(await rebound?.projectId?.()).toBe(projectUid);
  expect(await runActivate(executor, { name: "example", toBranch: "feat/example", nextAction: "Continue", baseBranch: "main" }))
    .toMatchObject({ status: "activated", branch: "feat/example" });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).links?.branches)
    .toEqual([{ repository: projectUid, ref: "feat/example", linkedAs: "created", excluded: [] }]);
  expect(identityReads).toBe(1);
});
it("refuses missing project identity without closing tasks and succeeds after a repaired invocation", async () => {
  const { base } = await fixture(), h = createLifecycleHarness();
  await base.io.exec("git", ["switch", "-c", "feat/example"], { cwd: base.cwd });
  const primary = await h.seedMeta("example", { taskList: "tasks-example.md" }, { kind: "active" },
    { branches: [{ repository: projectUid, ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const tasks = await h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: example\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Work**\n");
  const context = async () => {
    const { executor } = await buildExecutor({ ...base, store: h.store });
    return { store: executor.store, projectId: executor.projectId, exec: executor.exec!, cwd: base.cwd, slug: "example", baseBranch: "main" };
  };
  expect(await runTaskClose(await context())).toMatchObject({ status: "refused", reason: "Project identity record is missing.",
    remedy: { text: expect.stringContaining("identity record") } });
  expect(lifecycleSuccess(await h.store.read({ reference: tasks.reference }))).toEqual(tasks);
  await seedProject(h);
  expect(await runTaskClose(await context())).toMatchObject({ status: "closed", captured: [] });
  expect(lifecycleSuccess(await h.store.read({ reference: tasks.reference })).content).toContain("`[x]` **1.1 Work**");
});
