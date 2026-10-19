/** Retired-origin queries preserve a renamed dependent's identity-bound disposition. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { batchLifecycleWrites } from "../../../src/lib/store/lifecycle-write.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";
import { queryRetiredOriginDisposition, storeLineageEnumeration } from "../../../src/lib/work-unit/store-reconcile-context.js";

it("reads a cut disposition by dependent UID after its rename", async () => {
  const h = createLifecycleHarness();
  const origin = await h.seedMeta("origin");
  await h.seedMeta("member");
  const dependent = await h.seedMeta("former-dependent", { dependsOn: ["origin"] });
  const owner = dependent.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a minted dependent identity");
  lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: origin.reference, expected: origin.version },
    { action: "put", reference: recordReferences["lineage/transition"](origin.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("origin") }, kind: "decompose",
        successors: [{ name: SlugSchema.parse("member") }], outgoing: [],
        incoming: [{ dependent: { name: owner.name, uid: owner.uid },
          disposition: { kind: "replace", replacementTargets: [{ name: SlugSchema.parse("member") }] } }] }) },
  ], { verb: "decompose", lifecycleAction: "decompose" }));
  expect(await runStoreRename({ store: h.store, cwd: "/memory", baseBranch: "main",
    exec: async () => { throw new Error("No Git needed"); }, locusPorts: {
      findHoldingCheckout: async () => null, checkMarkerExclusivity: async () => ({ kind: "clear" }),
      writeAnchoredMarker: async () => ({ kind: "unadmitted" }),
    } }, { sourceSlug: "former-dependent", targetSlug: "current-dependent" })).toMatchObject({ status: "renamed" });
  const current = lifecycleSuccess(await h.store.read({ reference: dependent.reference }));
  const lineage = lifecycleSuccess(await storeLineageEnumeration(h.store));

  expect(await queryRetiredOriginDisposition(h.store, current.reference.owner, lineage,
    { origin: "origin", dependentSlug: "current-dependent" }))
    .toEqual({ status: "unique", disposition: { kind: "replace", replacementTargets: ["member"] } });
});
