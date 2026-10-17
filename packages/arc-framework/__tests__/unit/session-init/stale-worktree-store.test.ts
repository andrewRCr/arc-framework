/** Cleanup selection follows store placement, preserving exact remote removal admission. */
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { listLifecycleIndex } from "../../../src/lib/store/lifecycle-index.js";
import { requireCompleteInventory } from "../../../src/lib/store/lifecycle-storage.js";
import { selectStoreWorktreeCleanup } from "../../../src/lib/session-init/store-worktree-selection.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { runStaleWorktreeSweep, type RunStaleWorktreeSweepOptions } from "../../../src/lib/session-init/stale-worktree-sweep.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { acquireDerivedLocusEvidence, type DerivedLocusEvidenceIO } from "../../../src/lib/locus/derived-evidence.js";
import { readDerivedLocusRoster } from "../../../src/lib/locus/derived-reader.js";
import type { SubjectMetaIO } from "../../../src/lib/locus/subject-meta.js";
const base = "a".repeat(40), head = "b".repeat(40);
const checkout = { path: "/checkout", branch: null, head, detached: true, primary: false, folderPresent: true };
async function options(store: NonNullable<RunStaleWorktreeSweepOptions["store"]>, merged = true): Promise<RunStaleWorktreeSweepOptions> {
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "worktree") return { stdout: worktreePorcelainZ(`worktree /primary\nHEAD ${base}\nbranch refs/heads/main`) };
    if (args[0] === "cherry") { expect(args).toEqual(["cherry", base, head]); return { stdout: merged ? "" : `+ ${head}\n` }; }
    if (args[0] === "status") return { stdout: "" };
    throw new Error(`Unexpected Git ${args.join(" ")}`);
  };
  return withDerivedRows({ store, exec, roster: { entries: [], warnings: [] }, derivedRoster: [], worktreeIdentity: { kind: "primary" }, identity: "test-user", teamMode: true,
    baseBranch: "main", baseEvidence: { remoteSyncEnabled: true, snapshot: { kind: "available", scope: "all-heads", tips: { main: base } }, objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" } },
    readBlob: async () => null, scanWorktrees: async () => ({ ok: true, worktrees: [checkout] }), folderExists: async () => true,
    userSurfaceFs: { readDir: async () => [], readFile: async () => "", writeFile: async () => {}, mkdir: async () => {} },
    readMarker: async () => ({ kind: "present", marker: { spawnedByArc: true, wuName: "done", createdFor: { kind: "work-unit", name: "done" }, spawningIdentity: "someone-else", createdAt: "2026-10-14T00:00:00Z" } }) });
}

async function withDerivedRows(input: RunStaleWorktreeSweepOptions): Promise<RunStaleWorktreeSweepOptions> {
  if (!input.store || !input.scanWorktrees || !input.readMarker) throw new Error("Missing evidence bindings");
  const readMarker = input.readMarker, scanWorktrees = input.scanWorktrees;
  const io: DerivedLocusEvidenceIO = { store: input.store, projectId: async () => "project", archiveCadence: "manual",
    scanWorktrees: () => scanWorktrees(input.exec), canonicalizePath: async path => path,
    readMarker: async path => {
      const read = await readMarker(path);
      return read.kind === "present" ? { ...read, bytes: Buffer.from(JSON.stringify(read.marker)) } : read;
    },
    listDirectory: async () => { throw new Error("No checkout state"); }, readText: async () => { throw new Error("No checkout state"); },
    readArchivedMeta: async () => ({ kind: "absent" }), readIdentities: async () => ({ kind: "absent" }),
    readCompleted: async () => ({ status: "available", records: new Map() }), readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true }) };
  const subjectMetaIO: SubjectMetaIO = {
    readFile: async () => { throw new Error("No checkout state"); }, pathExists: async () => false,
    realpath: async path => path, lstat: async () => ({ isSymbolicLink: () => false }),
    projectCandidateTarget: async () => { throw new Error("No Candidate"); },
    readPendingCandidateReviewFixAuthority: async () => ({ status: "none" }), projectDeliveryCorrection: async () => ({ status: "none" }) };
  const evidence = await acquireDerivedLocusEvidence({ identity: "test-user", io });
  if (evidence.kind !== "complete") throw new Error("Missing topology");
  const derived = await readDerivedLocusRoster({ ...evidence, store: input.store, identity: "test-user", canonicalizePath: async path => path, subjectMetaIO });
  return { ...input, derivedRoster: derived.rows };
}

async function conflictedPrimary(publish = true) {
  const h = createLifecycleHarness(), initial = await h.seedMeta("done", { state: "Planning", currentWorkflow: "draft-design" });
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const other = lifecycleSuccess(await writer.read({ reference: initial.reference }));
  const localContent = initial.content + "\nLocal work\n", provenance = { verb: "update", lifecycleAction: "update" };
  lifecycleSuccess(await h.store.write({ action: "put", reference: initial.reference, expected: initial.version,
    placement: { kind: "active" }, content: localContent, provenance }));
  lifecycleSuccess(await writer.write({ action: "put", reference: initial.reference, expected: other.version,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    content: renderMetaFile("done", { state: "Shipped", owner: "test-user", currentWorkflow: null }), provenance }));
  const sync = async () => { lifecycleSuccess(await h.store.sync()); };
  if (publish) await sync();
  const resolve = async () => {
    const disputed = lifecycleSuccess(await h.store.read({ reference: initial.reference }));
    lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
      resolves: disputed.conflicts, placement: { kind: "active" }, content: localContent, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  };
  return { ...h, initial, sync, resolve };
}

it("withholds conflicted lifecycle and cleanup authority after sync and restores the resolved Planning record", async () => {
  const h = await conflictedPrimary(), disputed = lifecycleSuccess(await h.store.read({ reference: h.initial.reference }));
  expect(disputed.conflicts).toHaveLength(1);
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  expect(listing).toMatchObject({ status: "complete", missed: true, diagnostics: [expect.objectContaining({ condition: expect.stringContaining("conflicts") })] });
  if (listing.status !== "complete") throw new Error("No lifecycle inventory");
  expect(listing.index.entries()).toEqual([]);
  expect(() => requireCompleteInventory(h.store, listing)).toThrow(/resolve.*retry/iu);
  const sweep = await runStaleWorktreeSweep(await options(h.store));
  expect(sweep.worktrees).toEqual([]);
  for (const conflict of disputed.conflicts) expect(sweep.warnings.join(" ")).toContain(JSON.stringify(conflict));
  await h.resolve();
  expect(lifecycleSuccess(await h.store.read({ reference: h.initial.reference })).conflicts).toEqual([]);
  expect(await runStaleWorktreeSweep(await options(h.store))).toMatchObject({ worktrees: [], warnings: [] });
});

it("refuses a fresh primary conflict introduced after the complete inventory was acquired, then retries after resolution", async () => {
  const h = await conflictedPrimary(false), original = await options(h.store), marker = await original.readMarker?.(checkout.path);
  if (!marker) throw new Error("No marker");
  let pendingSync = true;
  const input = { store: h.store, topology: [checkout], derivedRoster: original.derivedRoster ?? [], identity: "test-user", readMarker: async () => {
    if (pendingSync) { pendingSync = false; await h.sync(); }
    return marker;
  } };
  const selected = await selectStoreWorktreeCleanup(input);
  expect(selected).toMatchObject({ ended: [], releases: [], warnings: [expect.stringMatching(/conflicts.*resolve.*retry/iu)] });
  const disputed = lifecycleSuccess(await h.store.read({ reference: h.initial.reference }));
  for (const conflict of disputed.conflicts) expect(selected.warnings.join(" ")).toContain(JSON.stringify(conflict));
  await h.resolve();
  expect(await selectStoreWorktreeCleanup(input)).toEqual({ ended: [], releases: [], warnings: [] });
});
it.each([true, false])("reports an ended branchless checkout and tests its HEAD for landing (%s)", async (merged) => {
  const h = createLifecycleHarness(); await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const result = await runStaleWorktreeSweep(await options(h.store, merged));
  expect(result.worktrees).toHaveLength(1); expect(result.worktrees[0]).toMatchObject({ kind: "detached", workUnit: "done", branch: null,
    decision: merged ? { action: "removable" } : { action: "blocked", reason: "unmerged" } });
  expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
});
it("offers release for a foreign marked checkout despite the marker's spawning identity", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("done", { state: "Planning", currentWorkflow: "draft-design", owner: "foreign" });
  expect((await runStaleWorktreeSweep(await options(h.store))).worktrees[0]?.actions?.[0]?.argv).toEqual(["arc", "locus", "release", "done"]);
});
it("offers release for a marked checkout with no work-unit record", async () => {
  const h = createLifecycleHarness(); expect((await runStaleWorktreeSweep(await options(h.store))).worktrees[0]?.actions?.[0]?.argv).toEqual(["arc", "locus", "release", "done"]);
});
it("preserves the physical-removal remote gate for ended store records", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const input = await options(h.store); input.baseEvidence = { remoteSyncEnabled: false, snapshot: { kind: "unreachable", failureReason: "network" }, objectAvailability: { kind: "complete", commits: {} }, history: { kind: "complete" } };
  expect((await runStaleWorktreeSweep(input)).worktrees[0]?.decision).toEqual({ action: "blocked", reason: "evidence-unavailable" });
});

it("keeps a branchless abandoned checkout in no-record release selection", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("done");
  const exec = async () => { throw new Error("No Git lifecycle artifact applies"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: h.store, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null } });
  expect(await runStoreAbandon({ executor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  const result = await runStaleWorktreeSweep(await options(h.store));
  expect(result.worktrees[0]).toMatchObject({ kind: "detached", actions: [{ argv: ["arc", "locus", "release", "done"] }] });
  expect(result.retirements).toEqual([]);
});

it.each(["completed", "foreign", "missing"] as const)("withholds cleanup and release for duplicate %s holders, then retries after releasing the stray claim", async state => {
  const h = createLifecycleHarness();
  if (state === "completed") await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  if (state === "foreign") await h.seedMeta("done", { state: "Planning", currentWorkflow: "draft-design", owner: "foreign" });
  const original = await options(h.store);
  const duplicate = await withDerivedRows({ ...original, scanWorktrees: async () => ({ ok: true, worktrees: [checkout, { ...checkout, path: "/stray" }] }) });
  expect(duplicate.derivedRoster?.every(row => row.kind === "unresolved-checkout")).toBe(true);
  const result = await runStaleWorktreeSweep(duplicate);
  expect(result.worktrees).toEqual([]);
  expect(result.warnings.join(" ")).toMatch(/multiple marker holders.*release the stray checkout/iu);
  expect(result.warnings.join(" ")).toContain(checkout.path);
  expect(result.warnings.join(" ")).toContain("/stray");
  const repaired = await runStaleWorktreeSweep(await options(h.store));
  expect(repaired.worktrees).toHaveLength(1);
  expect(repaired.worktrees[0]).toMatchObject(state === "completed" ? { decision: { action: "removable" } }
    : { actions: [{ argv: ["arc", "locus", "release", "done"] }] });
});

it("withholds the branched abandonment retirement offer for duplicate holders, then restores it for the sole holder", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const path = await mkdtemp(join(tmpdir(), "arc-retired-holder-"));
  try {
  const h = createLifecycleHarness();
  await h.seedMeta("done", {}, { kind: "active" }, { branches: [{ repository: "project", ref: "feat/done", linkedAs: "created", excluded: [] }] });
  const exec = async () => { throw new Error("No Git lifecycle artifact applies"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: h.store, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null } });
  expect(await runStoreAbandon({ executor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  const original = await options(h.store), branched = { ...checkout, path, branch: "feat/done", detached: false };
  const input = { ...original, projectId: async () => "project", scanWorktrees: async () => ({ ok: true as const, worktrees: [branched, { ...checkout, path: "/stray" }] }) };
  const duplicate = await withDerivedRows(input);
  expect(duplicate.derivedRoster?.every(row => row.kind === "unresolved-checkout")).toBe(true);
  expect((await runStaleWorktreeSweep(duplicate)).retirements).toEqual([]);
  const repaired = await withDerivedRows({ ...input, scanWorktrees: async () => ({ ok: true, worktrees: [branched] }) });
  expect((await runStaleWorktreeSweep(repaired)).retirements).toMatchObject([{ status: "actionable", teardown: { argv: ["arc", "teardown", "done"] } }]);
  } finally { await rm(path, { recursive: true, force: true }); }
});
