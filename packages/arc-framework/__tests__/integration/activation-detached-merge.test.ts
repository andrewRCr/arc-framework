/** Detached activation preserves merge-only work before any lifecycle write. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ActivateCommandInputSchema } from "../../src/handlers/lifecycle.js";
import { runActivate, type ActivateContext } from "../../src/lib/work-unit/verbs/activate-deactivate.js";
import { buildStoreCurrentWuReconcile } from "../../src/lib/work-unit/store-current-wu-reconcile.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const ACTIVATION_TIMEOUT_MS = 30_000;

it("refuses a detached merge absent from base, then adopts the branch preserving that merge", async () => {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]);
  await writeFile(join(root, "base"), "base\n"); await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "base"]);
  const base = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(root, "main"), "main\n"); await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "main"]);
  const parent = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["switch", "-c", "side", base]);
  await writeFile(join(root, "side"), "side\n"); await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "side"]);
  await exec("git", ["switch", "main"]); await exec("git", ["merge", "--no-ff", "side", "-m", "base merge"]);
  await exec("git", ["switch", "--detach", parent]); await exec("git", ["merge", "--no-ff", "--no-commit", "side"]);
  await writeFile(join(root, "detached-work"), "committed work\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "detached merge"]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tree = (await exec("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim();
  expect((await exec("git", ["rev-list", "HEAD", "--not", "refs/heads/main"])).stdout.trim()).toBe(head);
  expect((await exec("git", ["rev-list", "--no-merges", "HEAD", "--not", "refs/heads/main"])).stdout.trim()).toBe("");
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" });
  const unsupported = async (): Promise<never> => { throw new Error("Unexpected in-repo adapter"); };
  const ctx: ActivateContext = { cwd: root, store: h.store, exec, projectId: async () => "repo",
    indexFs: { readdir: unsupported, readFile: unsupported }, setPhase: unsupported, relocateArtifacts: unsupported,
    reconcileBranch: unsupported, reconcileWorkUnitWorktree: unsupported, writeSoftFields: unsupported,
    writeBranchField: unsupported, writeCurrentWorkflowField: unsupported, writeDesignField: unsupported,
    currentWuReconcile: buildStoreCurrentWuReconcile(h.store) };
  const input = ActivateCommandInputSchema.parse({ slug: "example", type: "feat", action: "Begin work" });
  const params = { name: input.slug!, toBranch: `${input.type}/${input.slug}`, baseBranch: "main", nextAction: input.action };
  expect(await runActivate(ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining(head) });
  expect((await exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
  expect((await exec("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim()).toBe(tree);
  expect(await readFile(join(root, "detached-work"), "utf8")).toBe("committed work\n");
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
  await exec("git", ["switch", "-c", "preserved-work"]);
  expect(await runActivate(ctx, params)).toMatchObject({ status: "activated", branch: "feat/example" });
  expect((await exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
  expect(await readFile(join(root, "detached-work"), "utf8")).toBe("committed work\n");
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).links?.branches)
    .toEqual([{ repository: "repo", ref: "feat/example", linkedAs: "adopted", excluded: [] }]);
}, ACTIVATION_TIMEOUT_MS);
