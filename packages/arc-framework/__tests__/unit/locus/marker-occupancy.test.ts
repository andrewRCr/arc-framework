/** Occupancy distinguishes an unbound name from a bound owner whose records are gone. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { inspectCheckoutMarker, workUnitMarkerExit } from "../../../src/lib/locus/marker-occupancy.js";
import { readWorktreeMarkerGeneration, writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { createDecomposeHarness } from "../../helpers/store/decompose-harness.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-marker-occupancy-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const h = createDecomposeHarness();
  return { ...h, cwd, marker: { spawnedByArc: false, createdFor: { kind: "work-unit" as const, name: "example" },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" } };
}

it("retains both reused-name holders and checkout-scoped exits for unbound occupancy", async () => {
  const h = await fixture(), archived = await h.seedCompletedWorkUnit("example"), live = await h.seedMeta("example");
  await writeWorktreeMarker(h.cwd, h.marker);
  const marker = await readWorktreeMarkerGeneration(h.cwd);
  const result = await inspectCheckoutMarker({ cwd: h.cwd, store: h.store, identity: "test-user" });
  expect(result).toMatchObject({ kind: "unbound", marker, reason: expect.stringContaining("unbound"), unbound: {
    holders: expect.arrayContaining([archived.reference, live.reference]), exit: { kind: "bind", reference: live.reference },
    exits: [{ argv: ["arc", "materialize", "example", "--here"], checkout: h.cwd },
      { argv: ["arc", "locus", "release"], checkout: h.cwd }],
  } });
  if (!("reason" in result)) throw new Error("Expected occupied checkout");
  for (const record of [archived, live]) {
    if (record.reference.owner.type !== "work-item" || record.reference.owner.uid === undefined) throw new Error("Expected UID");
    expect(result.reason).toContain(record.reference.owner.uid);
  }
});

it("offers release without a creation rerun for a bound owner with no primary or lineage", async () => {
  const h = await fixture(), record = await h.seedMeta("example");
  await writeWorktreeMarker(h.cwd, { ...h.marker, createdFor: boundWorkUnitSubject(record) });
  lifecycleSuccess(await h.store.write({ action: "remove", reference: record.reference, expected: record.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const result = await inspectCheckoutMarker({ cwd: h.cwd, store: h.store });
  expect(result).toMatchObject({ kind: "occupied", missingRecord: true, workUnit: null,
    reason: expect.stringContaining("arc locus release") });
  if (!("reason" in result)) throw new Error("Expected occupied checkout");
  expect(result.reason).not.toContain("arc start");
  expect(result.reason).not.toContain("arc locus release example");
});

it.each(["backlog", "foreign-completed", "owned-planning"] as const)("names unnamed checkout-local release for %s occupancy", async kind => {
  const h = await fixture();
  const record = kind === "backlog" ? await h.seedStub("example") : kind === "foreign-completed"
    ? await h.seedCompletedWorkUnit("example") : await h.seedMeta("example");
  const message = await workUnitMarkerExit(h.store, h.cwd, "example", record, kind === "foreign-completed" ? "another" : "test-user");
  expect(message).toContain(h.cwd);
  expect(message).toContain("arc locus release");
  expect(message).not.toContain("arc locus release example");
  if (kind === "owned-planning") expect(message).toContain("arc pause example --reason <text>");
});

it("names a retired origin's UID in its occupancy remedy beside a live namesake", async () => {
  const h = await fixture(), primary = await h.seedMeta("example");
  await h.seedRetiredWorkUnit(primary);
  const live = await h.seedMeta("example"), before = lifecycleSuccess(await h.store.version());
  await writeWorktreeMarker(h.cwd, { ...h.marker, createdFor: boundWorkUnitSubject(primary) });
  const marker = await readWorktreeMarkerGeneration(h.cwd);
  const result = await inspectCheckoutMarker({ cwd: h.cwd, store: h.store, identity: "test-user" });
  expect(result).toMatchObject({ kind: "occupied", workUnit: null, missingRecord: false,
    reason: expect.stringContaining(`arc teardown ${boundWorkUnitSubject(primary).uid}`) });
  if (!("reason" in result)) throw new Error("Expected occupied checkout");
  expect(result.reason).not.toContain("arc teardown example");
  expect(await readWorktreeMarkerGeneration(h.cwd)).toEqual(marker);
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("keeps a uniquely selected Integrating holder's slug in its occupancy remedy", async () => {
  const h = await fixture(), primary = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  await writeWorktreeMarker(h.cwd, { ...h.marker, createdFor: boundWorkUnitSubject(primary) });
  const before = lifecycleSuccess(await h.store.version());
  const result = await inspectCheckoutMarker({ cwd: h.cwd, store: h.store, identity: "test-user" });
  expect(result).toMatchObject({ kind: "occupied", workUnit: primary,
    reason: expect.stringContaining("finish integration, then run arc teardown example") });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
