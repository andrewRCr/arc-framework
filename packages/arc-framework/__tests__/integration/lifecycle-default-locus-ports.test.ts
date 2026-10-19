import { createLocusPorts } from "../../src/lib/locus/lifecycle-ports.js";
import { requireMarkerExclusivity } from "../../src/lib/work-unit/locus-ports.js";
/** Actual CLI handlers bind marker-holder ports to the selected store without injected locus ports. */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
const observation = vi.hoisted(() => ({ store: null as Store | null, holder: "", markerError: "", incomplete: false }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => observation.store ?? original.createStore(...args) };
});
vi.mock("../../src/lib/git/worktree-marker.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/git/worktree-marker.js")>();
  return { ...original, readWorktreeMarkerGeneration: async (...args: Parameters<typeof original.readWorktreeMarkerGeneration>) => {
      if (observation.markerError && resolve(args[0]) === resolve(observation.holder))
        throw new Error(observation.markerError);
      return original.readWorktreeMarkerGeneration(...args);
    } };
});
vi.mock("../../src/lib/git/worktree-roster.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/git/worktree-roster.js")>();
  return { ...original, scanRegisteredWorktrees: async (...args: Parameters<typeof original.scanRegisteredWorktrees>) => observation.incomplete ? { ok: true as const, worktrees: [] } : original.scanRegisteredWorktrees(...args) };
});
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { runArc } from "../e2e/helpers.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, readWorktreeMarkerGeneration, removeWorktreeMarkerGeneration, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
async function fixture(completed = false, phase: "Active" | "Planning" | "Integrating" = "Active") {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  expect((await runArc(["init", "--yes", "--name", "test-project"], cwd)).exitCode).toBe(0);
  const exec = makeGitExec(cwd);
  await mkdir(join(cwd, ".git", "test-hooks"));
  await exec("git", ["config", "core.hooksPath", join(cwd, ".git", "test-hooks")]);
  await exec("git", ["config", "arc.identity", "test-user"]);
  await exec("git", ["branch", "-M", "main"]);
  const config = join(cwd, ".arc", "system", "arc-config.yml");
  const text = await readFile(config, "utf8");
  await writeFile(config, text.replace(/^branch.protection:.*$/mu, "branch.protection: full").replace(/^worktree.location_template:.*$/mu, "worktree.location_template: .arc-checkouts/{name}"));
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "Project fixture"]);
  const holder = join(cwd, ".arc-checkouts", "held");
  await writeFile(join(cwd, ".git", "info", "exclude"), ".arc-checkouts/\n", { flag: "a" });
  await exec("git", ["worktree", "add", "--detach", holder, "main"]);
  await ensureWorktreeMarkerIgnored(holder, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(holder, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "held-unit" }, spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  const h = createLifecycleHarness();
  const saved = await h.seedMeta("held-unit", { state: completed ? "Shipped" : phase, owner: "test-user", currentWorkflow: phase === "Planning" ? "draft-design" : phase === "Integrating" ? "integrate-work-unit" : "process-task-loop" }, completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") } : { kind: "active" });
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "test-project", uid: randomUUID() })), "{}");
  return { ...h, cwd, holder, exec, saved, head: (await exec("git", ["rev-parse", "HEAD"])).stdout };
}
async function invoke(h: Awaited<ReturnType<typeof fixture>>, argv: readonly string[]) {
  const previousCwd = process.cwd(), previousExit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    observation.store = h.store;
    observation.holder = h.holder;
    process.chdir(h.cwd);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...argv]);
    return { exitCode: process.exitCode, output };
  }
  finally {
    out.mockRestore();
    err.mockRestore();
    observation.store = null;
    process.chdir(previousCwd);
    process.exitCode = previousExit;
  }
}
it("rename finds the detached anchored holder and changes its marker while preserving the checkout and code", async () => {
  const h = await fixture();
  const result = await invoke(h, ["rename", "held-unit", "renamed-unit"]);
  expect(result, result.output).toMatchObject({ exitCode: undefined });
  const renamed = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("renamed-unit") }));
  expect(renamed.reference.owner).toMatchObject({ uid: "uid" in h.saved.reference.owner ? h.saved.reference.owner.uid : undefined });
  expect(renamed.reference.owner).toHaveProperty("uid", expect.any(String));
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present", marker: { spawnedByArc: false, createdFor: { kind: "work-unit", name: "renamed-unit" } } });
  expect(await stat(h.holder)).toBeTruthy();
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.holder })).stdout).toBe(h.head);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.holder);
}, 30000);
it("teardown finds a completed work unit's anchored holder and releases only its marker", async () => {
  const h = await fixture(true);
  const result = await invoke(h, ["teardown", "held-unit"]);
  expect(result, result.output).toMatchObject({ exitCode: undefined });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "absent" });
  expect(await stat(h.holder)).toBeTruthy();
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.holder })).stdout).toBe(h.head);
  expect(lifecycleSuccess(await h.store.read({ reference: h.saved.reference }))).toMatchObject({ placement: { kind: "completed" } });
}, 30000);
it.each(["marker", "roster"] as const)("handover refuses an unreadable %s observation and succeeds after its repair", async (kind) => {
  const h = await fixture();
  observation.markerError = kind === "marker" ? "fixture marker read denied" : "";
  observation.incomplete = kind === "roster";
  try {
    const refused = await invoke(h, ["handover", "held-unit", "--to", "next-owner"]);
    expect(refused).toMatchObject({ exitCode: 1 });
    expect(refused.output).toContain(kind === "marker" ? "fixture marker read denied" : "registered-worktree listing is incomplete");
    expect(refused.output).toContain(kind === "marker" ? "repair or remove its marker" : "Git lists all registered worktrees");
    expect(lifecycleSuccess(await h.store.read({ reference: h.saved.reference }))).toMatchObject({ fields: { owner: "test-user" } });
    observation.markerError = "";
    observation.incomplete = false;
    const repaired = await invoke(h, ["handover", "held-unit", "--to", "next-owner"]);
    expect(repaired, repaired.output).toMatchObject({ exitCode: undefined });
    expect(lifecycleSuccess(await h.store.read({ reference: h.saved.reference }))).toMatchObject({ fields: { owner: "next-owner" } });
    expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "held-unit" } } });
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.holder })).stdout).toBe(h.head);
  }
  finally {
    observation.markerError = "";
    observation.incomplete = false;
  }
}, 30000);

async function removeFixtureMarker(checkout: string) {
  const marker = await readWorktreeMarkerGeneration(checkout);
  if (marker.kind !== "present") throw new Error("Fixture marker must be present before repair");
  expect(await removeWorktreeMarkerGeneration(checkout, marker.bytes)).toEqual({ kind: "removed" });
}
it("teardown refuses both anchored holders and proceeds after the stray marker is repaired", async () => {
  const h = await fixture(true);
  const stray = join(h.cwd, ".arc-checkouts", "stray");
  await h.exec("git", ["worktree", "add", "--detach", stray, "main"]);
  await ensureWorktreeMarkerIgnored(stray, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(stray, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "held-unit" }, spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  const refused = await invoke(h, ["teardown", "held-unit"]);
  expect(refused).toMatchObject({ exitCode: 1 });
  for (const checkout of [h.holder, stray]) expect(refused.output).toContain(resolveWorktreeMarkerPath(checkout));
  expect(refused.output).toContain("repair or remove the stray marker");
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.saved.reference }))).toEqual(h.saved);
  await removeFixtureMarker(stray);
  const repaired = await invoke(h, ["teardown", "held-unit"]);
  expect(repaired, repaired.output).toMatchObject({ exitCode: undefined });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "absent" });
  for (const checkout of [h.holder, stray]) {
    expect(await stat(checkout)).toBeTruthy();
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: checkout })).stdout).toBe(h.head);
  }
}, 30000);
it("graduation refuses its own crashed marker, then completes after registered CLI locus release", async () => {
  const h = await fixture();
  const stub = await h.seedMeta("crashed-unit", { state: "Planning", owner: "test-user", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  await ensureWorktreeMarkerIgnored(h.cwd, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "crashed-unit" }, spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  const refused = await invoke(h, ["start", "crashed-unit", "--here", "--yes"]);
  expect(refused).toMatchObject({ exitCode: 1 });
  expect(refused.output).toContain("arc locus release crashed-unit");
  expect(lifecycleSuccess(await h.store.read({ reference: stub.reference }))).toEqual(stub);
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.head);
  const release = await invoke(h, ["locus", "release", "crashed-unit", "--json"]);
  expect(release, release.output).toMatchObject({ exitCode: undefined });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  const repaired = await invoke(h, ["start", "crashed-unit", "--here", "--yes"]);
  expect(repaired, repaired.output).toMatchObject({ exitCode: undefined });
  expect(lifecycleSuccess(await h.store.read({ reference: stub.reference }))).toMatchObject({ placement: { kind: "active" }, fields: { state: "Planning", owner: "test-user" } });
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { spawnedByArc: false, createdFor: { kind: "work-unit", name: "crashed-unit" } } });
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.head);
}, 30000);
it("start --new on started Planning reports an unreadable holder with its repair", async () => {
  const h = await fixture(false, "Planning");
  observation.markerError = "fixture Planning holder read denied";
  try {
    const refused = await invoke(h, ["start", "held-unit", "--new", "--yes"]);
    expect(refused).toMatchObject({ exitCode: 1 });
    expect(refused.output).toContain(h.holder);
    expect(refused.output).toContain("fixture Planning holder read denied");
    expect(refused.output).toContain("repair or remove its marker");
    expect(lifecycleSuccess(await h.store.read({ reference: h.saved.reference }))).toEqual(h.saved);
    expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.head);
  } finally { observation.markerError = ""; }
}, 30000);
it("start --new refuses a spawn residue's name in another checkout before creating any record", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.holder, { spawnedByArc: true, createdFor: { kind: "work-unit", name: "residue-unit" }, spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  const before = lifecycleSuccess(await h.store.version());
  const refused = await invoke(h, ["start", "residue-unit", "--new", "--yes"]);
  expect(refused).toMatchObject({ exitCode: 1 });
  expect(refused.output).toContain(h.holder);
  expect(refused.output).toContain("arc locus release residue-unit");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("residue-unit") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present", marker: { createdFor: { name: "residue-unit" } } });
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.head);
}, 30000);

it("the bound spawn guard reports an Integrating holder's integration then teardown repair", async () => {
  const h = await fixture(false, "Integrating");
  const ports = createLocusPorts({ cwd: h.cwd, exec: h.exec, store: h.store });
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await requireMarkerExclusivity(ports, { name: "held-unit" }).then(() => "", (error: unknown) => error instanceof Error ? error.message : String(error));
  expect(refusal).toContain(resolveWorktreeMarkerPath(h.holder));
  expect(refusal).toContain("finish integration, then run teardown there");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present", marker: { createdFor: { name: "held-unit" } } });
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.holder })).stdout).toBe(h.head);
}, 30000);
