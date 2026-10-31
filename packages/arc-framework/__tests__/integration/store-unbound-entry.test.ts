/** Ambient commands refuse an unbound checkout until its owner binds the exact marker. */
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli, withRepairStore } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { readLocalReviewLiveContext } from "../../src/scripts/review-gate/hosts/local/live-context.js";
import { resolveLocalReviewVehicle } from "../../src/scripts/review-gate/hosts/local/review-authority.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture({ spawnedByArc = false, backlog = false, former = false, owner = "test-user", execution = false }: {
  spawnedByArc?: boolean; backlog?: boolean; former?: boolean; owner?: string; execution?: boolean;
} = {}) {
  const h = await lifecycleReuseFixture(former, { state: execution ? "Active" : "Planning", owner,
    currentWorkflow: execution ? "process-task-loop" : "draft-design", ...(execution ? { taskList: "tasks-example.md" } : {}) },
    backlog ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
  if (execution) {
    await h.seed(recordReferences["work-item/task-list"](h.live.reference.owner),
      "# Task List: Example\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Finish the change**\n");
    lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { links: { branches: [
      { repository: h.repository, ref: "feat/example", linkedAs: "created", excluded: [] },
    ] } }), provenance: { verb: "fixture", lifecycleAction: "arrange" } }));
    h.live = lifecycleSuccess(await h.store.read({ reference: h.live.reference }));
    await h.exec("git", ["branch", "feat/example", "main"]);
  }
  await writeFile(join(h.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const path = join(h.cwd, ".arc-checkouts", "unbound");
  await h.exec("git", ["worktree", "add", "--detach", path, "main"]);
  await ensureWorktreeMarkerIgnored(path, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(path, { spawnedByArc, createdFor: { kind: "work-unit", name: "example" },
    spawningIdentity: "test-user", createdAt: "2026-09-01T00:00:00Z" });
  return { ...h, path, marker: await readWorktreeMarker(path) };
}

it.each([false, true])("set-stage refuses and materialize binds the live owner, preserving spawned=%s", async spawned => {
  const h = await fixture({ spawnedByArc: spawned }), before = lifecycleSuccess(await h.store.version()), invocation = { ...h, cwd: h.path };
  const refused = await repairCli(invocation, ["set-stage", "create-spec"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout + refused.stderr).toContain("arc materialize example --here");
  expect(refused.stdout + refused.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.path)).toEqual(h.marker);
  const bound = await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store });
  expect(bound.exitCode ?? 0, bound.stdout + bound.stderr).toBe(0);
  if (h.marker.kind !== "present") throw new Error("Missing unbound fixture marker");
  expect(await readWorktreeMarker(h.path)).toEqual({ kind: "present", marker: { ...h.marker.marker, createdFor: boundWorkUnitSubject(h.live) } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const resumed = await repairCli(invocation, ["set-stage", "create-spec"], { store: h.store });
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference })).fields).toMatchObject({ currentWorkflow: "create-spec" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
}, 30_000);

it("start --here refuses the archived owner's bound checkout before graduating its live namesake", async () => {
  const h = await fixture({ backlog: true });
  await writeWorktreeMarker(h.path, { spawnedByArc: false, createdFor: boundWorkUnitSubject(h.archived),
    spawningIdentity: "test-user", createdAt: "2026-09-01T00:00:00Z" });
  const marker = await readWorktreeMarker(h.path), before = lifecycleSuccess(await h.store.version());
  const head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout;
  const branch = (await h.exec("git", ["branch", "--show-current"], { cwd: h.path })).stdout;
  const result = await repairCli({ ...h, cwd: h.path }, ["start", "example", "--here", "--class", "Light"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("arc teardown");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.path)).toEqual(marker);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference }))).toEqual(h.live);
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout).toBe(head);
  expect((await h.exec("git", ["branch", "--show-current"], { cwd: h.path })).stdout).toBe(branch);
}, 30_000);

it("binds a former-name marker by adding its live owner's UID while retaining the display name", async () => {
  const h = await fixture({ spawnedByArc: true, former: true });
  await writeWorktreeMarker(h.path, { spawnedByArc: true, wuName: "example", createdFor: { kind: "work-unit", name: "example" },
    spawningIdentity: "test-user", createdAt: "2026-09-01T00:00:00Z" });
  const result = await repairCli({ ...h, cwd: h.path }, ["materialize", h.name, "--here"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(await readWorktreeMarker(h.path)).toEqual({ kind: "present", marker: { spawnedByArc: true, wuName: "example",
    createdFor: boundWorkUnitSubject(h.live, "example"), spawningIdentity: "test-user", createdAt: "2026-09-01T00:00:00Z" } });
  const resumed = await repairCli({ ...h, cwd: h.path }, ["set-stage", "create-spec"], { store: h.store });
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference })).fields).toMatchObject({ currentWorkflow: "create-spec" });
  const locus = await repairCli({ ...h, cwd: h.path }, ["locus", "--json"], { store: h.store });
  expect(locus.exitCode ?? 0, locus.stdout + locus.stderr).toBe(0);
  expect(locus.result).toMatchObject({ entering: { kind: "selected", row: { kind: "work-unit",
    subject: { kind: "work-unit", key: h.name, uid: boundWorkUnitSubject(h.live).uid }, diagnostics: [] } } });
}, 30_000);

it("binds the selected owner while another owned checkout remains unbound", async () => {
  const h = await fixture();
  await h.seedMeta("other");
  const otherPath = join(h.cwd, ".arc-checkouts", "other");
  await h.exec("git", ["worktree", "add", "--detach", otherPath, "main"]);
  await ensureWorktreeMarkerIgnored(otherPath, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(otherPath, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "other" },
    spawningIdentity: "test-user", createdAt: "2026-09-01T00:00:00Z" });
  const other = await readWorktreeMarker(otherPath), before = lifecycleSuccess(await h.store.version());
  const result = await repairCli({ ...h, cwd: h.path }, ["materialize", "example", "--here"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(await readWorktreeMarker(h.path)).toMatchObject({ kind: "present", marker: { createdFor: boundWorkUnitSubject(h.live) } });
  expect(await readWorktreeMarker(otherPath)).toEqual(other);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);

it("offers release for a foreign live holder and frees the checkout without changing records", async () => {
  const h = await fixture({ owner: "another" }), before = lifecycleSuccess(await h.store.version()), invocation = { ...h, cwd: h.path };
  const result = await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("arc locus release");
  expect(await readWorktreeMarker(h.path)).toEqual(h.marker);
  const released = await repairCli(invocation, ["locus", "release"], { store: h.store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(await readWorktreeMarker(h.path)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);

it("task close refuses an unbound checkout and closes its task after materialize binds it", async () => {
  const h = await fixture({ execution: true }), invocation = { ...h, cwd: h.path }, before = lifecycleSuccess(await h.store.version());
  const refused = await repairCli(invocation, ["task", "close", "1.1"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout + refused.stderr).toContain("arc materialize example --here");
  expect(refused.stdout + refused.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const bound = await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store });
  expect(bound.exitCode ?? 0, bound.stdout + bound.stderr).toBe(0);
  const closed = await repairCli(invocation, ["task", "close", "1.1"], { store: h.store });
  expect(closed.exitCode ?? 0, closed.stdout + closed.stderr).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/task-list"](h.live.reference.owner) })).content).toContain("`[x]` **1.1");
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
}, 30_000);

it("handoff write refuses an unbound checkout and writes after materialize binds it", async () => {
  const h = await fixture(), invocation = { ...h, cwd: h.path }, before = lifecycleSuccess(await h.store.version());
  const request = { schemaVersion: 1, sessionContext: "Continue from this checkout.", nextAction: "Finish planning", sessionType: "planning" };
  const options = { store: h.store, stdin: JSON.stringify(request) };
  const refused = await repairCli(invocation, ["handoff", "write", "-"], options);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout + refused.stderr).toContain("arc materialize example --here");
  expect(refused.stdout + refused.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const bound = await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store });
  expect(bound.exitCode ?? 0, bound.stdout + bound.stderr).toBe(0);
  const written = await repairCli(invocation, ["handoff", "write", "-"], options);
  expect(written.exitCode ?? 0, written.stdout + written.stderr).toBe(0);
  expect(written.result).toMatchObject({ status: "written", reference: h.live.reference });
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference })).fields).toMatchObject({
    sessionContext: request.sessionContext, nextAction: request.nextAction, stateAtHandoff: before,
  });
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
}, 30_000);

it.each([
  ["pause", "--reason", "Waiting"],
  ["handover", "--to", "another"],
  ["finalize", "create-spec", "--class", "Light"],
  ["repoint-design", "draft-created"],
])("%s refuses its ambient unbound target with recovery exits", async (...argv) => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const result = await repairCli({ ...h, cwd: h.path }, argv, { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("arc materialize example --here");
  expect(result.stdout + result.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.path)).toEqual(h.marker);
}, 30_000);

it("wu reconcile refuses unbound ownership and finds no current unit after unnamed release", async () => {
  const h = await fixture(), invocation = { ...h, cwd: h.path }, before = lifecycleSuccess(await h.store.version());
  const refused = await repairCli(invocation, ["wu", "reconcile", "--apply", "--json"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  expect(refused.result).toMatchObject({ status: "conflict", reason: expect.stringContaining("arc materialize example --here") });
  expect(refused.stdout + refused.stderr).toContain("arc locus release");
  const released = await repairCli(invocation, ["locus", "release"], { store: h.store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  const empty = await repairCli(invocation, ["wu", "reconcile", "--apply", "--json"], { store: h.store });
  expect(empty.result).toMatchObject({ status: "conflict", reason: expect.stringContaining("does not hold exactly one matching work unit") });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.path)).toEqual({ kind: "absent" });
}, 30_000);

it("release commit refuses unbound ownership and commits after materialize binds it", async () => {
  const h = await fixture({ execution: true }), invocation = { ...h, cwd: h.path };
  await h.exec("git", ["config", "arc.commitInterlock", "on-task-approval"]);
  await writeFile(join(h.path, "work.txt"), "Useful work\n");
  await h.exec("git", ["add", "work.txt"], { cwd: h.path });
  const argv = ["release", "commit", "-m", "fix: record useful work", "-m", "Context: tasks-example.md (Task 1.1)"];
  const before = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout;
  const refused = await repairCli(invocation, argv, { store: h.store });
  expect(refused.exitCode).toBe(10);
  expect(refused.stderr).toContain("arc materialize example --here");
  expect(refused.stderr).toContain("arc locus release");
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout).toBe(before);
  expect((await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store })).exitCode ?? 0).toBe(0);
  const resumed = await repairCli(invocation, argv, { store: h.store });
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout).not.toBe(before);
}, 30_000);

it("delivery refuses unbound ambient ownership with its unresolved-work-unit result", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const result = await repairCli({ ...h, cwd: h.path }, ["delivery", "plan", "from-branch", "--design-inventory", "unused.json", "--json"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.result).toMatchObject({ status: "refused", reason: "active-work-unit-unresolved" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);

it("release push refuses unbound ownership and publishes after materialize binds it", async () => {
  const h = await fixture({ execution: true }), invocation = { ...h, cwd: h.path };
  const origin = join(h.cwd, ".git", "unbound-origin.git");
  await h.exec("git", ["init", "--bare", origin]);
  await h.exec("git", ["remote", "add", "origin", origin]);
  await h.exec("git", ["push", "origin", "main"]);
  await h.exec("git", ["config", "arc.pushInterlock", "on-workflow"]);
  const refused = await repairCli(invocation, ["release", "push"], { store: h.store });
  expect(refused.exitCode, refused.stderr).toBe(10);
  expect(refused.stderr).toContain("arc materialize example --here");
  expect(refused.stderr).toContain("arc locus release");
  expect((await h.exec("git", ["ls-remote", origin, "refs/heads/feat/example"])).stdout).toBe("");
  expect((await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store })).exitCode ?? 0).toBe(0);
  const resumed = await repairCli(invocation, ["release", "push"], { store: h.store });
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  const head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout.trim();
  expect((await h.exec("git", ["ls-remote", origin, "refs/heads/feat/example"])).stdout.trim()).toBe(`${head}\trefs/heads/feat/example`);
}, 30_000);

it("active status warns about unbound ownership and resolves after materialize binds it", async () => {
  const h = await fixture(), invocation = { ...h, cwd: h.path };
  const before = lifecycleSuccess(await h.store.version());
  const reported = await repairCli(invocation, ["active", "status", "--json"], { store: h.store });
  expect(reported.exitCode ?? 0, reported.stdout + reported.stderr).toBe(0);
  expect(reported.stdout).toContain("arc materialize example --here");
  expect(reported.stdout).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect((await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store })).exitCode ?? 0).toBe(0);
  const resumed = await repairCli(invocation, ["active", "status", "--json"], { store: h.store });
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  expect(resumed.result).toMatchObject({ candidates: [{ filename: "meta-example.md" }] });
  expect(resumed.stdout).not.toContain("unbound");
}, 30_000);

it("user reference reconciliation warns only in human output and continues after binding", async () => {
  const h = await fixture(), invocation = { ...h, cwd: h.path }, before = lifecycleSuccess(await h.store.version());
  const reported = await repairCli(invocation, ["user", "reconcile-references"], { store: h.store });
  expect(reported.exitCode ?? 0, reported.stdout + reported.stderr).toBe(0);
  expect(reported.stdout + reported.stderr).toContain("arc materialize example --here");
  expect(reported.stdout + reported.stderr).toContain("arc locus release");
  const machine = await repairCli(invocation, ["user", "reconcile-references", "--json"], { store: h.store });
  expect(machine.result).toMatchObject({ status: "clean" });
  expect(machine.result).not.toHaveProperty("warnings");
  expect(machine.stdout + machine.stderr).not.toContain("arc materialize");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect((await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store })).exitCode ?? 0).toBe(0);
  const resumed = await repairCli(invocation, ["user", "reconcile-references"], { store: h.store });
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  expect(resumed.stdout + resumed.stderr).not.toContain("unbound");
}, 30_000);

it("local review refuses an unbound vehicle and resolves after binding", async () => {
  const h = await fixture({ execution: true }), invocation = { ...h, cwd: h.path };
  const content = renderMetaFile("example", { state: "Active", owner: "test-user", workClass: "Light",
    branch: "feat/example", currentWorkflow: "process-task-loop" });
  lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { content }), provenance: { verb: "fixture", lifecycleAction: "arrange" } }));
  await mkdir(join(h.path, ".arc/active"), { recursive: true });
  await writeFile(join(h.path, ".arc/active/meta-example.md"), content);
  await h.exec("git", ["checkout", "feat/example"], { cwd: h.path });
  const read = () => withRepairStore(h.store, () => readLocalReviewLiveContext({ cwd: h.path, exec: h.exec }));
  const dependencies = { readLiveContext: async () => (await read()).context };
  expect((await read()).context.workUnit).toBeNull();
  await expect(resolveLocalReviewVehicle({}, dependencies)).rejects.toMatchObject({ reason: "vehicle-unresolved" });
  expect((await repairCli(invocation, ["materialize", "example", "--here"], { store: h.store })).exitCode ?? 0).toBe(0);
  expect((await read()).context.workUnit).toEqual({ identity: "example", owner: "test-user" });
  await expect(resolveLocalReviewVehicle({}, dependencies)).resolves.toMatchObject({ vehicle: { kind: "work-unit", identity: "example" } });
}, 30_000);
