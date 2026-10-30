/** Non-work-unit holders leave retired dependency dispositions to authenticated lineage. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../helpers/store/decompose-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { transientContent } from "../../helpers/store/in-repo-substrates.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { recordPut, workUnitMetaPath } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle } from "../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { buildStoreCurrentWuReconcile } from "../../../src/lib/work-unit/store-current-wu-reconcile.js";
import { createStoreReconcilePrepareContext } from "../../../src/lib/work-unit/store-reconcile-context.js";
import { planDependencyReconcile } from "../../../src/lib/work-unit/side-effects/discharge-dep-edges.js";

it.each([false, true])("holds a cohort dependency without lineage under its current or former name, former=%s", async former => {
  const h = createDecomposeHarness();
  let cohort = await h.seedCohort("target");
  if (former) {
    lifecycleSuccess(await h.store.write({ ...recordPut(cohort, { content: cohort.content.replaceAll("target", "group") }),
      reference: { ...cohort.reference, owner: OwnerIdentitySchema.parse({ ...cohort.reference.owner, name: "group" }) },
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    cohort = lifecycleSuccess(await h.store.read({ reference: cohort.reference }));
  }
  const dependent = await h.seedMeta("dependent", { dependsOn: ["target"] });
  const ceremony = buildStoreCurrentWuReconcile(h.store);
  const prepared = await ceremony.prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared).toMatchObject({ status: "pending", prepared: { edits: [], plan: { dependency: {
    after: ["target"], live: [], conflicts: [], held: [{ edge: "target", name: "target", cause: "not-a-work-unit", candidates: [cohort.reference] }],
  } } } });
  expect(await ceremony.apply(prepared.prepared)).toMatchObject({ status: "pending" });
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
});

it("reads a retired origin's former-name lineage even when a cohort now holds that name", async () => {
  const h = createDecomposeHarness(), original = await h.seedMeta("former");
  lifecycleSuccess(await h.store.write({ ...recordPut(original, { content: writeMetaTitle(original.content, SlugSchema.parse("origin")) }),
    reference: { ...original.reference, owner: OwnerIdentitySchema.parse({ ...original.reference.owner, name: "origin" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const renamed = lifecycleSuccess(await h.store.read({ reference: original.reference }));
  const dependent = await h.seedMeta("dependent", { dependsOn: ["former"] });
  await h.seedRetiredWorkUnit(renamed);
  await h.seedCohort("former");
  expect(await buildStoreCurrentWuReconcile(h.store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) }))
    .toMatchObject({ status: "pending", prepared: { plan: { dependency: { after: [], conflicts: [],
      drops: [{ retiredSubject: "former", reason: "retired work unit was abandoned" }],
    } } } });
});

it.each([false, true])("reads a missing name's lineage and keeps missing-evidence without one, retired=%s", async retired => {
  const h = createDecomposeHarness();
  if (retired) await h.seedRetiredWorkUnit("target");
  await h.seedMeta("dependent");
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  const plan = await planDependencyReconcile({ ...context, dependentSlug: "dependent", edges: ["target"] });
  expect(plan).toMatchObject(retired ? { status: "ready", dependency: { after: [], conflicts: [], drops: [expect.anything()] } }
    : { status: "conflict", dependency: { after: ["target"], conflicts: [{ reason: "missing-evidence" }] } });
});

it("holds a cohort/Errand tie with no lineage, naming both holders", async () => {
  const h = createDecomposeHarness(), cohort = await h.seedCohort("target");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["target"] });
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "errand" }));
  const errand = await h.seed(reference, transientContent(reference), { kind: "active" });
  const store = createClashDouble(h.store, { slug: "target", holders: [cohort.reference, errand.reference] });
  const prepared = await buildStoreCurrentWuReconcile(store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared).toMatchObject({ status: "pending", prepared: { plan: { dependency: { after: ["target"], live: [], conflicts: [],
    held: [{ edge: "target", cause: "not-a-work-unit", candidates: [cohort.reference,
      { ...errand.reference, owner: { ...errand.reference.owner, name: "target" } }],
    repair: { text: "Edit the edge to name the intended holder's current name, or remove it." } }],
  } } } });
});
