/** A registration whose folder is gone is offered the exit that unlocks it, or the unlock Git needs before its removal. */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import type { DerivedCheckoutRow } from "../../src/lib/locus/derived-roster.js";
import { runBranchGoneRecovery } from "../../src/lib/session-init/branch-gone-recovery.js";
import { readMissingWorktreeFolders } from "../../src/lib/session-init/missing-worktree-folders.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });

/** A repository whose linked checkout on `branch` lost its folder, its registration locked with `lock` when given. */
async function missingCheckout(branch: string, lock?: string) {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]); await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const path = join(root, "checkout");
  await exec("git", ["worktree", "add", "-b", branch, path, "main"]);
  if (lock !== undefined) await exec("git", ["worktree", "lock", "--reason", lock, path]);
  await rm(path, { recursive: true });
  const scan = await scanRegisteredWorktrees(exec);
  if (!scan.ok) throw Error(scan.message);
  const rows = scan.worktrees.map((checkout): DerivedCheckoutRow => ({ kind: "unmanaged-checkout", subject: null, checkout,
    markerGeneration: null, parentCheckoutPath: null, origin: null, identity: null, context: null, lifecycleLocation: null, diagnostics: [] }));
  return { exec, path, rows };
}
const unlockThenRemove = (path: string) =>
  `After confirming the folder is still missing, git worktree unlock '${path}', then git worktree remove '${path}'.`;

it("names the unlock before the removal for a branch-gone registration under the projection's lock", async () => {
  const h = await missingCheckout("feat/lost", PROJECTION_LOCK_REASON);
  const result = await runBranchGoneRecovery({ derivedRoster: h.rows, exec: h.exec, currentBranch: "feat/gone", baseBranch: "main",
    recentBranches: [], roster: { entries: [{ worktreePath: h.path, branch: "feat/lost" }], warnings: [] } });
  expect(result.missingFolders).toEqual([{ worktreePath: h.path, branch: "feat/lost", actions: [{ text: unlockThenRemove(h.path) }] }]);

  // The remedy as printed clears the registration, which a plain removal under the lock cannot.
  await expect(h.exec("git", ["worktree", "remove", h.path])).rejects.toThrow(/locked/u);
  await h.exec("git", ["worktree", "unlock", h.path]);
  await h.exec("git", ["worktree", "remove", h.path]);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(`worktree ${h.path}\n`);
});

it.each([true, false])("before the flip, the stale sweep keeps a shipped work unit's typed teardown under the projection's lock, "
  + "and names the unlock for an unshipped one (shipped=%s)", async (shipped) => {
  const h = await missingCheckout("feat/done", PROJECTION_LOCK_REASON);
  const reports = await readMissingWorktreeFolders({ exec: h.exec, rows: h.rows, shipped: new Set(shipped ? ["done"] : []) });
  expect(reports).toEqual([{ worktreePath: h.path, branch: "feat/done", outcome: "missing", actions: [shipped
    ? { argv: ["arc", "teardown", "done"], text: "arc teardown done" } : { text: unlockThenRemove(h.path) }] }]);
});

it.each(["created", "adopted"] as const)("from the flip, the stale sweep keeps typed teardown for a branch its ended work unit "
  + "created under the projection's lock, and names the unlock for one it adopted (%s)", async (linkedAs) => {
  const h = await missingCheckout("topic/ended", PROJECTION_LOCK_REASON);
  const store = createLifecycleHarness();
  await store.seedMeta("ended", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository: "project", ref: "topic/ended", linkedAs, excluded: [] }] });
  const reports = await readMissingWorktreeFolders({ store: store.store, projectId: async () => "project", exec: h.exec, rows: h.rows,
    shipped: new Set() });
  expect(reports).toEqual([{ worktreePath: h.path, branch: "topic/ended", outcome: "missing", actions: [linkedAs === "created"
    ? { argv: ["arc", "teardown", "ended"], text: "arc teardown ended" } : { text: unlockThenRemove(h.path) }] }]);
});

it.each([undefined, "provisioning-tool"])("keeps the remedies of an unlocked registration and one another tool locked (lock %s)", async (lock) => {
  const h = await missingCheckout("feat/done", lock);
  const unlock = lock === undefined ? "" : `its lock's owner may run git worktree unlock '${h.path}', then `;
  const guarded = (repair: string) => ({ text: `After confirming the folder is still missing, ${unlock}${repair}.` });
  const outcome = lock === undefined ? "missing" : "locked";
  const recovery = await runBranchGoneRecovery({ derivedRoster: h.rows, exec: h.exec, currentBranch: "feat/gone", baseBranch: "main",
    recentBranches: [], roster: { entries: [{ worktreePath: h.path, branch: "feat/done" }], warnings: [] } });
  expect(recovery.missingFolders?.[0]?.actions).toEqual([guarded(`git worktree remove '${h.path}'`)]);
  expect(await readMissingWorktreeFolders({ exec: h.exec, rows: h.rows, shipped: new Set() }))
    .toEqual([{ worktreePath: h.path, branch: "feat/done", outcome, actions: [guarded(`git worktree remove '${h.path}'`)] }]);
  expect(await readMissingWorktreeFolders({ exec: h.exec, rows: h.rows, shipped: new Set(["done"]) }))
    .toEqual([{ worktreePath: h.path, branch: "feat/done", outcome, actions: [lock === undefined
      ? { argv: ["arc", "teardown", "done"], text: "arc teardown done" } : guarded("arc teardown done")] }]);
});
