/** Retirement evidence carries operational refusals across its throwing boundary without changing messages. */
import { expect, it } from "vitest";
import { readStoreRetirementEvidence, resolveTeardownSubject, teardownOperand } from "../../../src/lib/work-unit/store-retirement-evidence.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { StoreRefusal } from "../../../src/lib/store/refusal.js";
import { createDecomposeHarness } from "../../helpers/store/decompose-harness.js";
const base = "a".repeat(40);
it("reads the archived reference without selecting its live namesake", async () => {
  const h = createDecomposeHarness(), archived = await h.seedCompletedWorkUnit("example"), live = await h.seedMeta("example");
  const before = lifecycleSuccess(await h.store.version());
  const result = await readStoreRetirementEvidence(h.store, archived.reference, base);
  expect(result).toMatchObject({ record: archived, rule: "landed", name: "example" });
  await expect(result.revalidate()).resolves.toBeUndefined();
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
it("reads a retired origin's lineage by UID beside same-name retired generations and live work", async () => {
  const h = createDecomposeHarness(), primary = await h.seedMeta("ended");
  const retired = await h.seedRetiredWorkUnit(primary);
  await h.seedRetiredWorkUnit(await h.seedMeta("ended"));
  const live = await h.seedMeta("ended"), before = lifecycleSuccess(await h.store.version());
  const evidence = await readStoreRetirementEvidence(h.store, primary.reference, base);
  expect(evidence).toMatchObject({ record: retired, rule: "discard", evidence: { kind: "lineage", reference: retired.reference } });
  await expect(evidence.revalidate()).resolves.toBeUndefined();
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
it("retains a supplied archived owner instead of resolving its reused slug", async () => {
  const h = createDecomposeHarness(), archived = await h.seedCompletedWorkUnit("example");
  const live = await h.seedMeta("example"), before = lifecycleSuccess(await h.store.version());
  expect(await resolveTeardownSubject(h.store, { kind: "owner", owner: archived.reference.owner })).toEqual(archived.reference);
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
it("refuses a UID-free primary reference and reads evidence after supplying its exact owner", async () => {
  const h = createDecomposeHarness(), archived = await h.seedCompletedWorkUnit("example");
  const unbound = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const before = lifecycleSuccess(await h.store.version());
  await expect(readStoreRetirementEvidence(h.store, unbound, base)).rejects.toThrow("owner UID");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await expect(readStoreRetirementEvidence(h.store, archived.reference, base)).resolves.toMatchObject({ record: archived, rule: "landed" });
});
it("carries the original subject clash in its error", async () => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("example"), other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference] });
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse("example") });
  if (lookup.status !== "refused") throw new Error("Expected a fixture clash");
  await expect(resolveTeardownSubject(store, { kind: "slug", slug: "example" })).rejects.toMatchObject({ name: "StoreRefusalError",
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
  await expect(readStoreRetirementEvidence(store, primary.reference, base)).rejects.toMatchObject({ name: "StoreRefusalError",
    refusal, message: `${refusal.condition} ${refusal.remedy.text}` });
});

it("keeps an ended holder's non-UUID slug when lookup selects that exact owner", async () => {
  const h = createDecomposeHarness(), archived = await h.seedCompletedWorkUnit("example");
  expect(await teardownOperand(h.store, archived.reference.owner)).toBe("example");
});
it("uses an ended holder's UID when its slug lookup refuses", async () => {
  const h = createDecomposeHarness(), archived = await h.seedCompletedWorkUnit("example"), other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [archived.reference, other.reference] });
  expect(await teardownOperand(store, archived.reference.owner)).toBe(archived.reference.owner.type === "work-item" ? archived.reference.owner.uid : undefined);
});
it("uses the owner UID even when its UUID-shaped display name selects the same owner", async () => {
  const h = createDecomposeHarness(), name = "11111111-1111-4111-8111-111111111111";
  const archived = await h.seedCompletedWorkUnit(name);
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(name) }));
  expect(selected.reference).toEqual(archived.reference);
  const uid = archived.reference.owner.type === "work-item" ? archived.reference.owner.uid : undefined;
  expect(uid).not.toBe(name);
  expect(await teardownOperand(h.store, archived.reference.owner)).toBe(uid);
});
