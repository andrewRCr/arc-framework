/** Cleanup selection follows store placement, preserving exact remote removal admission. */
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { LineageRecordSchema } from "../../../src/lib/store/kinds/lineage/index.js";
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
async function options(store: NonNullable<RunStaleWorktreeSweepOptions["store"]>, subject: ReturnType<typeof boundWorkUnitSubject> | undefined, merged = true, spawned = true): Promise<RunStaleWorktreeSweepOptions> {
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
    readMarker: async () => ({ kind: "present", marker: { spawnedByArc: spawned, wuName: "done", createdFor: subject ?? { kind: "work-unit", name: "done" }, spawningIdentity: "someone-else", createdAt: "2026-10-14T00:00:00Z" } }) });
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

it("reports a detached pending rename through the enclosing sweep, withholding a stale HEAD until repaired", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("new-name", { state: "Planning", currentWorkflow: "draft-design" });
  const pending = { oldSlug: "old-name", newSlug: "new-name", branch: null, head, from: checkout.path, to: "/new-checkout" };
  const original = await options(h.store, boundWorkUnitSubject(primary));
  const input = await withDerivedRows({ ...original, readMarker: async () => ({ kind: "present", marker: {
    spawnedByArc: true, wuName: "new-name", createdFor: boundWorkUnitSubject(primary),
    spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00Z", renameMovePending: pending,
  } }) });
  const result = await runStaleWorktreeSweep(input);
  expect(result.renameMoves).toEqual([{ ...pending, remedy: {
    argv: ["git", "worktree", "move", "-f", "-f", checkout.path, pending.to],
    text: expect.stringContaining("from outside the checkout"),
  }, actions: [expect.objectContaining({ argv: ["git", "worktree", "move", "-f", "-f", checkout.path, pending.to] })] }]);
  expect(result.worktrees).toEqual([]);
  expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
  const stale = await withDerivedRows({ ...input, scanWorktrees: async () => ({ ok: true, worktrees: [{ ...checkout, head: "c".repeat(40) }] }) });
  expect((await runStaleWorktreeSweep(stale)).renameMoves).toEqual([]);
  expect((await runStaleWorktreeSweep(input)).renameMoves).toEqual(result.renameMoves);
});

it("withholds conflicted lifecycle and cleanup authority after sync and restores the resolved Planning record", async () => {
  const h = await conflictedPrimary(), disputed = lifecycleSuccess(await h.store.read({ reference: h.initial.reference }));
  expect(disputed.conflicts).toHaveLength(1);
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  expect(listing).toMatchObject({ status: "complete", missed: true, diagnostics: [expect.objectContaining({ condition: expect.stringContaining("conflicts") })] });
  if (listing.status !== "complete") throw new Error("No lifecycle inventory");
  expect(listing.index.entries()).toEqual([]);
  expect(() => requireCompleteInventory(h.store, listing)).toThrow(/resolve.*retry/iu);
  const sweep = await runStaleWorktreeSweep(await options(h.store, boundWorkUnitSubject(h.initial)));
  expect(sweep.worktrees).toEqual([]);
  for (const conflict of disputed.conflicts) expect(sweep.warnings.join(" ")).toContain(JSON.stringify(conflict));
  await h.resolve();
  expect(lifecycleSuccess(await h.store.read({ reference: h.initial.reference })).conflicts).toEqual([]);
  expect(await runStaleWorktreeSweep(await options(h.store, boundWorkUnitSubject(h.initial)))).toMatchObject({ worktrees: [], warnings: [] });
});

it("refuses a fresh primary conflict introduced after the complete inventory was acquired, then retries after resolution", async () => {
  const h = await conflictedPrimary(false), original = await options(h.store, boundWorkUnitSubject(h.initial)), marker = await original.readMarker?.(checkout.path);
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
  const h = createLifecycleHarness(); const primary = await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const result = await runStaleWorktreeSweep(await options(h.store, boundWorkUnitSubject(primary), merged));
  expect(result.worktrees).toHaveLength(1); expect(result.worktrees[0]).toMatchObject({ kind: "detached", workUnit: "done", branch: null,
    decision: merged ? { action: "removable" } : { action: "blocked", reason: "unmerged" } });
  expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
});
it("offers release for a foreign marked checkout despite the marker's spawning identity", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("done", { state: "Planning", currentWorkflow: "draft-design", owner: "foreign" });
  expect((await runStaleWorktreeSweep(await options(h.store, boundWorkUnitSubject(primary)))).worktrees[0]?.actions?.[0])
    .toEqual({ text: "arc locus release", argv: ["arc", "locus", "release"], checkout: "/checkout" });
});
it.each([true, false])("offers release for a marked checkout with no work-unit record (spawned=%s)", async spawned => {
  const h = createLifecycleHarness(), input = await options(h.store, undefined, true, spawned);
  if (!spawned) {
    expect(input.derivedRoster?.[0]).toMatchObject({ diagnostics: [{ code: "work-unit-marker-unbound" }],
      actions: [{ argv: ["arc", "start", "done", "--new", "--here"], checkout: "/checkout" },
        { argv: ["arc", "locus", "release"], checkout: "/checkout" }] });
  }
  expect((await runStaleWorktreeSweep(input)).worktrees[0]?.actions).toMatchObject([
    ...(!spawned ? [{ argv: ["arc", "start", "done", "--new", "--here"], checkout: "/checkout" }] : []),
    { argv: ["arc", "locus", "release"], checkout: "/checkout" },
  ]);
});
it("withholds duplicate anchored cold-start releases and offers release after only one marker remains", async () => {
  const h = createLifecycleHarness(), original = await options(h.store, undefined, true, false);
  const duplicate = await withDerivedRows({ ...original, scanWorktrees: async () => ({ ok: true, worktrees: [checkout, { ...checkout, path: "/stray" }] }) });
  const blocked = await runStaleWorktreeSweep(duplicate);
  expect(blocked.worktrees).toEqual([]);
  expect(blocked.warnings.join(" ")).toMatch(/multiple marker holders.*release the stray checkout/iu);
  const repaired = await runStaleWorktreeSweep(await options(h.store, undefined, true, false));
  expect(repaired.worktrees[0]?.actions).toMatchObject([
    { argv: ["arc", "start", "done", "--new", "--here"], checkout: "/checkout" },
    { argv: ["arc", "locus", "release"], checkout: "/checkout" },
  ]);
  expect(repaired.warnings).toEqual([]);
});
it("preserves the physical-removal remote gate for ended store records", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const input = await options(h.store, boundWorkUnitSubject(primary)); input.baseEvidence = { remoteSyncEnabled: false, snapshot: { kind: "unreachable", failureReason: "network" }, objectAvailability: { kind: "complete", commits: {} }, history: { kind: "complete" } };
  expect((await runStaleWorktreeSweep(input)).worktrees[0]?.decision).toEqual({ action: "blocked", reason: "evidence-unavailable" });
});

it("keeps a branchless abandoned checkout in no-record release selection", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("done");
  const exec = async () => { throw new Error("No Git lifecycle artifact applies"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: h.store, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) } });
  expect(await runStoreAbandon({ executor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  const result = await runStaleWorktreeSweep(await options(h.store, boundWorkUnitSubject(primary)));
  expect(result.worktrees[0]).toMatchObject({ kind: "detached", actions: [{ argv: ["arc", "locus", "release"], checkout: "/checkout" }] });
  expect(result.retirements).toEqual([]);
});

it("withholds a missing-primary release after lineage becomes disputed and retries after resolution", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("done", {}, { kind: "active" }, { branches: [{ repository: "project", ref: "feat/done", linkedAs: "created", excluded: [] }] });
  const exec = async () => { throw new Error("No Git lifecycle artifact applies"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: h.store, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) } });
  expect(await runStoreAbandon({ executor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  const input = await options(h.store, boundWorkUnitSubject(primary)), reference = recordReferences["lineage/transition"](primary.reference.owner);
  const initial = lifecycleSuccess(await h.store.read({ reference })), fields = LineageRecordSchema.parse(initial.fields);
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  lifecycleSuccess(await writer.write({ action: "put", reference: primary.reference, expected: null, content: primary.content,
    placement: { kind: "active" }, links: { branches: (fields.retiredBranches ?? []).map(link => ({ ...link, excluded: [{ repository: link.repository, sha: base }] })) },
    provenance: { verb: "seed-lifecycle", lifecycleAction: "create" } }));
  const remoteExecutor = buildExecutorContext({ cwd: "/absent", store: writer, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) } });
  expect(await runStoreAbandon({ executor: remoteExecutor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const selected = await selectStoreWorktreeCleanup({ store: h.store, topology: [checkout], derivedRoster: input.derivedRoster ?? [],
    readMarker: path => input.readMarker!(path), identity: "test-user" });
  expect(selected).toMatchObject({ ended: [], releases: [] });
  for (const conflict of disputed.conflicts) expect(selected.warnings.join(" ")).toContain(JSON.stringify(conflict));
  expect(selected.warnings.join(" ")).toMatch(/resolve.*retry/iu);
  for (const reference of disputed.conflicts) {
    const conflict = lifecycleSuccess(await h.store.read({ reference }));
    lifecycleSuccess(await h.store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference],
      provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  }
  expect((await runStaleWorktreeSweep(await options(h.store, boundWorkUnitSubject(primary)))).worktrees[0]?.actions?.[0]?.argv)
    .toEqual(["arc", "locus", "release"]);
});

it.each(["completed", "foreign", "missing"] as const)("withholds cleanup and release for duplicate %s holders, then retries after releasing the stray claim", async state => {
  const h = createLifecycleHarness();
  let primary;
  if (state === "completed") primary = await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  if (state === "foreign") primary = await h.seedMeta("done", { state: "Planning", currentWorkflow: "draft-design", owner: "foreign" });
  const original = await options(h.store, primary === undefined ? undefined : boundWorkUnitSubject(primary));
  const duplicate = await withDerivedRows({ ...original, scanWorktrees: async () => ({ ok: true, worktrees: [checkout, { ...checkout, path: "/stray" }] }) });
  expect(duplicate.derivedRoster?.every(row => row.kind === "unresolved-checkout")).toBe(true);
  const result = await runStaleWorktreeSweep(duplicate);
  expect(result.worktrees).toEqual([]);
  expect(result.warnings.join(" ")).toMatch(/multiple marker holders.*release the stray checkout/iu);
  expect(result.warnings.join(" ")).toContain(checkout.path);
  expect(result.warnings.join(" ")).toContain("/stray");
  const repaired = await runStaleWorktreeSweep(await options(h.store, primary === undefined ? undefined : boundWorkUnitSubject(primary)));
  expect(repaired.worktrees).toHaveLength(1);
  expect(repaired.worktrees[0]).toMatchObject(state === "completed" ? { decision: { action: "removable" } }
    : { actions: [{ argv: ["arc", "locus", "release"], checkout: "/checkout" }] });
});

it("withholds the branched abandonment retirement offer for duplicate holders, then restores it for the sole holder", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const path = await mkdtemp(join(tmpdir(), "arc-retired-holder-"));
  try {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("done", {}, { kind: "active" }, { branches: [{ repository: "project", ref: "feat/done", linkedAs: "created", excluded: [] }] });
  const exec = async () => { throw new Error("No Git lifecycle artifact applies"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: h.store, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) } });
  expect(await runStoreAbandon({ executor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  const original = await options(h.store, boundWorkUnitSubject(primary)), branched = { ...checkout, path, branch: "feat/done", detached: false };
  const input = { ...original, projectId: async () => "project", scanWorktrees: async () => ({ ok: true as const, worktrees: [branched, { ...checkout, path: "/stray" }] }) };
  const duplicate = await withDerivedRows(input);
  expect(duplicate.derivedRoster?.every(row => row.kind === "unresolved-checkout")).toBe(true);
  expect((await runStaleWorktreeSweep(duplicate)).retirements).toEqual([]);
  const repaired = await withDerivedRows({ ...input, scanWorktrees: async () => ({ ok: true, worktrees: [branched] }) });
  expect((await runStaleWorktreeSweep(repaired)).retirements).toMatchObject([{ status: "actionable", teardown: { argv: ["arc", "teardown", boundWorkUnitSubject(primary).uid] } }]);
  } finally { await rm(path, { recursive: true, force: true }); }
});


it.each([false, true])("offers only the archived holder's teardown beside live work (detached=%s)", async detached => {
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("done", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("done"), before = lifecycleSuccess(await h.store.version());
  const original = await options(h.store, boundWorkUnitSubject(archived));
  const ended = { ...checkout, branch: detached ? null : "feat/archived", detached };
  const liveCheckout = { ...checkout, path: "/live", branch: "feat/live", detached: false };
  const input = await withDerivedRows({ ...original,
    exec: async (command, args, opts) => args[0] === "cherry" ? { stdout: "" } : original.exec(command, args, opts),
    scanWorktrees: async () => ({ ok: true, worktrees: [ended, liveCheckout] }),
    readMarker: async path => ({ kind: "present", marker: { spawnedByArc: true, wuName: "done",
      createdFor: boundWorkUnitSubject(path === "/live" ? live : archived), spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00Z" } }),
  });
  const result = await runStaleWorktreeSweep(input);
  const teardown = { argv: ["arc", "teardown", archived.reference.owner.type !== "person" ? archived.reference.owner.uid : undefined],
    text: `arc teardown ${archived.reference.owner.type !== "person" ? archived.reference.owner.uid : undefined}` };
  expect(result.warnings).toEqual([]);
  expect(result.worktrees).toEqual([expect.objectContaining({ worktreePath: "/checkout", kind: detached ? "detached" : "branched",
    decision: { action: "removable" }, teardown, actions: [teardown] })]);
  expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
