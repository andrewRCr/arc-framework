/** User status renders both selected-store slices without a derived-file cache. */
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, expect, it } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { StoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
import { handleUserStatus } from "../../../../src/handlers/status/views.js";
import type { StatusCliOptions } from "../../../../src/handlers/status/input.js";
import { createStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../../helpers/status-context.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { runHandlerAt } from "../../../helpers/handler.js";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(store: Store, sync?: StoreSyncPort, identity?: string | null) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-user-store-")); folders.push(cwd);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "team.mode: true\n");
  const { exec } = scriptGitExec([
    { match: { prefix: ["config"] }, responses: [{ failure: { exitCode: 1 } }] },
    { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] },
    { match: { predicate: () => true }, responses: [{ failure: { exitCode: 128, stderr: "fatal: not a git repository" } }] },
  ]);
  const context = await createTestStatusContext({ cwd, store, sync, exec, identity });
  return { cwd, context, run: (opts: StatusCliOptions = {}) => runHandlerAt(cwd, () => handleUserStatus(context, opts)) };
}

it("renders store membership and Ready rows with the existing JSON shape and creates no file", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("branchless", { state: "Planning", currentWorkflow: "draft-design", owner: "alice" });
  await h.seedMeta("ready", { state: "Planning", currentWorkflow: "draft-design", owner: "alice", workClass: "Heavy" }, { kind: "backlog", commitment: "planned" });
  const f = await fixture(h.store), before = await readdir(f.cwd, { recursive: true });
  const output = await f.run({ json: true });
  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
  const result = JSON.parse(output.stdout);
  expect(Object.keys(result).sort()).toEqual(["output", "source", "warnings"]);
  expect(result.source).toBe("rendered");
  expect(result.output).toMatch(/## In Flight[\s\S]*branchless[\s\S]*## Ready[\s\S]*ready[\s\S]*Heavy/u);
  expect(await readdir(f.cwd, { recursive: true })).toEqual(before);
});

it("prints each store warning to stderr in text mode while JSON retains warning strings", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("local-work", { owner: "alice" });
  const f = await fixture(h.store);
  const json = await f.run({ json: true });
  const view = JSON.parse(json.stdout);
  expect(view.warnings.length).toBeGreaterThan(0);
  const text = await f.run();
  expect(text).toEqual({ stdout: `${view.output}\n`, stderr: view.warnings.map((warning: string) => `warning: ${warning}\n`).join(""), exitCode: 0 });
});

it.each(["unreadable", "refused"] as const)("refuses a %s listing and resumes after its repair", async kind => {
  const h = createLifecycleHarness(), store = Object.create(h.store) as Store;
  let broken = true;
  const refusal = { code: "listing-unreadable" as const, condition: "Lifecycle inventory unavailable.", remedy: { text: "Restore the inventory and retry." } };
  store.list = input => broken && input.kind === "work-item/meta" ? Promise.resolve(kind === "unreadable"
    ? { status: "ok", result: { status: "unreadable", condition: refusal.condition, remedy: refusal.remedy } }
    : { status: "refused", refusal: { ...refusal, code: "unsupported", class: "terminal", case: "unhomed-kind" } }) : h.store.list(input);
  const f = await fixture(store);
  for (const json of [false, true]) {
    const result = await f.run({ json });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`Error [${kind === "unreadable" ? "listing-unreadable" : "unsupported"}]: ${refusal.condition} ${refusal.remedy.text}\n`);
    if (json) expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { condition: refusal.condition, remedy: refusal.remedy } });
    else expect(result.stdout).toBe("");
  }
  broken = false;
  const repaired = await f.run({ json: true });
  expect(repaired.exitCode).toBe(0);
  expect(JSON.parse(repaired.stdout).source).toBe("rendered");
});


it("pulls once before either slice reads metadata", async () => {
  const h = createLifecycleHarness();
  const active = await h.seedMeta("in-flight", { owner: "alice" });
  const ready = await h.seedMeta("ready", { owner: "alice", state: "Planning", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  let pulls = 0;
  const f = await fixture(h.store, createStoreSyncPort({ pull: async () => {
    if (++pulls > 1) throw new Error("The user view attempted a second pull");
    lifecycleSuccess(await h.store.batch({ writes: [active, ready].map(meta => recordPut(meta, {
      content: renderMetaFile(meta.reference.owner.name, { owner: "alice", state: meta === active ? "Active" : "Planning",
        currentWorkflow: meta === active ? "process-task-loop" : "draft-design", workClass: "Heavy", priority: "P1" }) })),
      provenance: { verb: "pull", lifecycleAction: "pull" } }));
    return { status: "pulled" };
  } }));
  const result = await f.run({ fetch: true, json: true });
  expect(result.exitCode).toBe(0);
  const view = JSON.parse(result.stdout);
  expect(view.output).toMatch(/in-flight\s*\| Active \| Heavy \| P1/u);
  expect(view.output).toMatch(/ready\s*\| Heavy \| P1/u);
});


it("prints the identity guidance and exits successfully without acquiring store data", async () => {
  const h = createLifecycleHarness(), store = Object.create(h.store) as Store;
  store.list = async () => { throw new Error("Identityless user status acquired store data"); };
  const f = await fixture(store, createStoreSyncPort({ pull: async () => { throw new Error("Identityless status pulled state"); } }), null);
  for (const json of [false, true]) {
    const output = await f.run({ json, fetch: true });
    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const message = "Status (User) requires an identity resolved from `arc.identity` or Git `user.name`. Set one with `git config arc.identity <name>`.";
    expect(output.stdout).toBe(json ? `${JSON.stringify({ output: message, source: "no-identity", warnings: [] })}\n` : `${message}\n`);
  }
});

it("retains a failed checkout observation as advisory evidence even with no active rows", async () => {
  const h = createLifecycleHarness(), f = await fixture(h.store);
  const result = await f.run({ json: true });
  expect(result.exitCode).toBe(0);
  const view = JSON.parse(result.stdout);
  expect(view.warnings).toEqual(expect.arrayContaining([
    expect.stringMatching(/fatal: not a git repository[\s\S]*arc locus/u),
    expect.stringContaining("retry arc status --user"),
  ]));
});


it.each([[], ["--local", "--fetch"], ["--fetch", "--local"], ["--fetch", "--no-fetch"]].map(argv => ({ argv })))("keeps both slices local for $argv", async ({ argv }) => {
  const h = createLifecycleHarness(); await h.seedMeta("local-work", { owner: "alice" });
  const f = await fixture(h.store, createStoreSyncPort({ pull: async () => { throw new Error("Local user status pulled state"); } }));
  const flags = new Command().option("--fetch").option("--local").option("--no-fetch").parse(argv, { from: "user" }).opts<StatusCliOptions>();
  const result = await f.run({ ...flags, json: true });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).output).toContain("local-work");
});

it("keeps the in-repo user arm's text warnings silent", async () => {
  const h = createLifecycleHarness(), store = Object.create(h.store) as Store;
  Object.defineProperty(store, "capabilities", { value: { ...h.store.capabilities, stateOffBranch: false } });
  const f = await fixture(store);
  const json = await f.run({ json: true });
  expect(JSON.parse(json.stdout).warnings.length).toBeGreaterThan(0);
  const text = await f.run();
  expect(text.stderr).toBe("");
  expect(text.stdout).toBe(`${JSON.parse(json.stdout).output}\n`);
});
