/** Dependency discovery respects the current primary role when archived names are reused. */
import { expect, it } from "vitest";
import type { Store } from "../../../src/lib/store/contract.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { batchLifecycleWrites, recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { readStoreProjectViewInput } from "../../../src/lib/status/store-project-input.js";
import { composeProjectReadinessViewResult } from "../../../src/lib/status/project-view.js";
import { readStoreUserReady } from "../../../src/lib/status/store-user-ready.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";

async function fixture(retarget: boolean, reuse: boolean) {
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("reused", { state: "Shipped", currentWorkflow: null });
  lifecycleSuccess(await h.store.write({ ...recordPut(archived, {
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
  }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const edge = retarget ? "former" : "reused";
  const former = retarget ? await h.seedMeta("former") : null;
  if (reuse) {
    const errand = TransientIdentityRecordV3Schema.parse({ version: 3, slug: "reused", claimId: "a".repeat(32),
      createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", kind: "errand", purpose: "errand",
      owner: "andrew", intent: "Fix", branch: "chore/reused", state: "open", savedHead: null, changeRequest: null,
      origin: "description", originEntry: null });
    await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "reused" })),
      serializeTransientIdentityRecord(errand), { kind: "active" });
  }
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: [edge] },
    { kind: "backlog", commitment: "planned" });
  if (former !== null) {
    lifecycleSuccess(await batchLifecycleWrites(h.store, [
      { action: "remove", reference: former.reference, expected: former.version },
      { action: "put", reference: recordReferences["lineage/transition"](former.reference.owner), expected: null,
        content: writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("former") }, kind: "rename",
          successors: [{ name: SlugSchema.parse("reused") }], incoming: [] }) },
    ], { verb: "rename", lifecycleAction: "rename" }));
  }
  return { ...h, edge };
}

async function project(store: Store) {
  const input = await readStoreProjectViewInput({ store, reviewAfterDays: 14 });
  if (input.status !== "ok") throw new Error(input.refusal.condition);
  return composeProjectReadinessViewResult(input.result);
}

it.each([false, true])("keeps an edge to an archived slug reused by a live Errand dangling, retarget=%s", async retarget => {
  const h = await fixture(retarget, true);
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("reused") })).reference.kind).toBe("work-item/record");
  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: [h.edge] });
  expect(result.warnings).toMatchObject([{ code: "dangling-dependency", workUnit: "dependent", dependency: h.edge }]);
  const ready = await readStoreUserReady({ store: h.store, reviewAfterDays: 14, identity: "test-user" });
  expect(ready).toMatchObject({ status: "ok", result: { rows: [],
    warnings: [{ code: "dangling-dependency", workUnit: "dependent", dependency: h.edge }] } });
});

it.each([false, true])("retains an archived-target lookup refusal and recovers after repair, retarget=%s", async retarget => {
  const h = await fixture(retarget, false);
  const store = Object.create(h.store) as Store;
  let repaired = false;
  store.lookup = async input => !repaired && input.kind === "slug" && input.slug === "reused"
    ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "Current slug lookup unavailable.", remedy: { text: "Restore the slug index and retry." } } }
    : h.store.lookup(input);
  const refused = await project(store);
  expect(refused.facts.find(fact => fact.slug === "dependent")?.readiness).toBe("blocked");
  expect(refused.warnings).toEqual([{ code: "store-read-failed", workUnit: "dependent", dependency: h.edge,
    rendered: "Current slug lookup unavailable. Restore the slug index and retry." }]);
  repaired = true;
  const recovered = await project(store);
  expect(recovered.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "ready",
    dependencySatisfaction: "satisfied", unsatisfiedDependencies: [] });
  expect(recovered.warnings).toEqual([]);
  expect(await readStoreUserReady({ store, reviewAfterDays: 14, identity: "test-user" })).toMatchObject({ status: "ok",
    result: { rows: [{ workUnit: "dependent" }], warnings: [] } });
});

it("keeps the latest completed work unit standing when only archived metas tie on its slug", async () => {
  const h = createLifecycleHarness();
  const later = await h.seedMeta("reused", { state: "Shipped", currentWorkflow: null });
  lifecycleSuccess(await h.store.write({ ...recordPut(later, {
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
  }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const earlier = await h.seedMeta("reused", { state: "Shipped", currentWorkflow: null, priority: "P1" });
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["reused"] },
    { kind: "backlog", commitment: "planned" });
  lifecycleSuccess(await h.store.write({ ...recordPut(earlier, {
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") },
  }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const input = await readStoreProjectViewInput({ store: h.store, reviewAfterDays: 14 });
  if (input.status !== "ok") throw new Error(input.refusal.condition);
  expect(input.result.records.find(record => record.slug === "reused")).toMatchObject({ state: "Shipped", priority: "P3" });
  const result = composeProjectReadinessViewResult(input.result);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "ready",
    dependencySatisfaction: "satisfied", unsatisfiedDependencies: [] });
  expect(result.warnings).toEqual([]);
});
