/** Cleanup reports executable exits for unbound names without changing their holders. */
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { validateLocusEnvelope } from "../../src/commands/locus.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { selectStoreWorktreeCleanup } from "../../src/lib/session-init/store-worktree-selection.js";
import { inspectCheckoutMarker } from "../../src/lib/locus/marker-occupancy.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture(bound = false) {
  const h = await lifecycleReuseFixture(false, { state: "Planning", currentWorkflow: "draft-design" });
  await writeFile(join(h.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const path = join(h.cwd, ".arc-checkouts", "occupant");
  await h.exec("git", ["worktree", "add", "--detach", path, "main"]);
  await ensureWorktreeMarkerIgnored(path, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(path, { spawnedByArc: false,
    createdFor: bound ? boundWorkUnitSubject(h.live) : { kind: "work-unit", name: "example" },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  return { ...h, path };
}

it("reports checkout-bound recovery actions and frees the unbound checkout through its release exit", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const locus = await repairCli(h, ["locus", "--json"], { store: h.store });
  expect(locus.exitCode ?? 0, locus.stdout + locus.stderr).toBe(0);
  const envelope = validateLocusEnvelope(locus.result), topology = await scanRegisteredWorktrees(h.exec);
  if (!envelope.ok) throw new Error(envelope.error.message);
  if (!topology.ok) throw new Error(topology.message);
  const selection = { store: h.store, topology: topology.worktrees, derivedRoster: envelope.roster,
    readMarker: readWorktreeMarker, identity: "test-user", excludeWorktreePath: h.cwd };
  const report = await selectStoreWorktreeCleanup(selection);
  expect(report).toMatchObject({ ended: [], warnings: [], releases: [{ worktreePath: h.path, decision: { action: "external" }, actions: [
    { argv: ["arc", "materialize", "example", "--here"], checkout: h.path },
    { argv: ["arc", "locus", "release"], checkout: h.path },
  ] }] });
  const action = report.releases[0]?.actions?.[1];
  if (!action?.checkout || !action.argv) throw new Error("Missing executable release exit");
  const released = await repairCli({ ...h, cwd: action.checkout }, action.argv.slice(1), { store: h.store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(await readWorktreeMarker(h.path)).toEqual({ kind: "absent" });
  expect(await inspectCheckoutMarker({ cwd: h.path, store: h.store })).toEqual({ kind: "clear" });
  expect((await selectStoreWorktreeCleanup(selection)).releases).toEqual([]);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  for (const record of [h.archived, h.live, h.oldNotes]) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
}, 30_000);

it("releases a bound missing owner without changing the completed namesake", async () => {
  const h = await fixture(true);
  lifecycleSuccess(await h.store.write({ action: "remove", reference: h.live.reference, expected: h.live.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const before = lifecycleSuccess(await h.store.version());
  const released = await repairCli({ ...h, cwd: h.path }, ["locus", "release"], { store: h.store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(await readWorktreeMarker(h.path)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
}, 30_000);
