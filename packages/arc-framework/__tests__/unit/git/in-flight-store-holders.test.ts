import { decomposeContext } from "../../fixtures/decompose-context.js";
import { listStoreMaterializable, type MaterializeHeldCheckout } from "../../../src/lib/work-unit/verbs/materialize-store.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
/** In-flight membership locates each operational owner independently of reused names. */
import { expect, it } from "vitest";
import { workUnitHoldersFixture } from "../../helpers/store/work-unit-holders.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { findMaterializableWorkUnits } from "../../../src/lib/session-init/materializable-work-units.js";

it.each([false, true])("locates only the live generation beside an archived namesake, live held=%s", async held => {
  const h = await workUnitHoldersFixture();
  if (held) await h.write(h.livePath, boundWorkUnitSubject(h.live));
  const result = await deriveStoreInFlight({ store: h.store, exec: h.exec, cwd: h.cwd, identity: "test-user", teamMode: false,
    projectId: async () => "project", findHoldingCheckout: h.ports.findHoldingCheckout });
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]?.worktreePath).toBe(held ? h.livePath : undefined);
  expect(result.entries[0]).toMatchObject({ kind: "work-unit", uid: boundWorkUnitSubject(h.live).uid });
  expect(result.warnings).toEqual([]);
});

it("locates both live holders of a clashed name by their distinct owner UUIDs", async () => {
  const h = await workUnitHoldersFixture(), other = await h.seedMeta("other");
  await h.write(h.oldPath, boundWorkUnitSubject(other, "demo"));
  await h.write(h.livePath, boundWorkUnitSubject(h.live));
  const store = createClashDouble(h.store, { slug: "demo", holders: [h.live.reference, other.reference] });
  const result = await deriveStoreInFlight({ store, exec: h.exec, cwd: h.cwd, identity: "test-user", teamMode: false,
    projectId: async () => "project", findHoldingCheckout: h.ports.findHoldingCheckout });
  expect(result.entries).toHaveLength(2);
  expect(result.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ uid: boundWorkUnitSubject(h.live).uid, worktreePath: h.livePath }),
    expect.objectContaining({ uid: boundWorkUnitSubject(other).uid, worktreePath: h.oldPath }),
  ]));
  expect(result.warnings).toEqual([]);
});

it.each([false, true])("offers materialization from its own owner lookup, live held=%s", async held => {
  const h = await workUnitHoldersFixture();
  if (held) await h.write(h.livePath, boundWorkUnitSubject(h.live));
  const result = await findMaterializableWorkUnits({ store: h.store, identity: "test-user",
    entries: [{ kind: "work-unit", name: "demo", uid: boundWorkUnitSubject(h.live).uid,
      state: "Planning", owner: "test-user", remoteOnly: false, dependsOn: [] }],
    findHoldingCheckout: h.ports.findHoldingCheckout });
  expect(result.candidates.map(candidate => candidate.name)).toEqual(held ? [] : ["demo"]);
  expect(result.warnings ?? []).toEqual([]);
});

it("keys held materialize candidates by reference when live owners share a name", async () => {
  const h = await workUnitHoldersFixture(), other = await h.seedMeta("other", { owner: "test-user" });
  await h.write(h.livePath, boundWorkUnitSubject(h.live));
  const store = createClashDouble(h.store, { slug: "demo", holders: [h.live.reference, other.reference] });
  const held = new Map<RecordReference, MaterializeHeldCheckout>();
  const candidates = await listStoreMaterializable({ ...decomposeContext(store).executor, store, exec: h.exec, cwd: h.cwd, locusPorts: h.ports }, "test-user", held);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]?.reference.owner).toMatchObject({ uid: boundWorkUnitSubject(other).uid });
  expect([...held]).toEqual([[expect.objectContaining({ owner: expect.objectContaining({ uid: boundWorkUnitSubject(h.live).uid }) }), { kind: "held", path: h.livePath }]]);
});
it("reports an unbound in-flight location with its recovery exits", async () => {
  const h = await workUnitHoldersFixture();
  await h.write(h.livePath, { kind: "work-unit", name: "demo" });
  const result = await deriveStoreInFlight({ store: h.store, exec: h.exec, cwd: h.cwd, identity: "test-user", teamMode: false,
    projectId: async () => "project", findHoldingCheckout: h.ports.findHoldingCheckout });
  expect(result.entries[0]).toMatchObject({ uid: boundWorkUnitSubject(h.live).uid, worktreePath: h.livePath });
  expect(JSON.stringify(result.warnings)).toContain("arc materialize demo --here");
  expect(JSON.stringify(result.warnings)).toContain("arc locus release");
});
it("offers the unbound checkout's exits in materializable-work advice", async () => {
  const h = await workUnitHoldersFixture();
  await h.write(h.livePath, { kind: "work-unit", name: "demo" });
  const result = await findMaterializableWorkUnits({ store: h.store, identity: "test-user", entries: [{ kind: "work-unit", name: "demo",
    uid: boundWorkUnitSubject(h.live).uid, state: "Planning", owner: "test-user", remoteOnly: false, dependsOn: [] }], findHoldingCheckout: h.ports.findHoldingCheckout });
  expect(result.candidates).toMatchObject([{ name: "demo", actions: [
    { argv: ["arc", "materialize", "demo", "--here"], checkout: h.livePath },
    { argv: ["arc", "locus", "release"], checkout: h.livePath }] }]);
});
it("retains the unbound state among held materialize candidates", async () => {
  const h = await workUnitHoldersFixture();
  await h.write(h.livePath, { kind: "work-unit", name: "demo" });
  const held = new Map<RecordReference, MaterializeHeldCheckout>();
  const candidates = await listStoreMaterializable({ ...decomposeContext(h.store).executor, store: h.store, exec: h.exec, cwd: h.cwd, locusPorts: h.ports }, "test-user", held);
  expect(candidates).toEqual([]);
  expect([...held.values()]).toMatchObject([{ kind: "unbound", path: h.livePath, exits: [
    { argv: ["arc", "materialize", "demo", "--here"], checkout: h.livePath },
    { argv: ["arc", "locus", "release"], checkout: h.livePath }] }]);
});
it("shows an unbound status path with its exits among the warnings", async () => {
  const h = await workUnitHoldersFixture();
  await h.write(h.livePath, { kind: "work-unit", name: "demo" });
  const { readStoreStatusLocus } = await import("../../../src/handlers/status/store-locus.js");
  const { ownerHolderRequest } = await import("../../../src/lib/work-unit/locus-ports.js");
  const holder = await h.ports.findHoldingCheckout(ownerHolderRequest(h.live));
  if (holder.kind !== "unbound") throw new Error("Expected unbound status evidence");
  const result = await readStoreStatusLocus({ cwd: h.cwd, exec: h.exec, store: h.store, slug: "demo", record: h.live },
    { findHoldingCheckout: h.ports.findHoldingCheckout, readInFlightWarnings: async () => [holder.reason] });
  expect(result.warnings).toEqual([holder.reason]);
  expect(result.worktreePath).toBe(h.livePath);
  expect(result.warnings.join(" ")).toContain("arc materialize demo --here");
  expect(result.warnings.join(" ")).toContain("arc locus release");
});
it("shows paused work held at its unbound checkout with bind and release exits", async () => {
  const h = await workUnitHoldersFixture();
  await h.write(h.livePath, { kind: "work-unit", name: "demo" });
  const { writeMetaPause } = await import("../../../src/lib/store/kinds/meta/writers.js");
  const { recordPut } = await import("../../../src/lib/store/lifecycle-write.js");
  const { lifecycleSuccess } = await import("../../helpers/store/lifecycle-harness.js");
  const { SlugSchema } = await import("../../../src/lib/kernel/index.js");
  const { runPausedWork } = await import("../../../src/lib/session-init/paused-work.js");
  lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { content: writeMetaPause(h.live.content, {
    pausedBy: SlugSchema.parse("test-user"), since: "2026-10-24T00:00:00Z", reason: "Awaiting review", waitsOn: null, resumeNotes: null, open: false }) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const result = await runPausedWork({ store: h.store, identity: "test-user", reviewAfterDays: 14, now: new Date("2026-10-24T00:00:00Z"), findHoldingCheckout: h.ports.findHoldingCheckout });
  expect(result.items).toMatchObject([{ slug: "demo", actions: [
    { argv: ["arc", "materialize", "demo", "--here"], checkout: h.livePath },
    { argv: ["arc", "locus", "release"], checkout: h.livePath }] }]);
});
