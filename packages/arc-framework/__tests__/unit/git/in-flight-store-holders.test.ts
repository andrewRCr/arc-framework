import { decomposeContext } from "../../fixtures/decompose-context.js";
import { listStoreMaterializable } from "../../../src/lib/work-unit/verbs/materialize-store.js";
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
  const held = new Map<RecordReference, string>();
  const candidates = await listStoreMaterializable({ ...decomposeContext(store).executor, store, exec: h.exec, cwd: h.cwd, locusPorts: h.ports }, "test-user", held);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]?.reference.owner).toMatchObject({ uid: boundWorkUnitSubject(other).uid });
  expect([...held]).toEqual([[expect.objectContaining({ owner: expect.objectContaining({ uid: boundWorkUnitSubject(h.live).uid }) }), h.livePath]]);
});
