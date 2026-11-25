/** Registered lifecycle verbs distinguish unbound occupancy from an absent owner checkout. */
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { createLocusPorts } from "../../src/lib/locus/lifecycle-ports.js";
import { readWorktreeMarkerGeneration, writeWorktreeMarker, readWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";
async function fixture() {
  const h = await lifecycleReuseFixture(false, { state: "Planning", currentWorkflow: "draft-design" });
  await writeFile(join(h.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const path = join(h.cwd, ".arc-checkouts", "unbound");
  await h.exec("git", ["worktree", "add", "--detach", path, "main"]);
  await ensureWorktreeMarkerIgnored(path, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(path, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "example" },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  return { ...h, path, marker: await readWorktreeMarker(path) };
}
it("rename refuses an unbound holder and continues after exact marker binding", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const refused = await repairCli(h, ["rename", "example", "renamed"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout + refused.stderr).toContain("arc materialize example --here");
  expect(refused.stdout + refused.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference }))).toEqual(h.live);
  expect(await readWorktreeMarker(h.path)).toEqual(h.marker);
  const generation = await readWorktreeMarkerGeneration(h.path);
  if (generation.kind !== "present") throw new Error("Missing unbound marker");
  const ports = createLocusPorts({ cwd: h.cwd, exec: h.exec, store: h.store });
  expect(await ports.writeAnchoredMarker(h.path, { spawnedByArc: generation.marker.spawnedByArc, createdFor: boundWorkUnitSubject(h.live),
    spawningIdentity: generation.marker.spawningIdentity, createdAt: generation.marker.createdAt }, { expected: generation.bytes }))
    .toMatchObject({ kind: "replaced" });
  const renamed = await repairCli(h, ["rename", "example", "renamed"], { store: h.store });
  expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference })).reference.owner.name).toBe("renamed");
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
}, 30_000);
it("start's already-started report shows the unbound checkout and recovery exits", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const result = await repairCli(h, ["start", "example"], { store: h.store }), text = result.stdout + result.stderr;
  expect(result.exitCode).toBe(1);
  expect(text).toContain(`example is already started in checkout ${h.path}`);
  expect(text).toContain("arc materialize example --here");
  expect(text).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);
it("pause writes its section before reporting unobservable work at an unbound checkout", async () => {
  const h = await fixture();
  const result = await repairCli(h, ["pause", "example", "--reason", "Awaiting review"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference })).fields).toMatchObject({ pause: { reason: "Awaiting review", pausedBy: "test-user" } });
  const text = result.stdout + result.stderr;
  expect(text).toContain("Unshared work could not be observed");
  expect(text).toContain(h.path);
  expect(text).toContain("arc materialize example --here");
  expect(text).toContain("arc locus release");
  expect(await readWorktreeMarker(h.path)).toEqual(h.marker);
}, 30_000);
it("handover refuses an unbound holder before changing ownership", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const result = await repairCli(h, ["handover", "example", "--to", "alice"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("arc materialize example --here");
  expect(result.stdout + result.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference }))).toEqual(h.live);
}, 30_000);
it("named release refuses an owned live unbound holder and names its recovery exits", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const result = await repairCli(h, ["locus", "release", "example"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("arc materialize example --here");
  expect(result.stdout + result.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.path)).toEqual(h.marker);
}, 30_000);
it("materialize's candidate report names an unbound held checkout and its exits", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const result = await repairCli(h, ["materialize"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("Available owned work units: [none]");
  expect(result.stdout + result.stderr).toContain(h.path);
  expect(result.stdout + result.stderr).toContain("arc materialize example --here");
  expect(result.stdout + result.stderr).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);
