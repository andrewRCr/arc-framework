/** Paired filenames retain work-unit ownership without making tied names block unrelated work. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { seedCompletedErrandTie } from "../../helpers/store/completed-errand-tie.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { readPairedReferenceOwners } from "../../../src/lib/work-unit/paired-reference-owners.js";
import { createStoreReconcilePrepareContext } from "../../../src/lib/work-unit/store-reconcile-context.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";

it("counts a tied work-unit name as a paired owner and reconciles without rewriting it", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first"), second = await h.seedMeta("second"), subject = await h.seedMeta("example");
  const notes = await h.seed(recordReferences["work-item/notes"](subject.reference.owner), "# Notes\n\nRead `spec-clashed-prd.md`.\n");
  const store = createClashDouble(h.store, { slug: "clashed", holders: [first.reference, second.reference] });
  const owners = lifecycleSuccess(await readPairedReferenceOwners(store, [notes], new Set()));
  expect(owners.get("spec-clashed-prd.md")).toEqual([{ subject: "clashed", suffix: "-prd" }]);
  expect(await createStoreReconcilePrepareContext(store, "example")).toMatchObject({ status: "ok",
    result: { context: { additionalReferenceTransitions: [] } } });
  expect(lifecycleSuccess(await store.read({ reference: notes.reference }))).toEqual(notes);
});

it("gives an Errand-only tie no paired work-unit owner", async () => {
  const h = createLifecycleHarness();
  await seedCompletedErrandTie(h, "tied");
  const subject = await h.seedMeta("example");
  const notes = await h.seed(recordReferences["work-item/notes"](subject.reference.owner), "# Notes\n\nRead `spec-tied-prd.md`.\n");
  expect(lifecycleSuccess(await readPairedReferenceOwners(h.store, [notes], new Set())).get("spec-tied-prd.md")).toEqual([]);
});

it("renames while a backlog record mentions another clashed name's paired spec", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first"), second = await h.seedMeta("second"), source = await h.seedMeta("source");
  const observer = await h.seedMeta("observer", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  const notes = await h.seed(recordReferences["work-item/notes"](observer.reference.owner), "# Notes\n\nRead `spec-clashed-prd.md`.\n");
  const store = createClashDouble(h.store, { slug: "clashed", holders: [first.reference, second.reference] });
  expect(await runStoreRename({ store, cwd: "/memory", baseBranch: "main", exec: async () => { throw Error("No Git needed"); },
    locusPorts: { findHoldingCheckout: async () => ({ kind: "none" as const }), checkMarkerExclusivity: async () => ({ kind: "clear" }),
      writeAnchoredMarker: async () => ({ kind: "unadmitted" }) } }, { sourceSlug: "source", targetSlug: "renamed" }))
    .toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: source.reference })).reference.owner.name).toBe("renamed");
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference })).content).toBe(notes.content);
});
