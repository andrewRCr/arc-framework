/** A patch-equivalent branch may still carry merge-only work absent from base. */
import { expect, it } from "vitest";
import { analyzeOrphanBranchesSnapshot, runOrphanBranchSweep } from "../../../src/lib/session-init/orphan-branch-sweep.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import type { CleanupBaseEvidence } from "../../../src/lib/session-init/cleanup-remote-evidence.js";

const base = "a".repeat(40), branch = "feat/orphan", merge = "b".repeat(40);
const evidence: CleanupBaseEvidence = { remoteSyncEnabled: true,
  snapshot: { kind: "available", scope: "all-heads", tips: { main: base } },
  objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" } };
it.each(["compatibility", "snapshot-run", "snapshot", "store-compatibility", "store-snapshot"] as const)(
  "keeps uncontained merge work through %s and offers deletion once the merge is preserved", async mode => {
    const h = createLifecycleHarness();
    await h.seedMeta("orphan", { owner: "alice" }, { kind: "active" },
      { branches: [{ repository: "project", ref: branch, linkedAs: "created", excluded: [] }] });
    const fake = scriptGitExec([
      { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: `${branch}\0gone\0\n` }] },
      { match: { prefix: ["ls-tree"] }, responses: [{ stdout: "" }] },
      { match: { prefix: ["cherry"] }, responses: [{ stdout: "" }] },
      { match: { prefix: ["rev-list", "--min-parents=2"] }, responses: [{ stdout: `${merge}\n` }, { stdout: "" }] },
    ]);
    const options = { exec: fake.exec, baseBranch: "main", branches: [branch],
      ...(mode.startsWith("store") ? { store: h.store, projectId: async () => "project", identity: "alice",
        claims: { kind: "complete" as const, identities: [], diagnostics: [], missed: false } } : {}) };
    const run = () => mode === "snapshot" ? analyzeOrphanBranchesSnapshot({ ...options, ...evidence })
      : runOrphanBranchSweep({ ...options, worktreeIdentity: { kind: "primary" }, errandBranches: new Set(), derivedRoster: [],
        ...(mode.includes("snapshot") ? { baseEvidence: evidence } : {}) });
    expect((await run()).orphans).toEqual([{ branch, merged: false, shippedWorkUnit: null }]);
    expect((await run()).orphans).toEqual([{ branch, merged: true, shippedWorkUnit: null,
      actions: [{ text: `git branch -D ${branch}`, argv: ["git", "branch", "-D", branch] }] }]);
  });

it.each([false, true])("withholds cleanup when merge inventory fails (exact=%s), then retries after repair", async exact => {
  const fake = scriptGitExec([
    { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: `${branch}\0gone\0\n` }] },
    { match: { prefix: ["ls-tree"] }, responses: [{ stdout: "" }] },
    { match: { prefix: ["cherry"] }, responses: [{ stdout: "" }] },
    { match: { prefix: ["rev-list", "--min-parents=2"] }, responses: [{ failure: { exitCode: 128, stderr: "Merge inventory unavailable" } }, { stdout: "" }] },
  ]);
  const run = () => runOrphanBranchSweep({ exec: fake.exec, baseBranch: "main", worktreeIdentity: { kind: "primary" },
    errandBranches: new Set(), derivedRoster: [], ...(exact ? { baseEvidence: evidence } : {}) });
  await expect(run()).rejects.toThrow(/merge.*repair.*retry/iu);
  expect((await run()).orphans[0]).toMatchObject({ merged: true, actions: [{ argv: ["git", "branch", "-D", branch] }] });
});
