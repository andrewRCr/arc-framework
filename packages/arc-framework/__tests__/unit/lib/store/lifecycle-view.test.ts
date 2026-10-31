/** Slug views select standing holders while retaining every identity and diagnostic. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../../helpers/store/clash-double.js";
import { recordKey } from "../../../helpers/store/model.js";
import { readLifecycleView } from "../../../../src/lib/store/lifecycle-view.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordPut, workUnitMetaPath } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { writeMetaTitle } from "../../../../src/lib/store/kinds/meta/writers.js";
import { createStoreReconcilePrepareContext } from "../../../../src/lib/work-unit/store-reconcile-context.js";
import { prepareCurrentWuReconcile } from "../../../../src/lib/work-unit/side-effects/discharge-dep-edges.js";
import type { Store } from "../../../../src/lib/store/contract.js";

it("selects the live generation even when the completed holder lists last", async () => {
  const h = createLifecycleHarness();
  const old = await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const current = await h.seedMeta("shared");
  const store = Object.create(h.store) as Store;
  store.list = async input => {
    const result = await h.store.list(input);
    return result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, records: [...result.result.records].reverse() } } : result;
  };
  const view = lifecycleSuccess(await readLifecycleView(store));
  expect(view.entries.map(entry => entry.reference)).toEqual([current.reference, old.reference]);
  expect(view.index.get("shared")).toMatchObject({ phase: "Active", location: "active" });
  expect(view).toMatchObject({ standing: { entries: [expect.objectContaining({ reference: current.reference })], clashes: [] } });
});

it("omits a clashed slug from the index while retaining both live identities", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first"), second = await h.seedMeta("second");
  const store = createClashDouble(h.store, { slug: "clashed", holders: [first.reference, second.reference] });
  const view = lifecycleSuccess(await readLifecycleView(store));
  expect(view.entries).toHaveLength(2);
  expect(view.index.has("clashed")).toBe(false);
  expect(view).toMatchObject({ standing: { entries: [], clashes: [{ slug: "clashed", kind: "current-name",
    holders: view.entries.map(entry => entry.reference) }] } });
});

it("withholds an archived namesake when the current meta is malformed", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const current = await h.seedMeta("shared");
  h.store.state.records.get(recordKey(current.reference))!.content = "Malformed metadata";
  const view = lifecycleSuccess(await readLifecycleView(h.store));
  expect(view.listing).toMatchObject({ status: "complete", diagnostics: [{ key: "work-item/meta:shared" }] });
  expect(view.index.has("shared")).toBe(false);
  expect(view).toMatchObject({ standing: { failClosedNames: new Set(["shared"]) } });
});

it("reconciles a completed current name against its live former-name holder", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("former", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("former");
  lifecycleSuccess(await h.store.write({ ...recordPut(live, { content: writeMetaTitle(live.content, SlugSchema.parse("current")) }),
    reference: { ...live.reference, owner: OwnerIdentitySchema.parse({ ...live.reference.owner, name: "current" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const dependent = await h.seedMeta("dependent", { dependsOn: ["former"] });
  await h.seed(recordReferences["work-item/notes"](dependent.reference.owner), "# Notes\n\nRead `spec-former.md`.\n");
  const acquired = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  expect(acquired.context.additionalReferenceTransitions).toContainEqual({ subject: "former", outcome: { kind: "rename", targetSlug: "current" } });
  const result = await prepareCurrentWuReconcile(acquired.context, { slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(result.prepared.plan.dependency).toMatchObject({ after: ["current"], discharged: [], conflicts: [] });
});
