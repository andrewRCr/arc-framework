/** Creation settles only eligible stub edges and binds their read evidence atomically. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { fileDecomposeConflict } from "../../../fixtures/decompose-conflict.js";
import { settleCreationSlugEdges } from "../../../../src/lib/store/creation-slug-settlement.js";
import { recordPut, batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import type { Mutation } from "../../../../src/lib/store/write.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
function identity(record: StoreRecord) {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected owner UUID");
  return { name: owner.name, uid: owner.uid };
}
function create(): Mutation {
  return { action: "put", reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "reused" })),
    expected: null, content: renderMetaFile("reused", { owner: "test-user", state: "Planning", currentWorkflow: null, workClass: "Light" }),
    placement: { kind: "backlog", commitment: "planned" } };
}
async function fixture(kind: "shipped" | "abandoned" | "decomposed" | "unmapped" = "shipped") {
  const h = createDecomposeHarness();
  const prior = kind === "shipped" ? await h.seedCompletedWorkUnit("reused") : await h.seedStub("reused");
  await h.seedStub("before"); await h.seedStub("after");
  const dependent = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["before", "reused", "after"] },
    { kind: "backlog", commitment: "planned" });
  const leaf = await h.seedStub("leaf");
  if (kind !== "shipped") await h.seedRetiredWorkUnit(prior, kind === "abandoned" ? { kind: "abandon", successors: [] }
    : { kind: "decompose", successors: [identity(leaf)], incoming: kind === "unmapped" ? [] : [{ dependent: identity(dependent),
      disposition: { kind: "replace", replacementTargets: [identity(leaf)] } }] });
  const creation = create();
  const plan = () => settleCreationSlugEdges(h.store, "reused", creation.reference.owner);
  const apply = async () => { const p = await plan(); return batchLifecycleWrites(h.store, [creation, ...p.writes],
    { verb: "stub", lifecycleAction: "stub" }, p.observations); };
  return { ...h, prior, dependent, leaf, creation, plan, apply };
}
it.each(["shipped", "abandoned", "decomposed"] as const)("settles a %s provider's edge with its create", async kind => {
  const h = await fixture(kind);
  lifecycleSuccess(await h.apply());
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference })).fields).toMatchObject({
    dependsOn: kind === "decomposed" ? ["before", "leaf", "after"] : ["before", "after"] });
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("reused") })).reference.owner)
    .not.toEqual(h.prior.reference.owner);
});
it("leaves an edge when neither a primary nor lineage establishes its prior target", async () => {
  const h = createDecomposeHarness(), prior = await h.seedStub("reused");
  const dependent = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["reused"] },
    { kind: "backlog", commitment: "planned" });
  lifecycleSuccess(await h.store.write({ action: "remove", reference: prior.reference, expected: prior.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const creation = create(), plan = await settleCreationSlugEdges(h.store, "reused", creation.reference.owner);
  lifecycleSuccess(await batchLifecycleWrites(h.store, [creation, ...plan.writes], { verb: "stub", lifecycleAction: "stub" }, plan.observations));
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
});
it("refuses an unmapped lineage edge without creating a holder or changing its dependent", async () => {
  const h = await fixture("unmapped"), before = lifecycleSuccess(await h.store.version());
  expect(await h.apply()).toMatchObject({ status: "refused", refusal: { rule: "work-item.slug-edges" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }))).toEqual(h.dependent);
});
it("refuses a conflicted stub edge without applying other eligible settlements", async () => {
  const h = await fixture();
  const blocked = await h.seedMeta("blocked", { state: "Planning", currentWorkflow: null, dependsOn: ["reused"] },
    { kind: "backlog", commitment: "planned" });
  const conflict = await fileDecomposeConflict(h.store, blocked), before = lifecycleSuccess(await h.store.version());
  expect(await h.apply()).toMatchObject({ status: "refused", refusal: { rule: "work-item.slug-edges" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }))).toEqual(h.dependent);
  expect(lifecycleSuccess(await h.store.read({ reference: blocked.reference }))).toEqual(conflict.subject);
});
it("refuses stale prior-provider read evidence without creating or settling records", async () => {
  const h = await fixture(), plan = await h.plan();
  lifecycleSuccess(await h.store.write({ ...recordPut(h.prior, { content: `${h.prior.content}\nUpdated completion evidence.\n` }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  const before = lifecycleSuccess(await h.store.version());
  expect(await batchLifecycleWrites(h.store, [h.creation, ...plan.writes], { verb: "stub", lifecycleAction: "stub" }, plan.observations))
    .toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }))).toEqual(h.dependent);
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("reused") })).reference).toEqual(h.prior.reference);
});
it("leaves the writing owner's own metadata for its caller", async () => {
  const h = await fixture();
  expect((await settleCreationSlugEdges(h.store, "reused", h.dependent.reference.owner)).writes).toEqual([]);
});
it("leaves a cut-mapped stub's edge for the slug guard", async () => {
  const h = await fixture();
  const { decomposeContext } = await import("../../../fixtures/decompose-context.js");
  const { prepareDecomposePreflight } = await import("../../../../src/lib/decompose/preflight.js");
  const { completeCutMapFixture } = await import("../../../fixtures/decompose-v4.js");
  const { storedCutMapFixture } = await import("../../../fixtures/stored-cut-map.js");
  const { writeCutMapRecord } = await import("../../../../src/lib/store/kinds/cut-map/index.js");
  const protectedPrimary = await h.handEdit(h.dependent, renderMetaFile("consumer", { owner: "test-user", workClass: "Light", state: "Planning", currentWorkflow: null,
    design: ["draft-consumer.md"], dependsOn: ["before", "reused", "after"] }));
  await h.seed(recordReferences["work-item/draft"](h.dependent.reference.owner), "# Consumer\n\n## Scope\n\nWork.\n");
  const preflight = await prepareDecomposePreflight(decomposeContext(h.store), "consumer");
  if (preflight.status === "refused") throw new Error(JSON.stringify(preflight));
  await h.seed(recordReferences["work-item/cut-map"](h.dependent.reference.owner),
    writeCutMapRecord(storedCutMapFixture(completeCutMapFixture(preflight.result.machine))));
  expect(await h.apply()).toMatchObject({ status: "refused", refusal: { rule: "work-item.slug-edges" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }))).toEqual(protectedPrimary);
});
it("leaves a parked non-Planning dependent's edge for its owner", async () => {
  const h = await fixture();
  const parked = await h.seedMeta("parked", { state: "Active", dependsOn: ["reused"] }, { kind: "backlog", commitment: "planned" });
  const before = lifecycleSuccess(await h.store.version());
  expect(await h.apply()).toMatchObject({ status: "refused", refusal: { rule: "work-item.slug-edges" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: parked.reference }))).toEqual(parked);
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }))).toEqual(h.dependent);
});
