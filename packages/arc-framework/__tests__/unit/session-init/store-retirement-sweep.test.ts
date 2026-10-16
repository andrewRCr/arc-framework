/** Pulled terminal lineage supplies cleanup authority without Git lifecycle receipts. */
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { runLandedRetirementSweep } from "../../../src/lib/session-init/lifecycle-residue-sweep.js";
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import type { Store } from "../../../src/lib/store/contract.js";
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
  expect((await run(h.store, ["broken", "done"])).retirements).toMatchObject([{ status: "blocked", repair: expect.stringContaining("retiredBranches") }, { status: "actionable" }]);
});
it("retains the remote physical-removal gate after valid store abandonment", async () => {
  const h = await abandoned(); expect((await run(h.store, ["done"], false)).retirements).toMatchObject([{ status: "blocked", reason: "evidence-unavailable" }]);
});
