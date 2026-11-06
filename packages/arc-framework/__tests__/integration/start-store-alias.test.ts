/** Retained names resolve to one canonical work item through start dispatch and graduation. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { StartCommandInputSchema } from "../../src/handlers/start.js";
import { handleStoreStart } from "../../src/handlers/start-store.js";
import { runStoreRename } from "../../src/lib/work-unit/verbs/rename-store.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { readLifecycleView } from "../../src/lib/store/lifecycle-view.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import * as terminal from "../../src/lib/terminal.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { runHandlerAt } from "../helpers/handler.js";
import { lockSpawnedCheckout, PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { readWorktreeLock } from "../helpers/worktree-lock.js";
import type { GitExec } from "../../src/lib/git/index.js";

it.each(["create", "graduate"] as const)("retains store-backed %s without success ceremony when its sole lock fails", async (arm) => {
  const h = await fixture();
  const denied: GitExec = async (command, args, options) => {
    if (args[0] === "worktree" && args[1] === "lock") {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "lock denied" });
    }
    return h.exec(command, args, options);
  };
  const io = { ...h.io, exec: denied };
  const executor = buildExecutorContext({ cwd: h.root, io, store: h.store, identity: "starter",
    teamMode: false, internalTemplateDir: "/templates" });
  const name = arm === "create" ? "fresh" : "target";
  const result = await runHandlerAt(h.root, () => handleStoreStart(
    StartCommandInputSchema.parse({ name, ...(arm === "create" ? { new: true } : {}) }),
    { cwd: h.root, identity: "starter", executor, io, interaction: h.interaction },
  ));
  const output = result.stdout + result.stderr;
  expect(result.exitCode, output).toBe(1);
  expect(output).toContain("lock denied");
  expect(output).toContain("git worktree lock --reason");
  expect(output).toContain("continue work in the retained checkout");
  expect(output).not.toContain("Done.");
  expect(output).not.toContain("Started");
  const marker = await readWorktreeMarker(h.path);
  expect(marker).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name } } });
  const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(name) }));
  const record = lifecycleSuccess(await h.store.read({ reference: lookup.reference }));
  expect(record).toMatchObject({ placement: { kind: "active" }, fields: { owner: "starter" } });
  expect(await readWorktreeLock(h.exec, h.path)).toBeUndefined();
  expect(await lockSpawnedCheckout(h.exec, h.path)).toEqual({ kind: "locked" });
  expect(await readWorktreeLock(h.exec, h.path)).toBe(PROJECTION_LOCK_REASON);
  expect(await readWorktreeMarker(h.path)).toEqual(marker);
  expect(lifecycleSuccess(await h.store.read({ reference: lookup.reference }))).toEqual(record);
  const continued = await runHandlerAt(h.root, () => handleStoreStart(StartCommandInputSchema.parse({ name }),
    { cwd: h.root, identity: "starter", executor: h.executor, io: h.io, interaction: h.interaction }));
  expect(continued.stdout + continued.stderr).toContain(`already started in checkout ${h.path}; continue work there`);
}, 30_000);

it("names a cohort when start requires a work unit", async () => {
  const h = await fixture();
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    "# Cohort: group\n\n**Purpose:** Coordinate members.\n");
  const errors: string[] = [];
  vi.spyOn(terminal.log, "error").mockImplementation(message => { errors.push(String(message)); });
  await handleStoreStart(StartCommandInputSchema.parse({ name: "group" }), {
    cwd: h.root, identity: "starter", executor: h.executor, io: h.io, interaction: h.interaction,
  });
  expect(process.exitCode).toBe(1);
  expect(errors.join("\n")).toContain("`group` resolves to a cohort rather than a work unit");
  expect(errors.join("\n")).toContain("cohort's own commands");
  expect(await stat(h.path).catch(() => null)).toBeNull();
}, 30_000);

let root: string | undefined;
const initialExitCode = process.exitCode;
const START_TIMEOUT_MS = 30_000;
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = initialExitCode; if (root !== undefined) await cleanupTempDir(root); root = undefined; });

async function fixture(reused?: "backlog" | "active") {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]); await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const path = join(root, "checkout"), system = join(root, ".arc", "system");
  await mkdir(system, { recursive: true });
  await writeFile(join(system, "arc-config.yml"), `branch.base: main\nworktree.location_template: ${path}\n`);
  const h = createLifecycleHarness();
  const archived = reused === undefined ? undefined : await h.seedMeta("source", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const meta = await h.seedMeta("source", { state: "Planning", owner: "previous", currentWorkflow: "draft-design" }, reused === "active" ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
  if (reused === undefined) expect(await runStoreRename({ store: h.store, cwd: root, exec, baseBranch: "main" }, { sourceSlug: "source", targetSlug: "target" }))
    .toMatchObject({ status: "renamed" });
  const io = { ...createUserIOContext(), exec };
  const executor = buildExecutorContext({ cwd: root, io, store: h.store, identity: "starter", teamMode: false, internalTemplateDir: "/templates" });
  const interaction = resolveProcessInteractionContext({ noInput: true, machineReadable: false, yes: "absent" });
  return { ...h, root, exec, io, executor, interaction, path, meta, archived };
}

it("dispatches a former name to its canonical stub while refusing explicit creation", async () => {
  const h = await fixture(); const ctx = { cwd: h.root, identity: "starter", executor: h.executor, io: h.io, interaction: h.interaction };
  await handleStoreStart(StartCommandInputSchema.parse({ name: "source", new: true }), ctx);
  expect(process.exitCode).toBe(1);
  expect(await stat(h.path).catch(() => null)).toBeNull();
  process.exitCode = 0;
  await handleStoreStart(StartCommandInputSchema.parse({ name: "source" }), ctx);
  expect(process.exitCode).toBe(0);
  expect(await readWorktreeMarker(h.path)).toMatchObject({ kind: "present", marker: { wuName: "target", createdFor: { kind: "work-unit", name: "target" } } });
  const alias = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("source") }));
  const canonical = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("target") }));
  expect(alias.reference).toEqual(canonical.reference);
  expect(alias.reference.owner).toEqual({ ...h.meta.reference.owner, name: "target" });
  expect(lifecycleSuccess(await h.store.read({ reference: alias.reference }))).toMatchObject({ placement: { kind: "active" }, fields: { owner: "starter" } });
  expect(lifecycleSuccess(await readLifecycleView(h.root, h.store)).entries).toHaveLength(1);
  expect(await h.exec("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: h.path }).catch(() => null)).toBeNull();
}, START_TIMEOUT_MS);

it("directs a spawning seeded start to in-place admission from the intended checkout", async () => {
  const h = await fixture(); const errors: string[] = [];
  vi.spyOn(terminal.log, "error").mockImplementation((message) => { errors.push(String(message)); });
  const admitted: string[] = [];
  const ctx = { cwd: h.root, identity: "starter", executor: h.executor, io: h.io, interaction: h.interaction,
    admitColdStart: async (input: { from?: string }) => { admitted.push(input.from ?? ""); } };
  const input = StartCommandInputSchema.parse({ name: "fresh", new: true, from: "draft-fresh.md" });
  await handleStoreStart(input, ctx);
  expect(process.exitCode).toBe(1);
  expect(errors.join("\n")).toContain("arc start --here --from 'draft-fresh.md'");
  expect(errors.join("\n")).toContain("intended checkout");
  expect(await stat(h.path).catch(() => null)).toBeNull();
  expect(lifecycleSuccess(await readLifecycleView(h.root, h.store)).entries).toHaveLength(1);
  process.exitCode = 0;
  await handleStoreStart(StartCommandInputSchema.parse({ ...input, here: true }), ctx);
  expect(process.exitCode).toBe(0);
  expect(admitted).toEqual(["draft-fresh.md"]);
}, START_TIMEOUT_MS);

it("starts the live backlog namesake through dispatch and graduation", async () => {
  const h = await fixture("backlog");
  const errors: string[] = [];
  vi.spyOn(terminal.log, "error").mockImplementation(message => { errors.push(String(message)); });
  await handleStoreStart(StartCommandInputSchema.parse({ name: "source", here: true }), {
    cwd: h.root, identity: "starter", executor: h.executor, io: h.io, interaction: h.interaction,
  });
  expect(errors).toEqual([]);
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })))
    .toMatchObject({ placement: { kind: "active" }, fields: { owner: "starter" } });
  if (h.archived === undefined) throw Error("Expected completed namesake");
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
}, START_TIMEOUT_MS);

it("reports a live Planning namesake already started when the archive was listed first", async () => {
  const h = await fixture("active");
  const errors: string[] = [];
  vi.spyOn(terminal.log, "error").mockImplementation(message => { errors.push(String(message)); });
  await handleStoreStart(StartCommandInputSchema.parse({ name: "source" }), {
    cwd: h.root, identity: "starter", executor: h.executor, io: h.io, interaction: h.interaction,
  });
  expect(errors.join("\n")).toContain("source is already started; run arc materialize source");
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference }))).toEqual(h.meta);
  if (h.archived === undefined) throw Error("Expected completed namesake");
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
}, START_TIMEOUT_MS);
