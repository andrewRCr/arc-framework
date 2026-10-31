/** Activation preserves unsettled dependency edges on non-work-unit holders. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createDecomposeHarness } from "../helpers/store/decompose-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { buildStoreCurrentWuReconcile } from "../../src/lib/work-unit/store-current-wu-reconcile.js";
import { workUnitMetaPath } from "../../src/lib/store/lifecycle-write.js";

it.each([false, true])("activates with an edge held by a cohort or a cohort/Errand tie, tied=%s", async tied => {
  const f = await repairCliFixture(), h = createDecomposeHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const cohort = await h.seedCohort("target");
  const dependent = await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["target"] });
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "errand" }));
  const errand = tied ? await h.seed(reference, transientContent(reference), { kind: "active" }) : undefined;
  const store = errand === undefined ? h.store : createClashDouble(h.store, { slug: "target", holders: [cohort.reference, errand.reference] });
  const prepared = await buildStoreCurrentWuReconcile(store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  const result = await repairCli(f, ["activate", "dependent", "--type", "feat", "--task", "Implement", "--action", "Continue"], { store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(prepared).toMatchObject({ status: "pending", prepared: { edits: [], plan: { dependency: {
    after: ["target"], live: [], held: [{ edge: "target", cause: "not-a-work-unit" }],
  } } } });
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toMatchObject({ fields: { state: "Active", dependsOn: ["target"] },
    links: { branches: [expect.objectContaining({ ref: "feat/dependent" })] } });
  expect(lifecycleSuccess(await h.store.read({ reference: cohort.reference }))).toEqual(cohort);
  if (errand !== undefined) expect(lifecycleSuccess(await h.store.read({ reference: errand.reference }))).toEqual(errand);
}, 60_000);
