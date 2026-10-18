/** Pulled terminal lineage supplies cleanup authority without Git lifecycle receipts. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { runLandedRetirementSweep } from "../../../src/lib/session-init/lifecycle-residue-sweep.js";
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeLineageRecord, LineageRecordSchema } from "../../../src/lib/store/kinds/lineage/index.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
const base = "a".repeat(40), head = "b".repeat(40);
function checkout(name: string) { return { path: `/${name}`, branch: `topic/${name}`, head, detached: false, primary: false, folderPresent: true }; }
function marker(name: string) { return { kind: "present" as const, marker: { spawnedByArc: true, wuName: name, createdFor: { kind: "work-unit" as const, name }, spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00Z" } }; }
async function abandoned(name = "done") {
  const h = createLifecycleHarness();
  await h.seedMeta(name, {}, { kind: "active" }, { branches: [{ repository: "project", ref: `topic/${name}`, linkedAs: "created", excluded: [] }] });
  const exec = async () => { throw new Error("No Git lifecycle receipt is available"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: h.store, io: { ...createUserIOContext(), exec }, identity: "test-user", teamMode: false,
    internalTemplateDir: "/templates", projectId: async () => "project", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null } });
  const result = await runStoreAbandon({ executor }, { name, confirmed: true });
  expect(result, JSON.stringify(result)).toMatchObject({ status: "abandoned" });
  return h;
}
function run(store: Store, names = ["done"], remote = true) {
  return runLandedRetirementSweep({ store, topology: names.map(checkout), markers: new Map(names.map(name => [`/${name}`, marker(name)])),
    baseBranch: "main", protection: "partial", exec: async () => { throw new Error("No Git lifecycle receipt is available"); }, readBlob: async () => null,
    projectId: async () => "project", checkRemoval: async () => ({ kind: "removable" }),
    baseEvidence: { remoteSyncEnabled: remote, snapshot: { kind: "available", scope: "all-heads", tips: { main: base } }, objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" } } });
}
it("offers teardown from abandonment's retained lineage links without a Git receipt", async () => {
  const h = await abandoned(); expect((await run(h.store)).retirements).toMatchObject([{ status: "actionable", teardown: { argv: ["arc", "teardown", "done"] } }]);
});
it("reports neither a live work unit nor a marker with no lineage as a retirement", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("live"); expect((await run(h.store, ["live", "absent"])).retirements).toEqual([]);
});
it("keeps malformed lineage repair beside a sibling's usable abandonment", async () => {
  const h = await abandoned();
  const primary = await h.seedMeta("broken");
  // This case intentionally constructs historical incomplete evidence; ordinary cases use the terminal production verb.
  await h.store.batch({ provenance: { verb: "abandon", lifecycleAction: "abandon" }, writes: [
    { action: "put", reference: recordReferences["lineage/transition"](primary.reference.owner), expected: null, content: writeLineageRecord({ schemaVersion: 2, origin: { name: primary.reference.owner.name }, kind: "abandon", successors: [], incoming: [] }) },
    { action: "remove", reference: primary.reference, expected: primary.version } ] });
  const result = await run(h.store, ["broken", "done"]);
  const actions = [{ text: expect.stringContaining("retiredBranches") }];
  expect(result.retirements).toMatchObject([{ status: "blocked", repair: expect.stringContaining("retiredBranches"), actions }, { status: "actionable" }]);
  expect(StaleWorktreeSweepResultSchema.parse({ ...result, missingFolders: [], worktrees: [], renameMoves: [] })).toMatchObject({ retirements: [{ actions }, { status: "actionable" }] });
});
it("retains the remote physical-removal gate after valid store abandonment", async () => {
  const h = await abandoned(), result = await run(h.store, ["done"], false);
  expect(result.retirements).toMatchObject([{ status: "blocked", reason: "evidence-unavailable" }]);
  expect(JSON.stringify(result.retirements)).not.toContain('"actions"');
});

it("blocks disputed abandonment lineage and restores teardown after explicit resolution", async () => {
  const h = await abandoned();
  const found = lifecycleSuccess(await h.store.lookup({ kind: "lineage", origin: "done" }));
  const initial = lifecycleSuccess(await h.store.read({ reference: found.reference }));
  const fields = LineageRecordSchema.parse(initial.fields);
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  lifecycleSuccess(await writer.write({ action: "put", reference: recordReferences["work-item/meta"](initial.reference.owner), expected: null,
    content: renderMetaFile("done", { state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop" }),
    placement: { kind: "active" }, links: { branches: (fields.retiredBranches ?? []).map(link => ({ ...link, excluded: [{ repository: link.repository, sha: base }] })) },
    provenance: { verb: "seed-lifecycle", lifecycleAction: "create" } }));
  const executor = buildExecutorContext({ cwd: "/absent", store: writer, io: { ...createUserIOContext(), exec: async () => { throw new Error("No Git lifecycle receipt"); } },
    identity: "test-user", teamMode: false, internalTemplateDir: "/templates", projectId: async () => "project",
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null } });
  expect(await runStoreAbandon({ executor }, { name: "done", confirmed: true })).toMatchObject({ status: "abandoned" });
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference: initial.reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const blocked = await run(h.store);
  expect(blocked.retirements).toMatchObject([{ status: "blocked", reason: "repair-required" }]);
  const item = blocked.retirements[0];
  const repair = item?.status === "blocked" ? item.repair ?? "" : "";
  for (const conflict of disputed.conflicts) expect(repair).toContain(JSON.stringify(conflict));
  expect(repair).toMatch(/resolve.*retry/iu);
  for (const reference of disputed.conflicts) {
    const conflict = lifecycleSuccess(await h.store.read({ reference }));
    lifecycleSuccess(await h.store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference],
      provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  }
  expect((await run(h.store)).retirements).toMatchObject([{ status: "actionable", teardown: { argv: ["arc", "teardown", "done"] } }]);
});
