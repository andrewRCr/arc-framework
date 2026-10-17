/** Real checkout removal and detached-commit preservation through the release handler. */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { runPause, runResumePaused } from "../../src/lib/work-unit/verbs/pause-handover.js";
import { runStoreRename } from "../../src/lib/work-unit/verbs/rename-store.js";
import { storeRenameAdapters } from "../../src/commands/rename-store.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { resolveWorktreeOperationLockPath } from "../../src/lib/work-unit/worktree-operation-lock.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker,
  writeWorktreeOwnershipMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { handleLocusRelease, type LocusReleaseHandlerContext } from "../../src/handlers/locus-release.js";
import type { Store } from "../../src/lib/store/contract.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
import { passingProjectionRemovalSlots } from "../../src/lib/git/worktree-removal.js";

async function fixture() {
  const cwd = await createTempRepo();
  onTestFinished(async () => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["branch", "-M", "main"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nsession.remote_sync: disabled\n");
  await exec("git", ["config", "arc.identity", "andrew"]);
  await writeFile(join(cwd, "base"), "base\n");
  await exec("git", ["add", "base", ".arc"]);
  await exec("git", ["commit", "-m", "Base"]);
  const holder = join(cwd, "checkout");
  await exec("git", ["worktree", "add", "--detach", holder, "main"]);
  await ensureWorktreeMarkerIgnored(holder, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeOwnershipMarker(holder, { createdByArc: true, createdFor: { kind: "work-unit", name: "missing" }, spawningIdentity: "andrew", now: 0 });
  const h = createLifecycleHarness();
  return { ...h, cwd, holder, exec, context: { cwd, exec, store: h.store, identity: "andrew" } };
}
async function invoke(context: LocusReleaseHandlerContext, slug = "missing") {
  const initial = process.exitCode, originalCwd = process.cwd();
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  try {
    process.exitCode = undefined;
    if (context.projectionRemovalSlots !== undefined) {
      await handleLocusRelease(slug, { json: true }, context);
    } else {
      binding.store = context.store ?? null;
      if (context.cwd === undefined) throw new Error("Release fixture needs its real checkout root");
      process.chdir(context.cwd);
      await dispatchRegisteredCli(["--no-input", "locus", "release", slug, "--json"]);
    }
    return { exitCode: process.exitCode, result: JSON.parse(output) as { status: string; reason?: string; spawned?: boolean } };
  } finally { binding.store = null; stdout.mockRestore(); process.chdir(originalCwd); process.exitCode = initial; }
}

it("refuses a dirty spawned checkout and removes it once clean", async () => {
  const h = await fixture();
  await writeFile(join(h.holder, "dirty"), "preserve\n");
  expect((await invoke(h.context)).result).toMatchObject({ status: "refused", reason: expect.stringContaining("dirty") });
  expect(await readFile(join(h.holder, "dirty"), "utf8")).toBe("preserve\n");
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present" });
  await rm(join(h.holder, "dirty"));
  expect(await invoke(h.context)).toMatchObject({ exitCode: undefined, result: { status: "released", spawned: true } });
  expect(await stat(h.holder).catch(() => null)).toBeNull();
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.holder);
}, 30_000);

it.each([false, true])("retains a checkout resumed during awaited projection work and releases after pausing again (spawned=%s)", async spawned => {
  const h = await fixture(), ctx = { ...h.context, baseBranch: "main" };
  const primary = await h.seedMeta("missing", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  if (!spawned) await writeWorktreeMarker(h.holder, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "missing" }, spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  expect(await runPause(ctx, { name: "missing", identity: "andrew", reason: "Waiting" })).toMatchObject({ status: "paused" });
  const marker = await readWorktreeMarker(h.holder);
  const resume = async () => { expect(await runResumePaused(ctx, { name: "missing" })).toMatchObject({ status: "resumed" }); };
  const slots = { ...passingProjectionRemovalSlots,
    persist: async () => { await resume(); return { kind: "persisted" as const }; },
    release: async () => { await resume(); return { kind: "released" as const }; } };
  expect((await invoke({ ...h.context, projectionRemovalSlots: slots })).result).toMatchObject({ status: "refused", reason: expect.stringContaining("arc pause missing") });
  expect(await readWorktreeMarker(h.holder)).toEqual(marker);
  expect((await stat(h.holder)).isDirectory()).toBe(true);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields).toMatchObject({ pause: null });
  expect(await runPause(ctx, { name: "missing", identity: "andrew", reason: "Waiting again" })).toMatchObject({ status: "paused" });
  const paused = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect((await invoke(h.context)).result).toMatchObject({ status: "released", spawned });
  expect(await h.store.read({ reference: primary.reference })).toEqual({ status: "ok", result: paused });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "absent" });
  expect(await stat(h.holder).catch(() => null)).toEqual(spawned ? null : expect.anything());
}, 30_000);

it("preserves a new live marker generation installed while spawned projection persistence awaits", async () => {
  const h = await fixture();
  await h.seedMeta("replacement", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  const marker = { spawnedByArc: true, createdFor: { kind: "work-unit" as const, name: "replacement" }, spawningIdentity: "andrew", createdAt: new Date(1).toISOString() };
  const slots = { ...passingProjectionRemovalSlots, persist: async () => { await writeWorktreeMarker(h.holder, marker); return { kind: "persisted" as const }; } };
  expect((await invoke({ ...h.context, projectionRemovalSlots: slots })).result).toMatchObject({ status: "refused", reason: expect.stringMatching(/generation changed|arc pause replacement/u) });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "present", marker });
  expect((await stat(h.holder)).isDirectory()).toBe(true);
  expect(await runPause({ ...h.context, baseBranch: "main" }, { name: "replacement", identity: "andrew", reason: "Now release" })).toMatchObject({ status: "paused" });
  expect((await invoke(h.context, "replacement")).result).toMatchObject({ status: "released" });
}, 30_000);

it("serializes registered release behind a production rename transaction and preserves its renamed live checkout", async () => {
  const h = await fixture(), ctx = { ...h.context, baseBranch: "main" };
  await h.seedMeta("missing", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  expect(await runPause(ctx, { name: "missing", identity: "andrew", reason: "Waiting" })).toMatchObject({ status: "paused" });
  const lock = await resolveWorktreeOperationLockPath(h.exec, h.cwd);
  let unblock = () => {}, entered = () => {}, blocked = false;
  const barrier = new Promise<void>(resolve => { unblock = resolve; }), acquired = new Promise<void>(resolve => { entered = resolve; });
  const exec: GitExec = async (command, args, options) => {
    if (!blocked && args[0] === "worktree" && args[1] === "list" && await stat(lock).then(() => true, () => false)) {
      blocked = true; entered(); await barrier;
    }
    return h.exec(command, args, options);
  };
  const io = createUserIOContext(); io.exec = exec;
  const renaming = runStoreRename({ ...ctx, exec, ...storeRenameAdapters({ cwd: h.cwd, io }) }, { sourceSlug: "missing", targetSlug: "renamed" });
  await acquired;
  let settled = false;
  const releasing = invoke(h.context).finally(() => { settled = true; });
  let premature: boolean;
  try { await new Promise(resolve => setTimeout(resolve, 500)); premature = settled; } finally { unblock(); }
  const [renamed, released] = await Promise.all([renaming, releasing]);
  expect(premature).toBe(false);
  expect(renamed).toMatchObject({ status: "renamed" });
  expect(released.result).toMatchObject({ status: "refused" });
  expect(await runResumePaused(ctx, { name: "renamed" })).toMatchObject({ status: "resumed" });
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "renamed" } } });
  expect((await stat(h.holder)).isDirectory()).toBe(true);
}, 30_000);

it("preserves detached commits until a branch holds them and then removes only the checkout", async () => {
  const h = await fixture();
  await writeFile(join(h.holder, "work"), "preserve commit\n");
  await h.exec("git", ["add", "work"], { cwd: h.holder });
  await h.exec("git", ["commit", "-m", "Detached work"], { cwd: h.holder });
  const head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.holder })).stdout;
  const refusal = await invoke(h.context);
  expect(refusal.result).toMatchObject({ status: "refused", reason: expect.stringContaining("git switch -c <name>") });
  expect(refusal.result.reason).toContain(head);
  await h.exec("git", ["switch", "-c", "preserved"], { cwd: h.holder });
  expect((await invoke(h.context)).result).toMatchObject({ status: "released", spawned: true });
  expect(await stat(h.holder).catch(() => null)).toBeNull();
  expect((await h.exec("git", ["rev-parse", "preserved"])).stdout).toBe(head);
}, 30_000);

it("passes projection slots through the handler and retains a dirty anchored checkout", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.holder, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "missing" },
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  await writeFile(join(h.holder, "dirty"), "retained edit\n");
  const slots = { ...passingProjectionRemovalSlots, release: async () => ({ kind: "refused" as const, remedy: { text: "Save the projection edit." } }) };
  expect((await invoke({ ...h.context, projectionRemovalSlots: slots })).result).toEqual({ status: "refused", reason: "Save the projection edit." });
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present" });
  expect((await invoke({ ...h.context, projectionRemovalSlots: passingProjectionRemovalSlots })).result).toMatchObject({ status: "released", spawned: false });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "absent" });
  expect(await readFile(join(h.holder, "dirty"), "utf8")).toBe("retained edit\n");
}, 30_000);
