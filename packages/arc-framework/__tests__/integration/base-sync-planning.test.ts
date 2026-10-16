/** Detached Planning catch-up preserves commits in Git's original object graph. */
import { afterEach, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import { runPlanningBaseSync } from "../../src/handlers/base-sync-planning.js";
let cwd: string | undefined;
afterEach(async () => { if (cwd !== undefined) await cleanupTempDir(cwd); cwd = undefined; });

it("refuses detached work concealed by a replacement graft and syncs after a branch preserves it", async () => {
  cwd = await createTempRepo(); const exec = makeGitExec(cwd);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["commit", "--allow-empty", "-m", "root"]);
  const root = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(cwd, "base"), "base\n"); await exec("git", ["add", "base"]);
  await exec("git", ["commit", "-m", "base"]);
  const base = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["switch", "--detach", root]);
  await writeFile(join(cwd, "stray"), "preserve this work\n"); await exec("git", ["add", "stray"]);
  await exec("git", ["commit", "-m", "detached work"]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["replace", "--graft", base, head]);
  expect((await exec("git", ["rev-list", "HEAD", "--not", base])).stdout.trim()).toBe("");
  const h = createLifecycleHarness(); await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" });
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "test-user" });
  let synchronized = false;
  const ctx = { cwd, exec, store: h.store, baseBranch: "main", sync: async () => {
    synchronized = true; return { status: "unchanged" as const, base: "main", at: base };
  } };
  expect(await runPlanningBaseSync(ctx)).toMatchObject({ status: "refused", reason: "detached-planning-commits", commits: [head],
    remedy: { text: expect.stringContaining("git switch -c <name>") } });
  expect(synchronized).toBe(false);
  expect((await exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
  await exec("git", ["switch", "-c", "preserved-work"]);
  expect(await runPlanningBaseSync(ctx)).toMatchObject({ status: "unchanged" });
  expect(synchronized).toBe(true);
  expect((await exec("git", ["rev-parse", "preserved-work"])).stdout.trim()).toBe(head);
}, 30_000);
