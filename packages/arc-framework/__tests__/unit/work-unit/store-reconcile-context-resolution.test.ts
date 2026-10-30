/** Dependency resolutions retain the first observed identity for each name. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createStoreReconcilePrepareContext } from "../../../src/lib/work-unit/store-reconcile-context.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { batchLifecycleWrites, recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle } from "../../../src/lib/store/kinds/meta/writers.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";

it("resolves a cut's UID-bearing replacement to its renamed primary", async () => {
  const h = createLifecycleHarness();
  const origin = await h.seedMeta("origin"), member = await h.seedMeta("member");
  await h.seedMeta("dependent");
  if (member.reference.owner.type !== "work-item") throw new Error("Expected a work unit");
  const target = { name: member.reference.owner.name, uid: member.reference.owner.uid };
  lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: origin.reference, expected: origin.version },
    { action: "put", reference: recordReferences["lineage/transition"](origin.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: origin.reference.owner.name }, kind: "decompose",
        successors: [target], outgoing: [], incoming: [{ dependent: { name: SlugSchema.parse("dependent") },
          disposition: { kind: "replace", replacementTargets: [target] } }] }) },
  ], { verb: "decompose", lifecycleAction: "decompose" }));
  lifecycleSuccess(await h.store.write({ ...recordPut(member, { content: writeMetaTitle(member.content, SlugSchema.parse("current")) }),
    reference: { ...member.reference, owner: OwnerIdentitySchema.parse({ ...member.reference.owner, name: "current" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const current = lifecycleSuccess(await h.store.read({ reference: member.reference }));
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  const query = await context.queryDisposition({ origin: "origin", dependentSlug: "dependent" });
  expect(query).toEqual({ status: "unique", disposition: { kind: "replace", replacementTargets: ["member"], references: [target] } });
  if (query.status !== "unique" || query.disposition.kind !== "replace") throw new Error("Expected replacements");
  h.store.lookup = async () => ({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "test-lock",
    condition: "Lookup is locked.", remedy: { text: "Release the lock and retry." } } });
  expect(await context.resolveDependency?.(query.disposition.references?.[0] ?? "member"))
    .toEqual({ kind: "work-unit", reference: current.reference, state: "active" });
});

it("retains the missing UID target's own lineage when its name has been reused", async () => {
  const h = createLifecycleHarness();
  const retired = await h.seedMeta("target");
  await h.seedMeta("dependent");
  if (retired.reference.owner.type !== "work-item") throw new Error("Expected a work unit");
  const target = { name: retired.reference.owner.name, uid: retired.reference.owner.uid };
  lifecycleSuccess(await h.store.write({ ...recordPut(retired, { content: writeMetaTitle(retired.content, SlugSchema.parse("retired-current")) }),
    reference: { ...retired.reference, owner: OwnerIdentitySchema.parse({ ...retired.reference.owner, name: "retired-current" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const renamed = lifecycleSuccess(await h.store.read({ reference: retired.reference }));
  lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: renamed.reference, expected: renamed.version },
    { action: "put", reference: recordReferences["lineage/transition"](renamed.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { ...target, name: renamed.reference.owner.name }, kind: "abandon", successors: [], incoming: [] }) },
  ], { verb: "abandon", lifecycleAction: "abandon" }));
  await h.seedMeta("target");
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  expect(await context.resolveDependency?.(target)).toEqual({ kind: "not-found", reference: target });
  expect(await context.queryDisposition({ origin: "target", dependentSlug: "dependent", reference: target }))
    .toEqual({ status: "unique", disposition: { kind: "abandoned" } });
});

it("retains one name resolution when the store's next observation changes", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("dependent");
  const target = await h.seedMeta("target");
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  const first = await context.resolveDependency?.("target");
  h.store.lookup = async input => ({ status: "refused", refusal: {
    code: "not-found", class: "recoverable", lookup: input,
    condition: "No longer present.", remedy: { text: "Restore the target." },
  } });
  expect(first).toEqual({ kind: "work-unit", reference: target.reference, state: "active" });
  expect(await context.resolveDependency?.("target")).toEqual(first);
});
