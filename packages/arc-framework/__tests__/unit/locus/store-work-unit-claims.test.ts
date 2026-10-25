/** Checkout readers preserve the exact owner when archived and live names coincide. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { claimFrame } from "../../helpers/store/claim-frame.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { readWorktreeMarker, writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { readClaimedCurrentWorkUnit } from "../../../src/lib/store/current-work-unit-marker.js";
import { inspectCheckoutMarker } from "../../../src/lib/locus/marker-occupancy.js";
import { readStoreWorkUnitEvidence } from "../../../src/lib/locus/store-work-unit-evidence.js";
import { createLocusPorts } from "../../../src/lib/locus/lifecycle-ports.js";
import { runWorktreeRoster } from "../../../src/lib/git/worktree-roster.js";
import { selectStoreWorktreeCleanup } from "../../../src/lib/session-init/store-worktree-selection.js";
import { runStoreErrandOverlap } from "../../../src/lib/errand/store-overlap.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

async function fixture(completed = false) {
  const cwd = await mkdtemp(join(tmpdir(), "bound-claim-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("shared", { state: "Integrating", owner: "archived-owner", currentWorkflow: "integrate-work-unit" },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("shared", { state: "Planning", owner: "live-owner", currentWorkflow: "draft-design" });
  const record = completed ? archived : live, owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the selected owner's UID");
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: owner.name, createdAt: "2026-10-24T00:00:00Z",
    createdFor: { kind: "work-unit", name: owner.name, uid: owner.uid } });
  const topology = [{ path: cwd, head: "a".repeat(40), branch: null, detached: true, primary: true, folderPresent: true }];
  const exec = scriptGitExec([{ match: { prefix: ["worktree", "list"] }, responses: [{ stdout:
    worktreePorcelainZ(`worktree ${cwd}\nHEAD ${"a".repeat(40)}\ndetached`) }] }]).exec;
  return { ...h, cwd, record, uid: owner.uid, exec, topology };
}

it.each([false, true])("current work-unit resolution respects the bound placement, completed=%s", async completed => {
  const h = await fixture(completed), warnings: string[] = [];
  const result = await readClaimedCurrentWorkUnit({ cwd: h.cwd, store: h.store }, warnings);
  expect(warnings).toEqual([]);
  expect(result).toEqual(completed ? undefined : h.record);
});

it.each([false, true])("occupancy reads its marker's exact record, completed=%s", async completed => {
  const h = await fixture(completed);
  expect(await inspectCheckoutMarker({ cwd: h.cwd, store: h.store })).toMatchObject({ kind: "occupied", missingRecord: false,
    workUnit: { reference: h.record.reference } });
});

it.each([false, true])("lifecycle evidence reads its marker's exact record, completed=%s", async completed => {
  const h = await fixture(completed);
  expect(await readStoreWorkUnitEvidence({ store: h.store, slug: "shared", uid: h.uid, head: "a".repeat(40),
    archiveCadence: "manual", projectId: async () => "project" })).toMatchObject({ kind: "present", record: { reference: h.record.reference } });
});

it.each([false, true])("exclusivity reports its holder's own lifecycle exit, completed=%s", async completed => {
  const h = await fixture(completed);
  const result = await createLocusPorts({ cwd: h.cwd, exec: h.exec, store: h.store }).checkMarkerExclusivity({ kind: "owner", uid: h.uid, names: { current: "shared", former: [] } });
  expect(result).toMatchObject({ kind: "refused", checkoutPath: h.cwd,
    reason: expect.stringContaining(completed ? "finish integration" : "as owner 'live-owner' run arc pause") });
});

it.each([false, true])("the physical roster uses the bound holder's fields, completed=%s", async completed => {
  const h = await fixture(completed);
  expect(await runWorktreeRoster({ cwd: h.cwd, store: h.store, exec: h.exec,
    fs: { readdir: async () => [], readFile: async () => { throw new Error("No checkout metadata"); } } })).toMatchObject({ warnings: [],
    entries: [{ identity: completed ? "archived-owner" : "live-owner", placement: completed ? "completed" : "active" }] });
});

it.each([false, true])("cleanup follows the bound holder's placement, completed=%s", async completed => {
  const h = await fixture(completed), frame = await claimFrame(h.store, h.cwd);
  const result = await selectStoreWorktreeCleanup({ store: h.store, topology: h.topology, derivedRoster: frame.roster,
    readMarker: readWorktreeMarker });
  expect(result).toEqual({ warnings: [], releases: [], ended: completed ? [{ checkout: h.topology[0], name: "shared" }] : [] });
});

it("overlap resolves the live caller's bound identity before excluding its state targets", async () => {
  const h = await fixture(), frame = await claimFrame(h.store, h.cwd);
  const exec = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]).exec;
  expect((await runStoreErrandOverlap({ store: h.store, cwd: h.cwd, exec, identity: "live-owner", teamMode: false,
    baseBranch: "main", targetPaths: [".arc/active/meta-shared.md"], projectId: async () => "project", readFrame: async () => frame })).result)
    .toEqual({ overlaps: [] });
});
