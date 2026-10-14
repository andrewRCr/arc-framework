/** Collaboration, materialization and terminal cleanup share one checked owner. */
import { expect, it } from "vitest";
import { createRetirementHarness, retirementLink } from "../../helpers/store/retirement-harness.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { runPause, runHandover } from "../../../src/lib/work-unit/verbs/pause-handover.js";
import { runMaterialize } from "../../../src/lib/work-unit/verbs/materialize.js";
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { runArchive } from "../../../src/lib/work-unit/verbs/archive.js";
import { runTeardown } from "../../../src/lib/work-unit/verbs/teardown.js";
import { reconcileWorkUnitWorktree, nodeReconcileWorkUnitWorktreeFs } from "../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { ParsedMetaRecordSchema } from "../../../src/lib/active/meta-schema.js";
import type { WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import type { LocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import type { ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
async function fixture(linkedAs: "created" | "adopted" = "created") {
  const h = await createRetirementHarness({ ended: false, held: false, state: "Active", branches: [retirementLink("feat/demo", linkedAs)] });
  let marker: WorktreeMarker | null = null;
  const commands: string[][] = [], original = h.ctx.exec;
  const exec: GitExec = (command, args, options) => {
    commands.push(args);
    const normalized = args[0] === "--no-replace-objects" ? args.slice(1) : args;
    if (normalized[0] === "rev-parse" && normalized[1] === "--show-toplevel") return Promise.resolve({ stdout: "/repo" });
    // The repository script owns Git state; checkout and switch have the same attached result.
    return original(command, normalized[0] === "checkout" ? ["switch", ...normalized.slice(1)] : normalized, options);
  };
  const locusPorts: LocusPorts = {
    checkMarkerExclusivity: async () => ({ kind: "clear" }),
    findHoldingCheckout: async ({ name }) => marker?.createdFor?.kind === "work-unit" && marker.createdFor.name === name ? "/repo" : null,
    writeAnchoredMarker: async (_cwd, value) => { marker = value; return { kind: "created", bytes: Buffer.from(JSON.stringify(value)) }; },
  };
  h.ctx.exec = exec;
  h.ctx.readMarker = async () => marker === null ? { kind: "absent" } : { kind: "present", marker };
  h.ctx.worktreeFs = { ...h.ctx.worktreeFs!, removeFile: async () => { marker = null; } };
  const forbidden = async (): Promise<never> => { throw new Error("No tracked lifecycle artifact path applies"); };
  const executor: ExecuteTransitionContext = {
    cwd: "/repo", store: h.store, exec, projectId: async () => "repo", locusPorts, indexFs: h.ctx.indexFs,
    guardValidators: { "worktree-occupancy": () => ({ ok: true }) }, setPhase: forbidden, relocateArtifacts: forbidden,
    reconcileBranch: forbidden, reconcileWorkUnitWorktree: (operation) => reconcileWorkUnitWorktree({
      exec, store: h.store, locusPorts, fs: nodeReconcileWorkUnitWorktreeFs, chdir: () => { throw new Error("Anchored placement must not hop"); },
    }, operation),
    writeSoftFields: forbidden, writeBranchField: forbidden, writeCurrentWorkflowField: forbidden, writeDesignField: forbidden,
  };
  return { ...h, executor, exec, locusPorts, commands, marker: () => marker,
    read: () => h.store.read({ reference: h.meta.reference }).then(lifecycleSuccess) };
}
it("pauses, hands over and materializes the same owner before abandoning it and retrying its teardown", async () => {
  const h = await fixture(), collaboration = { store: h.store, cwd: "/repo", exec: h.exec, baseBranch: "main", projectId: async () => "repo", locusPorts: h.locusPorts,
    now: () => new Date("2026-10-14T00:00:00Z") };
  expect(await runPause(collaboration, { name: "demo", identity: "test-user", reason: "Wait for review.", resumeNotes: "Read the review." })).toMatchObject({ status: "paused", report: { origin: "refreshed", unsharedCommits: [] } });
  const paused = await h.read();
  expect(await runHandover(collaboration, { name: "demo", to: "next-user" })).toMatchObject({ status: "handed-over", previousOwner: "test-user", owner: "next-user" });
  const handed = await h.read(); expect(handed.reference).toEqual(h.meta.reference); expect(handed.placement).toEqual(paused.placement); expect(handed.links).toEqual(paused.links);
  expect(handed.fields).toMatchObject({ owner: "next-user", state: "Active", currentWorkflow: "process-task-loop", pause: { pausedBy: "test-user", reason: "Wait for review.", resumeNotes: "Read the review." } });
  expect(ParsedMetaRecordSchema.parse(handed.fields).pause).toEqual(ParsedMetaRecordSchema.parse(paused.fields).pause);
  expect(await runMaterialize(h.executor, { name: "demo", baseBranch: "main", inPlace: true, identity: "next-user", spawningIdentity: "next-user" })).toMatchObject({ status: "materialized", branch: "feat/demo", worktreePath: "/repo" });
  expect(await h.read()).toEqual(handed); expect(h.marker()).toMatchObject({ wuName: "demo", spawnedByArc: false, spawningIdentity: "next-user" });
  expect(h.commands).toContainEqual(["checkout", "feat/demo"]);
  expect(await runStoreAbandon({ executor: h.executor, baseBranch: "main", storeTeardown: h.ctx,
    removal: { exec: h.exec, readMarker: h.ctx.readMarker, folderExists: async () => true } }, { name: "demo", confirmed: true })).toMatchObject({ status: "abandoned", outcome: { status: "ok" } });
  expect(await h.store.read({ reference: h.meta.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const reference = recordReferences["lineage/transition"](h.meta.reference.owner), terminal = lifecycleSuccess(await h.store.read({ reference }));
  expect(terminal.reference.owner).toEqual(h.meta.reference.owner); expect(terminal.fields).toMatchObject({ kind: "abandon", retiredBranches: handed.links?.branches });
  expect(h.marker()).toBeNull(); expect(h.state().current).toBe("main"); expect(h.refs.has("refs/heads/feat/demo")).toBe(false); expect(h.refs.has("remote/feat/demo")).toBe(false);
  expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: false, remoteBranchDeleted: false });
  expect(lifecycleSuccess(await h.store.read({ reference }))).toEqual(terminal);
});
it.each(["created", "adopted"] as const)("archives the same owner then tears down by its %s link without rewriting the completed record", async (linkedAs) => {
  const h = await fixture(linkedAs);
  expect(await runArchive({ executor: h.executor, fs: { readdir: async () => { throw new Error("No quarter folder scan"); } },
    clock: () => new Date("2026-10-14T00:00:00Z") }, { name: "demo" })).toMatchObject({ status: "archived", destination: { quarter: "2026-q4", sequence: "01" } });
  const archived = await h.read(); expect(archived.reference).toEqual(h.meta.reference); expect(archived.placement).toMatchObject({ kind: "completed", quarter: "2026-q4", sequence: "01" });
  const result = await runTeardown(h.ctx, { name: "demo", base: "main" });
  expect(result).toMatchObject({ status: "torn-down", branchDeleted: linkedAs === "created", remoteBranchDeleted: linkedAs === "created" });
  expect(h.refs.has("refs/heads/feat/demo")).toBe(linkedAs === "adopted"); expect(h.refs.has("remote/feat/demo")).toBe(linkedAs === "adopted");
  expect(await h.read()).toEqual(archived);
});
