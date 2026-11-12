/** Reused names retain authenticated replacement edges until their current names are unambiguous. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { createClashDouble } from "../../../helpers/store/clash-double.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { settleCreationSlugEdges } from "../../../../src/lib/store/creation-slug-settlement.js";
import { resolveDecomposeRetiredEdge } from "../../../../src/lib/decompose/retired-edge.js";
import { batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import type { Mutation } from "../../../../src/lib/store/write.js";

function identity(record: StoreRecord) {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected work-item UID");
  return { name: owner.name, uid: owner.uid };
}

async function fixture() {
  const h = createDecomposeHarness(), prior = await h.seedStub("reused");
  const replacement = await h.seedStub("former"), other = await h.seedStub("current");
  const dependent = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null,
    dependsOn: ["reused", "current"] }, { kind: "backlog", commitment: "planned" });
  await h.seedRetiredWorkUnit(prior, { kind: "decompose", successors: [identity(replacement)], incoming: [
    { dependent: identity(dependent), disposition: { kind: "replace", replacementTargets: [identity(replacement)] } },
  ] });
  const clashed = createClashDouble(h.store, { slug: "current", holders: [replacement.reference, other.reference] });
  const creation: Mutation = { action: "put", reference: recordReferences["work-item/meta"](
    OwnerIdentitySchema.parse({ type: "work-item", name: "reused" })), expected: null,
    content: renderMetaFile("reused", { owner: "test-user", state: "Planning", currentWorkflow: null, workClass: "Light" }),
    placement: { kind: "backlog", commitment: "planned" } };
  const apply = async (store: Store) => {
    const plan = await settleCreationSlugEdges(store, "reused", creation.reference.owner);
    return batchLifecycleWrites(store, [creation, ...plan.writes], { verb: "stub", lifecycleAction: "stub" }, plan.observations);
  };
  return { ...h, dependent, replacement, clashed, apply };
}

it("preserves an existing slot beside a clashed replacement during creation, then retries with distinct names", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  expect(await h.apply(h.clashed)).toMatchObject({ status: "refused", refusal: { rule: "work-item.slug-edges" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }))).toEqual(h.dependent);
  lifecycleSuccess(await h.apply(h.store));
  expect(lifecycleSuccess(await h.store.read({ reference: h.dependent.reference })).fields)
    .toMatchObject({ dependsOn: ["former", "current"] });
  expect(lifecycleSuccess(await h.store.read({ reference: h.replacement.reference }))).toEqual(h.replacement);
});

it("holds a clashed replacement at the decomposition boundary until names are distinct", async () => {
  const h = await fixture();
  expect(await resolveDecomposeRetiredEdge(h.clashed, "reused", h.dependent.reference.owner))
    .toEqual({ status: "ok", result: null });
  expect(await resolveDecomposeRetiredEdge(h.store, "reused", h.dependent.reference.owner))
    .toMatchObject({ status: "ok", result: { disposition: { kind: "replace", replacementTargets: ["former"] } } });
});
