/** Retirement evidence carries operational refusals across its throwing boundary without changing messages. */
import { expect, it } from "vitest";
import { readStoreRetirementEvidence } from "../../../src/lib/work-unit/store-retirement-evidence.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { recordReferences, sameReference } from "../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { StoreRefusal } from "../../../src/lib/store/refusal.js";
const base = "a".repeat(40);
it("carries the original subject clash in its error", async () => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("example"), other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference] });
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse("example") });
  if (lookup.status !== "refused") throw new Error("Expected a fixture clash");
  await expect(readStoreRetirementEvidence(store, "example", base)).rejects.toMatchObject({ name: "StoreRefusalError",
    refusal: lookup.refusal, message: `${lookup.refusal.condition} ${lookup.refusal.remedy.text}` });
});
it.each(["lookup", "read"] as const)("carries a refused lineage %s with the original message", async boundary => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("ended");
  const reference = recordReferences["lineage/transition"](primary.reference.owner);
  if (primary.reference.owner.type === "person" || primary.reference.owner.uid === undefined) throw new Error("Expected a work-item UID");
  lifecycleSuccess(await h.store.batch({ writes: [
    { action: "put", reference, expected: null, content: writeLineageRecord({ schemaVersion: 2,
      origin: { name: primary.reference.owner.name, uid: primary.reference.owner.uid }, kind: "abandon", successors: [], incoming: [], retiredBranches: [] }) },
    { action: "remove", reference: primary.reference, expected: primary.version },
  ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  const refusal: StoreRefusal = { code: "lock-held", class: "recoverable", lock: "terminal-state",
    condition: "Terminal evidence is busy.", remedy: { text: "Retry when the writer releases its lock." } };
  const store = Object.create(h.store) as Store;
  if (boundary === "lookup") store.lookup = async input => input.kind === "lineage"
    ? { status: "refused", refusal } : h.store.lookup(input);
  else store.read = async input => sameReference(input.reference, reference)
    ? { status: "refused", refusal } : h.store.read(input);
  await expect(readStoreRetirementEvidence(store, "ended", base)).rejects.toMatchObject({ name: "StoreRefusalError",
    refusal, message: `${refusal.condition} ${refusal.remedy.text}` });
});
