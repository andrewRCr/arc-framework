/** Operational terminal snapshots drive real Git checkout and ref cleanup, including resumable failures. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { createRetirementHarness, retirementLink } from "../helpers/store/retirement-harness.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { createDefaultLocusPorts } from "../../src/lib/work-unit/locus-ports.js";
import { createStoreTeardownContext } from "../../src/lib/work-unit/store-teardown-context.js";
import { nodeReconcileWorkUnitWorktreeFs } from "../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { runStoreAbandon } from "../../src/lib/work-unit/verbs/abandon-store.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { selectStoreRetirementHusk } from "../../src/lib/work-unit/store-retirement-husk.js";
import { readStoreRetirementEvidence } from "../../src/lib/work-unit/store-retirement-evidence.js";
import { runTeardown } from "../../src/lib/work-unit/verbs/teardown.js";
import { localLifecycleTip } from "../../src/lib/git/lifecycle-ref-refresh.js";
import { writeWorktreeMarker, readWorktreeMarker, type WorktreeMarker } from "../../src/lib/git/worktree-marker.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await cleanupTempDir(root); });
async function fixture(options: { adopted?: boolean; ended?: boolean; secondary?: boolean; end?: "archive" | "decompose" } = {}) {
  const root = await createTempRepo(); roots.push(root);
  const exec = makeGitExec(root), execInput = makeGitExecInput(root);
  await exec("git", ["branch", "-M", "main"]); await writeFile(join(root, "base"), "base\n");
  await exec("git", ["add", "base"]); await exec("git", ["commit", "-m", "base"]);
  await writeFile(join(root, ".git", "info", "exclude"), "origin.git/\ncheckout*/\n.arc/\n");
  const baseOid = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  await exec("git", ["init", "--bare", join(root, "origin.git")]); await exec("git", ["remote", "add", "origin", join(root, "origin.git")]); await exec("git", ["push", "origin", "main"]);
  await exec("git", ["switch", "-c", "feat/demo"]); await writeFile(join(root, "work"), "work\n");
  await exec("git", ["add", "work"]); await exec("git", ["commit", "-m", "work"]); await exec("git", ["push", "-u", "origin", "feat/demo"]);
  const workOid = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  if (options.secondary) { await exec("git", ["branch", "chore/demo", workOid]); await exec("git", ["push", "origin", "chore/demo"]); }
  const h = await createRetirementHarness({ ended: options.ended, end: options.end, branches: [...(options.secondary ? [retirementLink("chore/demo")] : []), retirementLink("feat/demo", options.adopted ? "adopted" : "created")] });
  let holder: string | null = root;
  const marker: WorktreeMarker = { spawnedByArc: false, wuName: "demo", createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00Z" };
  const ports = { ...createDefaultLocusPorts(), findHoldingCheckout: () => Promise.resolve(holder) };
  const io = { ...createUserIOContext(), exec, execInput };
  const executor = buildExecutorContext({ cwd: root, io, store: h.store, locusPorts: ports, projectId: async () => "repo", identity: "test-user", teamMode: false, internalTemplateDir: "/templates" });
  const ctx = createStoreTeardownContext({ cwd: root, identity: "test-user", io }, executor);
  // The locus provider's admitted anchored claim is supplied through its marker seam; Git and filesystem operations stay real.
  ctx.readTeardownSelection = undefined; ctx.teardownWorktree = undefined;
  ctx.readMarker = (path) => Promise.resolve(path === holder ? { kind: "present", marker } : { kind: "absent" });
  ctx.worktreeFs = nodeReconcileWorkUnitWorktreeFs;
  const abandon = () => runStoreAbandon({ executor, storeTeardown: ctx, baseBranch: "main", removal: { exec, readMarker: ctx.readMarker } }, { name: "demo", confirmed: true });
  const teardown = async () => { const result = await runTeardown(ctx, { name: "demo", base: "main" });
    if (result.status === "rejected") throw Error(result.reason); return result; };
  return { ...h, root, exec, ctx, marker, baseOid, workOid, abandon, teardown, setHolder: (path: string) => { holder = path; },
    local: (ref: string) => localLifecycleTip(exec, root, ref), remote: () => exec("git", ["ls-remote", "origin", "refs/heads/feat/demo"]) };
}
describe("store retirement real Git", () => {
  it("returns a clean anchored created branch to base and reaps its exact local, tracking, and remote refs", async () => {
    const h = await fixture(); expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("main");
    expect(await h.local("refs/heads/feat/demo")).toBeNull(); expect(await h.local("refs/remotes/origin/feat/demo")).toBeNull(); expect((await h.remote()).stdout).toBe("");
  });
  it("keeps a dirty anchored checkout's branch, HEAD, files, and remote after ending its primary", async () => {
    const h = await fixture({ ended: false }); await writeFile(join(h.root, "personal.txt"), "keep\n");
    expect(await h.abandon()).toMatchObject({ status: "abandoned", notices: expect.arrayContaining([expect.stringContaining("personal.txt")]) });
    expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid); expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.workOid);
    expect((await h.remote()).stdout).toContain(h.workOid); expect((await h.exec("git", ["status", "--porcelain"])).stdout).toContain("personal.txt");
  });
  it("keeps an adopted branch on its held HEAD and names both owner cleanup commands", async () => {
    const h = await fixture({ adopted: true }); expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: false,
      notices: expect.arrayContaining([expect.stringContaining("git switch"), expect.stringContaining("git branch -D feat/demo")]) });
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("feat/demo"); expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
  });
  it("removes a clean ARC-spawned linked checkout before reaping its branch", async () => {
    const h = await fixture(); await h.exec("git", ["switch", "main"]); const path = join(h.root, "checkout");
    await h.exec("git", ["worktree", "add", path, "feat/demo"]); h.marker.spawnedByArc = true; h.setHolder(path); await writeWorktreeMarker(path, h.marker);
    expect(await h.teardown()).toMatchObject({ status: "torn-down", worktreeRemoved: path, branchDeleted: true });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(path);
  });
  it("detaches a clean retained linked checkout at base when the primary holds base", async () => {
    const h = await fixture(); await h.exec("git", ["switch", "main"]); const path = join(h.root, "checkout");
    await h.exec("git", ["worktree", "add", path, "feat/demo"]); h.setHolder(path);
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true });
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.baseOid);
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain("detached");
  });
  it("reaps an additional zero-delta local/tracking ref but keeps origin's own additional branch", async () => {
    const h = await fixture({ secondary: true }); expect(await h.teardown()).toMatchObject({ status: "torn-down" });
    expect(await h.local("refs/heads/chore/demo")).toBeNull(); expect(await h.local("refs/remotes/origin/chore/demo")).toBeNull();
    expect((await h.exec("git", ["ls-remote", "origin", "refs/heads/chore/demo"])).stdout).toContain(h.workOid);
  });
  it("returns a clean additional holder to base before reaping its local and tracking refs", async () => {
    const h = await fixture({ secondary: true }), path = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", path, "chore/demo"]);
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true });
    expect(await h.local("refs/heads/chore/demo")).toBeNull();
    expect(await h.local("refs/remotes/origin/chore/demo")).toBeNull();
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.baseOid);
  });
  it("keeps a clean additional holder with independent work on its exact branch and head", async () => {
    const h = await fixture({ secondary: true }), path = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", path, "chore/demo"]);
    await writeFile(join(path, "extra"), "independent\n");
    await h.exec("git", ["add", "extra"], { cwd: path });
    await h.exec("git", ["commit", "-m", "independent"], { cwd: path });
    const extraHead = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout;
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect(await h.local("refs/heads/chore/demo")).toBe(extraHead);
    expect(await h.local("refs/remotes/origin/chore/demo")).toBe(h.workOid);
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: path })).stdout).toBe("chore/demo");
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(extraHead);
    expect(await readFile(join(path, "extra"), "utf8")).toBe("independent\n");
  });
  it("retains the retiring proof while an additional holder is dirty and reaps both after repair", async () => {
    const h = await fixture({ secondary: true }), path = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", path, "chore/demo"]);
    await writeFile(join(path, "personal.txt"), "preserve\n");
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "rejected",
      remedy: { argv: ["arc", "teardown", "demo"] } });
    expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
    expect(await h.local("refs/remotes/origin/feat/demo")).toBe(h.workOid);
    expect((await h.remote()).stdout).toContain(h.workOid);
    expect(await h.local("refs/heads/chore/demo")).toBe(h.workOid);
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.workOid);
    expect(await readFile(join(path, "personal.txt"), "utf8")).toBe("preserve\n");
    await rm(join(path, "personal.txt"));
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect(await h.local("refs/heads/chore/demo")).toBeNull();
    expect(await h.local("refs/remotes/origin/chore/demo")).toBeNull();
    expect(await h.local("refs/heads/feat/demo")).toBeNull();
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.baseOid);
  });
  it("retains terminal authority and typed continuation when remote cleanup fails, then completes a real retry", async () => {
    const h = await fixture({ ended: false }); const original = h.ctx.exec;
    h.ctx.exec = (command, args, options) => args[0] === "push" ? Promise.reject(Error("injected remote failure")) : original(command, args, options);
    expect(await h.abandon()).toMatchObject({ status: "abandoned", outcome: { continuation: { argv: ["arc", "teardown", "demo"] } } });
    expect((await h.store.read({ reference: h.meta.reference })).status).toBe("refused"); expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
    h.ctx.exec = original; expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
  });
  it("cleans the exact current-lineage husk while leaving a second husk registered", async () => {
    const h = await huskFixture();
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "torn-down", worktreeRemoved: h.paths[0] });
    const roster = (await h.exec("git", ["worktree", "list", "--porcelain"])).stdout;
    expect(roster).not.toContain(h.paths[0]); expect(roster).toContain(h.paths[1]);
  });
  it.each(["wrong-path", "evidence-mismatch", "head-moved", "dirty"] as const)("refuses %s husk selection before checkout/ref mutations", async (fault) => {
    const h = await huskFixture(); const path = h.paths[0];
    if (fault === "evidence-mismatch") await writeWorktreeMarker(path, { ...h.huskMarker, husk: { ...h.huskMarker.husk!, evidence: { kind: "lineage", transition: "abandon",
      reference: h.terminal.evidence.kind === "lineage" ? h.terminal.evidence.reference : h.meta.reference,
      version: h.meta.version, resultDigest: h.terminal.evidence.resultDigest } } });
    if (fault === "head-moved") await h.exec("git", ["commit", "--allow-empty", "-m", "after stamp"], { cwd: path });
    if (fault === "dirty") await writeFile(join(path, "personal.txt"), "keep\n");
    const before = (await h.exec("git", ["worktree", "list", "--porcelain"])).stdout;
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath: fault === "wrong-path" ? join(h.root, "unknown") : path })).toMatchObject({ status: "rejected" });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toBe(before); expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid); expect((await h.remote()).stdout).toContain(h.workOid);
  });

  it.each([true, false])("checks the shipped stamp's original base proof against the current base, contained=%s", async (contained) => {
    const h = await huskFixture({ end: "archive" });
    await h.exec("git", ["commit", "--allow-empty", "-m", "later base"]); await h.exec("git", ["push", "origin", "main"]);
    if (!contained) {
      if (h.terminal.evidence.kind !== "shipped") throw Error("completed fixture must be shipped");
      await writeWorktreeMarker(h.paths[0], { ...h.huskMarker, husk: { ...h.huskMarker.husk!, evidence: { ...h.terminal.evidence, baseProofOid: h.workOid } } });
    }
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath: h.paths[0] })).toMatchObject(contained ? { status: "torn-down", worktreeRemoved: h.paths[0] } : { status: "rejected" });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.paths[1]);
  });
  it("retains exact --husk retry arguments after a transient removal failure", async () => {
    const h = await huskFixture(), original = h.ctx.exec;
    h.ctx.exec = (command, args, options) => args[0] === "worktree" && args[1] === "remove" ? Promise.reject(Error("injected removal failure")) : original(command, args, options);
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "teardown", "demo", "--husk", h.paths[0]] } });
    h.ctx.exec = original;
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "torn-down", worktreeRemoved: h.paths[0] });
  });

  it("keeps the exact husk available for the same selector retry when ref cleanup fails first", async () => {
    const h = await huskFixture(), original = h.ctx.exec;
    h.ctx.exec = (command, args, options) => args[0] === "push" ? Promise.reject(Error("injected ref cleanup failure")) : original(command, args, options);
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "teardown", "demo", "--husk", h.paths[0]] } });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.paths[0]);
    h.ctx.exec = original;
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "torn-down", worktreeRemoved: h.paths[0] });
  });

  it("retains the exact husk retry while another holder blocks ref cleanup and completes after repair", async () => {
    const h = await fixture({ secondary: true }); await h.exec("git", ["switch", "main"]);
    const terminal = await readStoreRetirementEvidence(h.store, "demo", h.baseOid);
    const huskPath = join(h.root, "checkout-husk"), extraPath = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", "--detach", huskPath, h.workOid]);
    await writeWorktreeMarker(huskPath, { ...h.marker, spawnedByArc: true, husk: { sha: h.workOid,
      at: "2026-10-14T00:00:00Z", subject: { kind: "work-unit", name: "demo" }, branch: "feat/demo",
      authorization: "discard-confirmed", remoteRef: null, evidence: terminal.evidence } });
    await h.exec("git", ["worktree", "add", extraPath, "chore/demo"]);
    await writeFile(join(extraPath, "personal.txt"), "preserve\n"); h.ctx.readMarker = readWorktreeMarker;
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath })).toMatchObject({ status: "rejected",
      remedy: { argv: ["arc", "teardown", "demo", "--husk", huskPath] } });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(huskPath);
    expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
    await rm(join(extraPath, "personal.txt")); await h.exec("git", ["switch", "--detach", h.baseOid], { cwd: extraPath });
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", huskPath })).toMatchObject({ status: "torn-down", worktreeRemoved: huskPath });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(huskPath);
    expect(await h.local("refs/heads/feat/demo")).toBeNull(); expect(await h.local("refs/heads/chore/demo")).toBeNull();
  });

});

async function huskFixture(options: { end?: "archive" | "decompose" } = {}) {
  const h = await fixture(options); await h.exec("git", ["switch", "main"]);
  const terminal = await readStoreRetirementEvidence(h.store, "demo", h.baseOid);
  const paths = [join(h.root, "checkout-one"), join(h.root, "checkout-two")] as const;
  const huskMarker: WorktreeMarker = { ...h.marker, spawnedByArc: true, husk: { sha: h.workOid, at: "2026-10-14T00:00:00Z", subject: { kind: "work-unit", name: "demo" }, branch: "feat/demo",
    authorization: terminal.rule === "discard" ? "discard-confirmed" : "merged-preserved", remoteRef: null, evidence: terminal.evidence } };
  for (const path of paths) { await h.exec("git", ["worktree", "add", "--detach", path, h.workOid]); await writeWorktreeMarker(path, huskMarker); }
  h.ctx.readMarker = readWorktreeMarker;
  return { ...h, terminal, paths, huskMarker };
}

it.each([false, true])("preserves ignored user files and refuses divergent copies before removing a linked checkout, husk=%s", async (husk) => {
  const h = await huskFixture(); const path = h.paths[0];
  if (!husk) {
    const marker = { ...h.huskMarker }; delete marker.husk; await writeWorktreeMarker(path, marker);
    h.setHolder(path);
  }
  const local = join(path, ".arc", "user", "test-user"); const canonical = join(h.root, ".arc", "user", "test-user");
  await mkdir(local, { recursive: true }); await mkdir(canonical, { recursive: true });
  await writeFile(join(local, "personal.md"), "unique local work\n"); await writeFile(join(canonical, "personal.md"), "different primary work\n");
  const params = { name: "demo", base: "main", ...(husk ? { huskPath: path } : {}) };
  expect(await runTeardown(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("personal.md") });
  expect(await readFile(join(local, "personal.md"), "utf8")).toBe("unique local work\n");
  expect(await readFile(join(canonical, "personal.md"), "utf8")).toBe("different primary work\n");
  await rm(join(canonical, "personal.md"));
  expect(await runTeardown(h.ctx, params)).toMatchObject({ status: "torn-down", worktreeRemoved: path });
  expect(await readFile(join(canonical, "personal.md"), "utf8")).toBe("unique local work\n");
});

it.each(["archive", "decompose"] as const)("keeps an unlanded %s husk after its refs disappear and removes it after landing", async (end) => {
  const h = await huskFixture({ end }); const path = h.paths[0];
  await h.exec("git", ["branch", "-D", "feat/demo"]); await h.exec("git", ["push", "origin", "--delete", "feat/demo"]);
  const params = { name: "demo", base: "main", huskPath: path };
  expect(await runTeardown(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringMatching(/preserv|landed/iu) });
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.workOid);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  await h.exec("git", ["merge", "--ff-only", h.workOid]); await h.exec("git", ["push", "origin", "main"]);
  expect(await runTeardown(h.ctx, params)).toMatchObject({ status: "torn-down", worktreeRemoved: path });
  expect(await readFile(join(h.root, "work"), "utf8")).toBe("work\n");
});

it("revalidates stamped-commit preservation before locked husk removal and accepts a repaired upstream", async () => {
  const h = await huskFixture({ end: "archive" }); const path = h.paths[0];
  const roster = await scanRegisteredWorktrees(h.exec); if (!roster.ok) throw new Error(roster.message);
  const selected = await selectStoreRetirementHusk({ ctx: h.ctx, evidence: h.terminal, baseOid: h.baseOid, path }, roster.worktrees);
  await h.exec("git", ["push", "origin", "--delete", "feat/demo"]);
  await expect(selected.revalidate()).rejects.toThrow(/not proven landed/iu);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  await h.exec("git", ["push", "origin", "feat/demo"]);
  await expect(selected.revalidate()).resolves.toBeUndefined();
});
