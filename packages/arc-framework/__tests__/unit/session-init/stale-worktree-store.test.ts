/** Cleanup selection follows store placement, preserving exact remote removal admission. */
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { runStaleWorktreeSweep, type RunStaleWorktreeSweepOptions } from "../../../src/lib/session-init/stale-worktree-sweep.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
const base = "a".repeat(40), head = "b".repeat(40);
const checkout = { path: "/checkout", branch: null, head, detached: true, primary: false, folderPresent: true };
function options(store: RunStaleWorktreeSweepOptions["store"], merged = true): RunStaleWorktreeSweepOptions {
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "worktree") return { stdout: worktreePorcelainZ(`worktree /primary\nHEAD ${base}\nbranch refs/heads/main`) };
    if (args[0] === "cherry") { expect(args).toEqual(["cherry", base, head]); return { stdout: merged ? "" : `+ ${head}\n` }; }
    if (args[0] === "status") return { stdout: "" };
    throw new Error(`Unexpected Git ${args.join(" ")}`);
  };
  return { store, exec, roster: { entries: [], warnings: [] }, derivedRoster: [], worktreeIdentity: { kind: "primary" }, identity: "test-user", teamMode: true,
    baseBranch: "main", baseEvidence: { remoteSyncEnabled: true, snapshot: { kind: "available", scope: "all-heads", tips: { main: base } }, objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" } },
    readBlob: async () => null, scanWorktrees: async () => ({ ok: true, worktrees: [checkout] }), folderExists: async () => true,
    userSurfaceFs: { readDir: async () => [], readFile: async () => "", writeFile: async () => {}, mkdir: async () => {} },
    readMarker: async () => ({ kind: "present", marker: { spawnedByArc: true, wuName: "done", createdFor: { kind: "work-unit", name: "done" }, spawningIdentity: "someone-else", createdAt: "2026-10-14T00:00:00Z" } }) };
}
it.each([true, false])("reports an ended branchless checkout and tests its HEAD for landing (%s)", async (merged) => {
  const h = createLifecycleHarness(); await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const result = await runStaleWorktreeSweep(options(h.store, merged));
  expect(result.worktrees).toHaveLength(1); expect(result.worktrees[0]).toMatchObject({ kind: "detached", workUnit: "done", branch: null,
    decision: merged ? { action: "removable" } : { action: "blocked", reason: "unmerged" } });
  expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
});
it("offers release for a foreign marked checkout despite the marker's spawning identity", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("done", { owner: "foreign" });
  expect((await runStaleWorktreeSweep(options(h.store))).worktrees[0]?.actions?.[0]?.argv).toEqual(["arc", "locus", "release", "done"]);
});
it("offers release for a marked checkout with no work-unit record", async () => {
  const h = createLifecycleHarness(); expect((await runStaleWorktreeSweep(options(h.store))).worktrees[0]?.actions?.[0]?.argv).toEqual(["arc", "locus", "release", "done"]);
});
it("preserves the physical-removal remote gate for ended store records", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const input = options(h.store); input.baseEvidence = { remoteSyncEnabled: false, snapshot: { kind: "unreachable", failureReason: "network" }, objectAvailability: { kind: "complete", commits: {} }, history: { kind: "complete" } };
  expect((await runStaleWorktreeSweep(input)).worktrees[0]?.decision).toEqual({ action: "blocked", reason: "evidence-unavailable" });
});

it("keeps a branchless abandoned checkout in no-record release selection", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("done");
  const exec = async () => { throw new Error("No Git lifecycle artifact applies"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: h.store, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null } });
  expect(await runStoreAbandon({ executor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  const result = await runStaleWorktreeSweep(options(h.store));
  expect(result.worktrees[0]).toMatchObject({ kind: "detached", actions: [{ argv: ["arc", "locus", "release", "done"] }] });
  expect(result.retirements).toEqual([]);
});
