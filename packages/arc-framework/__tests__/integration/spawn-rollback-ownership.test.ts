/** Spawn compensation preserves changed claims and reports retained checkout recovery. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { StartCommandInputSchema } from "../../src/handlers/start.js";
import { MaterializeCommandInputSchema } from "../../src/handlers/lifecycle.js";
import { runCreateNew, runGraduate } from "../../src/commands/start.js";
import { runMaterialize } from "../../src/lib/work-unit/verbs/materialize.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { resolveWorktreeMarkerPath, writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../src/lib/git/exec.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const TIMEOUT_MS = 30_000;
async function fixture() {
  const cwd = root = await createTempRepo();
  const exec = makeGitExec(cwd);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const h = createLifecycleHarness(), path = join(cwd, "checkout");
  const io = { ...createUserIOContext(), exec };
  const context = (git: GitExec = exec) => buildExecutorContext({ cwd, io: { ...io, exec: git }, store: h.store,
    projectId: async () => "repo", identity: "starter", teamMode: false, internalTemplateDir: "/templates" });
  const input = StartCommandInputSchema.parse({ name: "demo" });
  const params = { name: input.name!, spawningIdentity: "starter", baseBranch: "main", locationTemplate: path,
    repo: "repo", primaryWorktreePath: cwd };
  const configure = async (script = "") => {
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"),
      `branch.base: main\nworktree.location_template: ${path}\nworktree.post_create: '${script}'\n`);
  };
  const changeClaim = async () => {
    await writeWorktreeOwnershipMarker(path, { createdByArc: true, createdFor: { kind: "work-unit", name: "other" },
      spawningIdentity: "other-owner" });
    await writeFile(join(path, "owner-work"), "preserve these uncommitted bytes\n");
    return readFile(resolveWorktreeMarkerPath(path));
  };
  const retained = async (marker: Buffer) => {
    expect(await readFile(resolveWorktreeMarkerPath(path))).toEqual(marker);
    expect(await readFile(join(path, "owner-work"), "utf8")).toBe("preserve these uncommitted bytes\n");
    expect((await exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  };
  const repair = () => exec("git", ["worktree", "remove", "--force", path]);
  return { ...h, cwd, exec, io, context, path, params, configure, changeClaim, retained, repair };
}

it("preserves a changed spawned graduation claim after batch refusal and graduates after owner repair", async () => {
  const h = await fixture();
  const meta = await h.seedMeta("demo", { state: "Planning", owner: "previous", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  const batch = h.store.batch.bind(h.store);
  let marker: Buffer | undefined;
  h.store.batch = async () => {
    marker = await h.changeClaim();
    return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", condition: "Moved concurrently",
      records: [meta.reference], remedy: { text: "Retry start" } } };
  };
  expect(await runGraduate(h.context(), h.params)).toMatchObject({ status: "rejected",
    recovery: { kind: "rollback", repair: expect.stringMatching(/owner.*preserve/isu), retryAfterRepair: [["arc", "start", "demo"]] } });
  await h.retained(marker!);
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
  h.store.batch = batch;
  await h.repair();
  expect(await runGraduate(h.context(), h.params)).toMatchObject({ status: "graduated", worktreePath: h.path });
}, TIMEOUT_MS);

it("removes its unchanged spawned graduation claim after batch refusal and graduates on retry", async () => {
  const h = await fixture();
  const meta = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  const batch = h.store.batch.bind(h.store);
  h.store.batch = async () => ({ status: "refused", refusal: { code: "version-conflict", class: "recoverable",
    condition: "Moved concurrently", records: [meta.reference], remedy: { text: "Retry start" } } });
  expect(await runGraduate(h.context(), h.params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("Moved concurrently") });
  expect(await stat(h.path).catch(() => null)).toBeNull();
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.path);
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
  h.store.batch = batch;
  expect(await runGraduate(h.context(), h.params)).toMatchObject({ status: "graduated" });
}, TIMEOUT_MS);

it("preserves a claim changed during failed provisioning and graduates after owner repair", async () => {
  const h = await fixture();
  const meta = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  let marker: Buffer | undefined;
  const ctx = h.context();
  const exec: GitExec = async (command, args, options) => {
    if (command === "sh" || command === "cmd.exe") marker = await h.changeClaim();
    return h.exec(command, args, options);
  };
  expect(await runGraduate(h.context(exec), { ...h.params, postCreateScript: "exit 7" }))
    .toMatchObject({ status: "rejected", recovery: { kind: "rollback" } });
  await h.retained(marker!);
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
  await h.repair();
  expect(await runGraduate(ctx, h.params)).toMatchObject({ status: "graduated" });
}, TIMEOUT_MS);

it("preserves a changed create-new claim after scaffold refusal and creates after owner repair", async () => {
  const h = await fixture(); await h.configure();
  const batch = h.store.batch.bind(h.store);
  let marker: Buffer | undefined;
  h.store.batch = async (input) => {
    marker = await h.changeClaim();
    return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", condition: "Scaffold refused",
      records: input.writes.map((operation) => operation.reference), remedy: { text: "Retry start" } } };
  };
  const input = StartCommandInputSchema.parse({ name: "demo", new: true });
  const params = { name: input.name, worktreePath: h.cwd, identity: "starter" };
  const ctx = { store: h.store, io: h.io, internalTemplateDir: "/templates" };
  const first = await runCreateNew(ctx, params);
  expect(first).toMatchObject({ ok: false, reason: expect.stringContaining(h.path) });
  await h.retained(marker!);
  expect(h.store.state.records.size).toBe(0);
  h.store.batch = batch; await h.repair();
  expect(await runCreateNew(ctx, params)).toMatchObject({ ok: true, value: { worktreePath: h.path } });
}, TIMEOUT_MS);

it.each(["create-new", "materialize"] as const)("reports retained cleanup and repairs before retrying %s", async (verb) => {
  const h = await fixture(); await h.configure("exit 7");
  const meta = verb === "materialize" ? await h.seedMeta("demo", { state: "Planning", owner: "starter", currentWorkflow: "draft-design" }) : undefined;
  let blocked = true;
  const exec: GitExec = async (command, args, options) => {
    if (blocked && command === "git" && args[0] === "worktree" && args[1] === "remove") {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "cleanup blocked by owner" });
    }
    return h.exec(command, args, options);
  };
  const start = StartCommandInputSchema.parse({ name: "demo", new: true });
  const materialize = MaterializeCommandInputSchema.parse({ slug: "demo" });
  const run = (script?: string) => verb === "create-new"
    ? runCreateNew({ store: h.store, io: { ...h.io, exec }, internalTemplateDir: "/templates" },
      { name: start.name, worktreePath: h.cwd, identity: "starter" })
    : runMaterialize(h.context(exec), { ...h.params, name: materialize.slug!, identity: "starter", postCreateScript: script });
  const first = await run("exit 7");
  expect(first).toMatchObject({ reason: expect.stringContaining(h.path) });
  expect(first).toMatchObject({ reason: expect.stringMatching(/cleanup blocked by owner/isu) });
  expect(first).toMatchObject({ reason: expect.stringMatching(/inspect.*git worktree list.*owner.*retry/isu) });
  expect(first).toMatchObject({ reason: expect.stringContaining(verb === "create-new"
    ? "'arc' 'start' 'demo' '--new'" : "'arc' 'materialize' 'demo'") });
  expect(await stat(h.path)).toBeDefined();
  if (meta !== undefined) expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
  else expect(h.store.state.records.size).toBe(0);
  expect(await run("exit 7")).toMatchObject({ reason: expect.stringMatching(/collision|already held/isu) });
  blocked = false; await h.repair(); await h.configure();
  expect(await run()).toMatchObject(verb === "create-new" ? { ok: true } : { status: "materialized" });
}, TIMEOUT_MS);
