/** Detached Planning checkout catch-up belongs to the base handler, outside the shared Git synchronizer. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPlanningBaseSync } from "../../../src/handlers/base-sync-planning.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { BaseSyncResult } from "../../../src/lib/git/base-sync.js";
const base = "a".repeat(40), ahead = "b".repeat(40), next = "c".repeat(40);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(options: { branch?: string; commits?: string[]; result?: BaseSyncResult } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-planning-sync-")); roots.push(cwd);
  const h = createLifecycleHarness(); await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" });
  await writeWorktreeMarker(cwd, { spawnedByArc: true, wuName: "demo", createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00.000Z" });
  let head = options.commits?.length ? ahead : base; let synced = false;
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "symbolic-ref") { if (options.branch === undefined) throw makeGitProcessError({ command: "git", args, exitCode: 1 }); return { stdout: options.branch }; }
    if (args[0] === "rev-parse") return { stdout: args.at(-1) === "HEAD" ? head : base };
    if (args[0] === "rev-list") return { stdout: (options.commits ?? []).join("\n") };
    if (args[0] === "switch" && args[1] === "--detach") { head = args[2] ?? ""; return { stdout: "" }; }
    throw Error(`unexpected Git operation ${args.join(" ")}`);
  };
  const result: BaseSyncResult = options.result ?? { status: "updated", base: "main", from: base, to: next, worktreePath: "/base", method: "checked-out" };
  return { cwd, store: h.store, exec, sync: () => { synced = true; return Promise.resolve(result); }, state: () => ({ head, synced }) };
}
describe("detached Planning base sync", () => {
  it.each(["updated", "unchanged"] as const)("re-detaches at base after a %s sync", async (status) => {
    const h = await fixture({ result: status === "updated" ? undefined : { status: "unchanged", base: "main", at: next } });
    expect(await runPlanningBaseSync({ ...h, baseBranch: "main" })).toMatchObject({ status });
    expect(h.state()).toEqual({ head: next, synced: true });
  });
  it("refuses stray commits before sync and names how to preserve them", async () => {
    const h = await fixture({ commits: [ahead] });
    expect(await runPlanningBaseSync({ ...h, baseBranch: "main" })).toMatchObject({ status: "refused", commits: [ahead], remedy: { text: expect.stringContaining("git switch -c <name>") } });
    expect(h.state()).toEqual({ head: ahead, synced: false });
  });
  it("keeps HEAD unchanged on a refused sync", async () => {
    const h = await fixture({ result: { status: "refused", base: "main", reason: "fetch-failed" } });
    expect(await runPlanningBaseSync({ ...h, baseBranch: "main" })).toMatchObject({ status: "refused", reason: "fetch-failed" });
    expect(h.state().head).toBe(base);
  });
  it("keeps a branched checkout on its HEAD after a successful sync", async () => {
    const h = await fixture({ branch: "person", commits: [ahead] });
    expect(await runPlanningBaseSync({ ...h, baseBranch: "main" })).toMatchObject({ status: "updated" });
    expect(h.state()).toEqual({ head: ahead, synced: true });
  });
});
