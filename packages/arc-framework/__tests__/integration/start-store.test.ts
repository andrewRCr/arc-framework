/** Real checkout placement and refusal rollback for store-held work units. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { runGraduate, runCreateNew } from "../../src/commands/start.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const timeout = 30_000;
async function fixture() {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]); await writeFile(join(root, "base"), "base\n");
  await exec("git", ["add", "base"]); await exec("git", ["commit", "-m", "base"]);
  const base = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Planning", owner: "previous", workClass: "Novel", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  const io = { ...createUserIOContext(), exec };
  const ctx = buildExecutorContext({ cwd: root, io, store: h.store, identity: "starter", teamMode: false, internalTemplateDir: "/templates" });
  const path = join(root, "checkout");
  return { ...h, root, ctx, io, exec, base, meta, path,
    params: { name: "demo", spawningIdentity: "starter", baseBranch: "main", locationTemplate: path, repo: "repo", primaryWorktreePath: root } };
}
describe("store-backed start checkouts", () => {
  it.each([false, true])("graduates --here with ahead-of-base HEAD, detached=%s, without changing its coordinate", async (detached) => {
    const h = await fixture(); await h.exec("git", ["switch", "-c", "person"]);
    await writeFile(join(h.root, "ahead"), "ahead\n"); await h.exec("git", ["add", "ahead"]); await h.exec("git", ["commit", "-m", "ahead"]);
    if (detached) await h.exec("git", ["switch", "--detach"]);
    const before = (await h.exec("git", ["rev-parse", "HEAD"])).stdout;
    expect(await runGraduate(h.ctx, { name: "demo", inPlace: true, spawningIdentity: "starter" })).toMatchObject({ status: "graduated", previousOwner: "previous", branch: null });
    expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(before);
    const branch = await h.exec("git", ["symbolic-ref", "--quiet", "HEAD"]).then((r) => r.stdout, () => null);
    expect(branch).toBe(detached ? null : "refs/heads/person");
    expect((await h.exec("git", ["branch", "--list", "plan/*"])).stdout).toBe("");
    expect(parseMetaRecord(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).content).owner).toBe("starter");
  }, timeout);
  it.each([undefined, PROJECTION_LOCK_REASON])("repairs a folderless detached target before graduation, lock=%s", async (lock) => {
    const h = await fixture(); await h.exec("git", ["worktree", "add", "--detach", h.path, "main"]);
    if (lock !== undefined) await h.exec("git", ["worktree", "lock", "--reason", lock, h.path]);
    await rm(h.path, { recursive: true });
    expect(await runGraduate(h.ctx, h.params)).toMatchObject({ status: "graduated", worktreePath: h.path, branch: null });
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout.trim()).toBe(h.base);
    expect(await h.exec("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: h.path }).catch(() => null)).toBeNull();
    expect(await readWorktreeMarker(h.path)).toMatchObject({ kind: "present", marker: { spawnedByArc: true } });
    expect((await h.exec("git", ["branch", "--list", "plan/*"])).stdout).toBe("");
  }, timeout);
  it("refuses a foreign target lock before the store write and preserves the lock", async () => {
    const h = await fixture(); await h.exec("git", ["worktree", "add", "--detach", h.path, "main"]);
    await h.exec("git", ["worktree", "lock", "--reason", "operator", h.path]); await rm(h.path, { recursive: true });
    expect(await runGraduate(h.ctx, h.params)).toMatchObject({ status: "rejected", reason: expect.stringContaining(`git worktree unlock ${h.path}`) });
    expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).version).toEqual(h.meta.version);
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain("locked operator");
    expect(await stat(h.path).catch(() => null)).toBeNull();
  }, timeout);
  it("creates a new detached Planning checkout without a planning branch, artifacts, or notes", async () => {
    const h = await fixture(); const system = join(h.root, ".arc", "system"); await mkdir(system, { recursive: true });
    await writeFile(join(system, "arc-config.yml"), `branch.base: main\nworktree.location_template: ${h.path}\n`);
    expect(await runCreateNew({ store: h.store, io: h.io, internalTemplateDir: "/templates" }, { name: "fresh", worktreePath: h.root, identity: "starter" })).toMatchObject({ ok: true, value: { branch: null, worktreePath: h.path } });
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.path })).stdout.trim()).toBe(h.base);
    expect(await h.exec("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: h.path }).catch(() => null)).toBeNull();
    expect((await h.exec("git", ["branch", "--list", "plan/*"])).stdout).toBe("");
    expect(await stat(join(h.path, ".arc", "active")).catch(() => null)).toBeNull();
    expect(await stat(join(h.path, ".arc", "user")).catch(() => null)).toBeNull();
    const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("fresh") }));
    expect(parseMetaRecord(lifecycleSuccess(await h.store.read({ reference: lookup.reference })).content)).toMatchObject({ state: "Planning", owner: "starter", branch: null });
  }, timeout);
  it("rolls back create-new's detached checkout when the operational creation refuses", async () => {
    const h = await fixture(); const system = join(h.root, ".arc", "system"); await mkdir(system, { recursive: true });
    await writeFile(join(system, "arc-config.yml"), `branch.base: main\nworktree.location_template: ${h.path}\n`);
    const before = (await h.exec("git", ["rev-parse", "HEAD"])).stdout;
    expect(await runCreateNew({ store: h.store, io: h.io, internalTemplateDir: "/templates" }, { name: "demo", worktreePath: h.root, identity: "starter" })).toMatchObject({ ok: false, reason: expect.stringContaining("scaffold") });
    expect(await stat(h.path).catch(() => null)).toBeNull();
    expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(before);
    expect((await h.exec("git", ["branch", "--list", "plan/*"])).stdout).toBe("");
    expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).version).toEqual(h.meta.version);
  }, timeout);
});
