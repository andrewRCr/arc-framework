/** Materialize uses held refs offline, repairs stale branch registrations, and preserves branchless HEAD. */
import { afterEach, describe, expect, it } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { runMaterialize } from "../../src/lib/work-unit/verbs/materialize.js";
import { createDefaultLocusPorts } from "../../src/lib/work-unit/locus-ports.js";
import { PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import type { WorktreeMarker } from "../../src/lib/git/worktree-marker.js";
let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const timeout = 30_000;
async function fixture(link = true) {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]); await writeFile(join(root, "base"), "base\n");
  await exec("git", ["add", "base"]); await exec("git", ["commit", "-m", "base"]);
  const h = createLifecycleHarness(); const meta = await h.seedMeta("demo", { state: "Planning", owner: "starter", currentWorkflow: "draft-design" }, { kind: "active" }, link ? { branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }] } : undefined);
  let marker: WorktreeMarker | undefined;
  const ports = { ...createDefaultLocusPorts(), findHoldingCheckout: () => Promise.resolve(null), writeAnchoredMarker: (_cwd: string, value: WorktreeMarker) => { marker = value; return Promise.resolve({ kind: "created" as const, bytes: Buffer.from(JSON.stringify(value)) }); } };
  const ctx = buildExecutorContext({ cwd: root, io: { ...createUserIOContext(), exec }, store: h.store, locusPorts: ports, projectId: async () => "repo", identity: "starter", teamMode: false, internalTemplateDir: "/templates" });
  const path = join(root, "checkout"), remote = join(root, "origin.git");
  const origin = async () => { await exec("git", ["init", "--bare", remote]); await exec("git", ["remote", "add", "origin", remote]); await exec("git", ["push", "origin", "main"]); };
  return { ...h, root, exec, ctx, meta, path, origin, marker: () => marker, params: { name: "demo", baseBranch: "main", identity: "starter", spawningIdentity: "starter", locationTemplate: path, primaryWorktreePath: root, repo: "repo" } };
}
describe("store materialize real refs", () => {
  it("materializes a released local branch with no origin", async () => {
    const h = await fixture(); await h.exec("git", ["branch", "feat/demo", "main"]);
    expect(await runMaterialize(h.ctx, h.params)).toMatchObject({ status: "materialized", branch: "feat/demo", worktreePath: h.path });
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: h.path })).stdout).toBe("feat/demo");
    expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).version).toEqual(h.meta.version);
  }, timeout);
  it("materializes a remote-only link --here at its fetched tip", async () => {
    const h = await fixture(); await h.origin(); await h.exec("git", ["switch", "-c", "feat/demo"]);
    await writeFile(join(h.root, "work"), "work\n"); await h.exec("git", ["add", "work"]); await h.exec("git", ["commit", "-m", "work"]);
    const tip = (await h.exec("git", ["rev-parse", "HEAD"])).stdout;
    await h.exec("git", ["push", "origin", "feat/demo"]); await h.exec("git", ["switch", "main"]); await h.exec("git", ["branch", "-D", "feat/demo"]);
    expect(await runMaterialize(h.ctx, { name: "demo", inPlace: true, baseBranch: "main", identity: "starter", spawningIdentity: "starter" })).toMatchObject({ status: "materialized", branch: "feat/demo" });
    expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(tip);
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("feat/demo");
  }, timeout);
  it("names push from the holding clone when origin lacks the branch", async () => {
    const h = await fixture(); await h.origin();
    expect(await runMaterialize(h.ctx, h.params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("git push -u origin feat/demo") });
    expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).version).toEqual(h.meta.version);
  }, timeout);
  it("names an explicit fetch retry when origin is unreachable and no work ref is held", async () => {
    const h = await fixture(); await h.exec("git", ["remote", "add", "origin", join(h.root, "unavailable.git")]);
    expect(await runMaterialize(h.ctx, h.params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("git fetch origin +refs/heads/feat/demo:refs/remotes/origin/feat/demo") });
  }, timeout);
  it("refuses an unmarked holder and names materialize --here at that checkout", async () => {
    const h = await fixture(); await h.exec("git", ["worktree", "add", "-b", "feat/demo", h.path, "main"]);
    expect(await runMaterialize(h.ctx, { ...h.params, locationTemplate: join(h.root, "next") })).toMatchObject({ status: "rejected", reason: expect.stringContaining(`Checkout ${h.path} already has feat/demo out; run arc materialize demo --here`) });
  }, timeout);
  it.each([false, true])("clears a projection-locked missing branch registration, --here=%s", async (here) => {
    const h = await fixture(); await h.exec("git", ["worktree", "add", "-b", "feat/demo", h.path, "main"]);
    await h.exec("git", ["worktree", "lock", "--reason", PROJECTION_LOCK_REASON, h.path]); await rm(h.path, { recursive: true });
    const params = here ? { name: "demo", inPlace: true as const, baseBranch: "main", identity: "starter", spawningIdentity: "starter" } : h.params;
    expect(await runMaterialize(h.ctx, params)).toMatchObject({ status: "materialized", branch: "feat/demo" });
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: here ? h.root : h.path })).stdout).toBe("feat/demo");
  }, timeout);
  it("claims branchless --here without moving a branched ahead-of-base HEAD", async () => {
    const h = await fixture(false); await h.exec("git", ["switch", "-c", "person"]);
    await writeFile(join(h.root, "work"), "work\n"); await h.exec("git", ["add", "work"]); await h.exec("git", ["commit", "-m", "work"]);
    const head = (await h.exec("git", ["rev-parse", "HEAD"])).stdout;
    expect(await runMaterialize(h.ctx, { name: "demo", inPlace: true, baseBranch: "main", identity: "starter", spawningIdentity: "starter" })).toMatchObject({ status: "materialized", branch: null });
    expect(h.marker()).toMatchObject({ spawnedByArc: false, spawningIdentity: "starter", createdFor: { kind: "work-unit", name: "demo" } });
    expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head); expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("person");
  }, timeout);
});
