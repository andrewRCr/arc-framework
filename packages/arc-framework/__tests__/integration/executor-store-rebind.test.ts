/** Production default stores follow spawned checkouts while explicit injection stays shared. */
import { afterEach, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVerbBase, buildExecutor } from "../../src/handlers/lifecycle-shared.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
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
