/** Existing work links survive activation from a different checkout branch. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ActivateCommandInputSchema } from "../../src/handlers/lifecycle.js";
import { runActivate, type ActivateContext } from "../../src/lib/work-unit/verbs/activate-deactivate.js";
import { buildStoreCurrentWuReconcile } from "../../src/lib/work-unit/store-current-wu-reconcile.js";
import type { GitExec } from "../../src/lib/git/exec.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const ACTIVATION_TIMEOUT_MS = 30_000;

it.each([null, "main", "person"])("activates from %s while retaining a different own branch link", async (branch) => {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]); await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const base = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["branch", "feat/previous"]);
  if (branch === null) await exec("git", ["switch", "--detach", "main"]);
  if (branch === "person") {
    await exec("git", ["switch", "-c", "person"]);
    await writeFile(join(root, "personal-work"), "preserved work\n");
    await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "personal work"]);
  }
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const h = createLifecycleHarness();
  const prior = { repository: "repo", ref: "feat/previous", linkedAs: "created" as const, excluded: [{ repository: "repo", sha: base }] };
  const meta = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "active" }, { branches: [prior] });
  const unsupported = async (): Promise<never> => { throw new Error("Unexpected in-repo adapter"); };
  const ctx: ActivateContext = { cwd: root, store: h.store, exec, projectId: async () => "repo",
    indexFs: { readdir: unsupported, readFile: unsupported }, setPhase: unsupported, relocateArtifacts: unsupported,
    reconcileBranch: unsupported, reconcileWorkUnitWorktree: unsupported, writeSoftFields: unsupported,
    writeBranchField: unsupported, writeCurrentWorkflowField: unsupported, writeDesignField: unsupported,
    currentWuReconcile: buildStoreCurrentWuReconcile(h.store) };
  const input = ActivateCommandInputSchema.parse({ slug: "example", type: "feat", action: "Begin work" });
  expect(await runActivate(ctx, { name: input.slug!, toBranch: `${input.type}/${input.slug}`, baseBranch: "main", nextAction: input.action }))
    .toMatchObject({ status: "activated", branch: "feat/example" });
  const links = lifecycleSuccess(await h.store.read({ reference: meta.reference })).links?.branches;
  expect(links).toHaveLength(2); expect(links?.[0]).toEqual(prior);
  expect(links?.[1]).toMatchObject({ repository: "repo", ref: "feat/example", linkedAs: branch === "person" ? "adopted" : "created",
    excluded: branch === "person" ? [expect.objectContaining({ repository: "repo", sha: head })] : [] });
  expect((await exec("git", ["rev-parse", "refs/heads/feat/previous"])).stdout.trim()).toBe(base);
  expect((await exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
  expect((await exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("feat/example");
  if (branch === "person") expect(await readFile(join(root, "personal-work"), "utf8")).toBe("preserved work\n");
}, ACTIVATION_TIMEOUT_MS);

async function freshActivation() {
  root = await createTempRepo();
  const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const base = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "active" });
  const unsupported = async (): Promise<never> => { throw new Error("Unexpected in-repo adapter"); };
  const context = (git: GitExec): ActivateContext => ({ cwd: root!, store: h.store, exec: git, projectId: async () => "repo",
    indexFs: { readdir: unsupported, readFile: unsupported }, setPhase: unsupported, relocateArtifacts: unsupported,
    reconcileBranch: unsupported, reconcileWorkUnitWorktree: unsupported, writeSoftFields: unsupported,
    writeBranchField: unsupported, writeCurrentWorkflowField: unsupported, writeDesignField: unsupported,
    currentWuReconcile: buildStoreCurrentWuReconcile(h.store) });
  const input = ActivateCommandInputSchema.parse({ slug: "example", type: "feat", action: "Begin work" });
  return { ...h, meta, exec, base, root, context,
    params: { name: input.slug!, toBranch: `${input.type}/${input.slug}`, baseBranch: "main", nextAction: input.action } };
}

it("preserves an independently created target when the activation cut fails, then activates after repair", async () => {
  const h = await freshActivation();
  const otherCheckout = join(h.root, "other-checkout");
  let competingCut = true;
  const exec: GitExec = async (command, args, options) => {
    if (competingCut && command === "git" && args[0] === "switch" && args[1] === "-c") {
      competingCut = false;
      await h.exec("git", ["worktree", "add", "-b", h.params.toBranch, otherCheckout, h.base]);
    }
    return h.exec(command, args, options);
  };
  const ctx = h.context(exec);
  expect(await runActivate(ctx, h.params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("already exists") });
  const targetTip = await h.exec("git", ["rev-parse", "--verify", `refs/heads/${h.params.toBranch}`]).then((r) => r.stdout.trim(), () => null);
  expect(targetTip).toBe(h.base);
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: otherCheckout })).stdout.trim()).toBe(h.base);
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference }))).toEqual(h.meta);

  await h.exec("git", ["worktree", "remove", otherCheckout]);
  await h.exec("git", ["branch", "-D", h.params.toBranch]);
  expect(await runActivate(ctx, h.params)).toMatchObject({ status: "activated", branch: h.params.toBranch });
  expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe(h.params.toBranch);
}, ACTIVATION_TIMEOUT_MS);

it("removes its successfully created activation branch when the store batch refuses", async () => {
  const h = await freshActivation();
  h.store.batch = async () => ({ status: "refused", refusal: { code: "version-conflict", class: "recoverable",
    condition: "Changed input", records: [h.meta.reference], remedy: { text: "Retry activation" } } });
  expect(await runActivate(h.context(h.exec), h.params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("Changed input") });
  const targetTip = await h.exec("git", ["rev-parse", "--verify", `refs/heads/${h.params.toBranch}`]).then((r) => r.stdout.trim(), () => null);
  expect(targetTip).toBeNull();
  expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("main");
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(h.base);
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference }))).toEqual(h.meta);
}, ACTIVATION_TIMEOUT_MS);
