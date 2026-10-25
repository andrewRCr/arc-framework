/** Ambient commands refuse an unbound checkout until its owner binds the exact marker. */
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
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
