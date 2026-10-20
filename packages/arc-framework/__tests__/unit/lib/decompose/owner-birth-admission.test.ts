/** Atomic allocation admission refuses missing or forged authority and retains a supported retry. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { decodeCutMapContent, writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import { CreatedOwnerSchema } from "../../../../src/lib/store/creation-receipt.js";
import { writeMetaCohort } from "../../../../src/lib/store/kinds/meta/writers.js";

it.each(["missing", "empty", "wrong-uid"] as const)("refuses %s candidate evidence and completes after provider repair", async mode => {
  const h = await createDecomposePlanFixture();
  const registry = h.store.context.registry, definition = registry["work-item/cut-map"];
  if (definition.check === null) throw new Error("Expected native cut-map check.");
  const check = definition.check;
  h.store.context.registry = { ...registry, "work-item/cut-map": { ...definition, check: async input => {
    const { proposedCreatedOwners, ...without } = input;
    if (mode === "missing") return check(without);
    return check({ ...input, proposedCreatedOwners: mode === "empty" ? [] : proposedCreatedOwners?.map((birth, index) =>
      index === 0 ? CreatedOwnerSchema.parse({ ...birth, owner: { ...birth.owner, uid: "99999999-9999-4999-8999-999999999999" } }) : birth) });
  } } };
  const before = lifecycleSuccess(await h.store.version());
  const refused = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" });
  expect(refused).toMatchObject({ status: "refused", reason: "store", storeRefusal: { code: "record-malformed", rule: "cut-map.atomic-binding" } });
  if (mode === "missing") expect(refused.status === "refused" && refused.remedy.text).toContain("proposedCreatedOwners");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  h.store.context.registry = registry;
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
});

it("refuses a binding derived without the pinned prior history and persists no allocation", async () => {
  const h = await createDecomposePlanFixture();
  const batch = h.store.batch.bind(h.store);
  const store = new Proxy(h.store, { get(target, property) {
    if (property === "batch") return (input: Parameters<Store["batch"]>[0]) => batch({ ...input, writes: input.writes.map(write => {
      if (write.action !== "put" || write.reference.kind !== "work-item/cut-map") return write;
      const decoded = decodeCutMapContent(write.content);
      if (!decoded.success) throw new Error(decoded.error);
      decoded.data.ownerBirths[0]!.birthKey = "f".repeat(64);
      return { ...write, content: writeCutMapRecord(decoded.data) };
    }) });
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  h.ctx.executor.store = store;
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "refused", reason: "store", storeRefusal: { rule: "cut-map.atomic-binding", condition: expect.stringContaining("pinned before-history") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  h.ctx.executor.store = h.store;
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
});

it("refuses a fresh primary under a retained key, then admits dropping the gone member in a fresh revision", async () => {
  const h = await createDecomposeTerminalFixture();
  const ended = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  await h.seedRetiredWorkUnit(ended);
  const stored = lifecycleSuccess(await h.store.read({ reference: h.applied.storedMap }));
  const before = lifecycleSuccess(await h.store.version());
  expect(await h.store.batch({ provenance: { verb: "decompose", lifecycleAction: "revise" }, writes: [
    { action: "put", reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "member-b" })),
      expected: null, content: ended.content, placement: { kind: "backlog", commitment: "planned" } },
    recordPut(stored),
  ] })).toMatchObject({ status: "refused", refusal: { rule: "cut-map.atomic-binding" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const map = structuredClone(h.map), destination = map.authoring.destinations[1];
  if (destination?.kind !== "new-member") throw new Error("Expected second member.");
  destination.slug = "member-c";
  map.authoring.internalEdges = [];
  const input = { cutMap: map, cutMapPath: "revised.json" };
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", input);
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok" });
});

it("keeps a gone cut-owned cohort from becoming an unrelated external cohort with the same name", async () => {
  const h = await createDecomposeTerminalFixture();
  for (const name of ["member-a", "member-b"]) {
    const member = lifecycleSuccess(await readWorkUnit(h.store, name));
    await h.handEdit(member, writeMetaCohort(member.content, null));
  }
  const original = h.applied.cohorts[0];
  if (original === undefined) throw new Error("Expected cut-owned cohort.");
  const cohort = lifecycleSuccess(await h.store.read({ reference: original.reference }));
  lifecycleSuccess(await h.store.write({ action: "remove", reference: cohort.reference, expected: cohort.version,
    provenance: { verb: "write-back", lifecycleAction: "remove" } }));
  const replacement = await h.seedCohort("group");
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "unsupported", class: "terminal", message: expect.stringContaining("cut-owned cohort") });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: replacement.reference }))).toEqual(replacement);
});
