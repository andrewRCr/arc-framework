/** A tie involving a work unit holds its edge independently of lifecycle state or lineage. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { recordKey } from "../../helpers/store/model.js";
import { seed, success } from "../../helpers/store/suite-tools.js";
import { META_REGISTRATION } from "../../../src/lib/store/kinds/meta/registration.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { workUnitMetaPath } from "../../../src/lib/store/lifecycle-write.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { buildStoreCurrentWuReconcile } from "../../../src/lib/work-unit/store-current-wu-reconcile.js";

it.each([false, true])("holds a work-unit/cohort tie before reading even existing retirement lineage, completed=%s", async completed => {
  const h = createDecomposeHarness();
  await h.seedRetiredWorkUnit("target");
  const target = completed ? await h.seedCompletedWorkUnit("target")
    : await h.seedMeta("target", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const dependent = await h.seedMeta("dependent", { dependsOn: ["target"] });
  const cohort = await h.seedCohort("target", completed);
  const prepared = await buildStoreCurrentWuReconcile(h.store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared).toMatchObject({ status: "pending", prepared: { plan: { dependency: {
    after: ["target"], live: [], discharged: [], drops: [], conflicts: [],
    held: [{ edge: "target", cause: "tie", candidates: expect.arrayContaining([target.reference, cohort.reference]),
      tie: { liveness: completed ? "completed" : "live" } }],
  } } } });
});

it("holds an Integrating work unit tied with an Errand from a concurrent reference state", async () => {
  const parser = META_REGISTRATION.parser;
  if (parser === undefined) throw new Error("Expected the metadata parser");
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser } });
  const target = await seed(fixture, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "target" })), renderMetaFile("target", {
    state: "Integrating", owner: "test-user", workClass: "Light", currentWorkflow: "integrate-work-unit",
  }));
  const dependent = await seed(fixture, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "dependent" })), renderMetaFile("dependent", {
    state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop", dependsOn: ["target"],
  }));
  const errand = await seed(fixture, fixture.reference("work-item/record", "errand"));
  if (!(fixture.store instanceof ReferenceBackend)) throw new Error("Expected the reference backend");
  const raw = fixture.store.state.records.get(recordKey(errand.reference));
  if (raw === undefined) throw new Error("Expected the stored Errand");
  // Represent a concurrent name clash that a local namespace write refuses.
  raw.reference = { ...raw.reference, owner: { ...raw.reference.owner, name: SlugSchema.parse("target") } };
  const observed = success(await fixture.store.read({ reference: raw.reference }));
  const prepared = await buildStoreCurrentWuReconcile(fixture.store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared).toMatchObject({ status: "pending", prepared: { plan: { dependency: { after: ["target"], discharged: [],
    held: [{ cause: "tie", candidates: expect.arrayContaining([target.reference, observed.reference]),
      repair: { argv: ["arc", "errand", "close", observed.reference.owner.type === "person" ? "" : observed.reference.owner.uid] } }],
  } } } });
});

it("holds a former-name tie under the edge's written name", async () => {
  const h = createDecomposeHarness(), first = await h.seedMeta("first"), second = await h.seedMeta("second");
  const firstRaw = h.store.state.records.get(recordKey(first.reference));
  const secondRaw = h.store.state.records.get(recordKey(second.reference));
  if (firstRaw === undefined || secondRaw === undefined) throw new Error("Expected both holders");
  firstRaw.formerSlugs.push("former");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["former"] });
  const concurrentSecond = h.store.state.records.get(recordKey(second.reference));
  if (concurrentSecond === undefined) throw new Error("Expected the current second holder");
  concurrentSecond.formerSlugs.push("former");
  expect(await buildStoreCurrentWuReconcile(h.store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) }))
    .toMatchObject({ status: "pending", prepared: { plan: { dependency: { after: ["former"], discharged: [],
      held: [{ edge: "former", name: "former", cause: "tie", tie: { liveness: "live", name: "former" },
        candidates: expect.arrayContaining([first.reference, second.reference]) }],
    } } } });
});

it.each([false, true])("holds the original edge when a lineage replacement's current name clashes, uid=%s", async uid => {
  const h = createDecomposeHarness(), target = await h.seedMeta("target"), other = await h.seedMeta("other");
  const origin = await h.seedMeta("origin"), dependent = await h.seedMeta("dependent", { dependsOn: ["origin"] });
  if (target.reference.owner.type !== "work-item") throw new Error("Expected a work unit");
  const replacement = { name: target.reference.owner.name, ...(uid ? { uid: target.reference.owner.uid } : {}) };
  await h.seedRetiredWorkUnit(origin, { kind: "decompose", successors: [replacement], outgoing: [], incoming: [
    { dependent: { name: dependent.reference.owner.name }, disposition: { kind: "replace", replacementTargets: [replacement] } },
  ] });
  const store = createClashDouble(h.store, { slug: "target", holders: [target.reference, other.reference] });
  expect(await buildStoreCurrentWuReconcile(store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) }))
    .toMatchObject({ status: "pending", prepared: { edits: [], plan: { dependency: { after: ["origin"], live: [], discharged: [],
      held: [{ edge: "origin", name: "target", candidates: expect.arrayContaining([target.reference,
        { ...other.reference, owner: { ...other.reference.owner, name: "target" } }]) }],
    } } } });
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
});
