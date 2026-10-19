/** Prepared user-reference authority retains the exact records behind every transition. */
import { expect, it } from "vitest";
import { acquireStoreUserReferenceAuthority, readStoreUserReferenceTransitions } from "../../../../src/lib/store/user-reference-authority.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { createStoreUserReferencePrepareContext } from "../../../../src/lib/user-reference-reconcile-store.js";
import { revalidateLifecycleRecords } from "../../../../src/lib/work-unit/prepared-lifecycle-write.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";

async function renamedAuthority() {
  const h = createLifecycleHarness(), former = await h.seedMeta("former");
  const reference = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  return { h, current: lifecycleSuccess(await h.store.read({ reference })) };
}

it.each(["authority", "prepared-context"] as const)("keeps %s available during an unrelated personal write and rejects a changed captured record", async mode => {
  const { h, current } = await renamedAuthority(), before = lifecycleSuccess(await h.store.version());
  const racing = Object.create(h.store) as Store;
  racing.lookup = async input => {
    await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "another-person" })), "## Errand\n");
    return h.store.lookup(input);
  };
  const result = mode === "authority" ? await acquireStoreUserReferenceAuthority(racing)
    : await createStoreUserReferencePrepareContext({ store: racing, identity: "test-user" });
  expect(result).toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.version())).not.toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: current.reference }))).toEqual(current);
  expect(await revalidateLifecycleRecords(h.store, [current])).toMatchObject({ status: "ok" });
  lifecycleSuccess(await h.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: current.content + "\n", placement: { kind: "active" }, provenance: { verb: "update", lifecycleAction: "update" } }));
  expect(await revalidateLifecycleRecords(h.store, [current])).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(await acquireStoreUserReferenceAuthority(h.store)).toMatchObject({ status: "ok" });
});

it("refuses an alias lookup that advanced beyond the captured name and succeeds after reacquisition", async () => {
  const { h, current } = await renamedAuthority();
  const racing = Object.create(h.store) as Store;
  racing.lookup = async input => {
    lifecycleSuccess(await h.store.write({ action: "put", reference: RecordReferenceSchema.parse({ ...current.reference, owner: { ...current.reference.owner, name: "advanced" } }),
      expected: current.version, content: current.content.replaceAll("current", "advanced"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
    return h.store.lookup(input);
  };
  expect(await acquireStoreUserReferenceAuthority(racing)).toMatchObject({ status: "refused", refusal: {
    code: "version-conflict", condition: expect.stringContaining("lookup"), remedy: { text: expect.stringContaining("again") } } });
  expect(await acquireStoreUserReferenceAuthority(h.store)).toMatchObject({ status: "ok", result: { transitions: [
    { subject: "current", outcome: { kind: "rename", targetSlug: "advanced" } },
    { subject: "former", outcome: { kind: "rename", targetSlug: "advanced" } },
  ] } });
});
it("accepts a resolved current-name replacement while the earlier generation retains its alias", async () => {
  const h = createLifecycleHarness(), original = await h.seedMeta("former"), remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const currentReference = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: currentReference, expected: original.version,
    content: original.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const incoming = lifecycleSuccess(await h.store.read({ reference: currentReference }));
  lifecycleSuccess(await writer.write({ action: "remove", reference: original.reference, expected: original.version,
    provenance: { verb: "abandon", lifecycleAction: "transition" } }));
  const reusedReference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "former" }));
  const replacement = lifecycleSuccess(await writer.write({ action: "put", reference: reusedReference, expected: null,
    content: original.content, placement: { kind: "active" }, provenance: { verb: "create", lifecycleAction: "create" } }));
  lifecycleSuccess(await h.store.sync());
  const conflicts = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/conflict-record" }));
  if (conflicts.status !== "complete") throw new Error("Missing name-reuse conflict");
  expect(conflicts.records).toHaveLength(1);
  lifecycleSuccess(await h.store.write({ action: "put", reference: incoming.reference, expected: null, content: incoming.content,
    placement: { kind: "active" }, resolves: conflicts.records.map(record => record.reference), provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  lifecycleSuccess(await h.store.sync());
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: reusedReference.owner.name })).reference).toEqual(replacement.reference);
  const records = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  if (records.status !== "complete") throw new Error("Missing complete primary inventory");
  expect(records.records).toHaveLength(2);
  expect(records.records.every(record => record.conflicts.length === 0)).toBe(true);
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await acquireStoreUserReferenceAuthority(h.store)).toMatchObject({ status: "ok", result: { transitions: [] } });
  }
  expect(await createStoreUserReferencePrepareContext({ store: h.store, identity: "test-user" }))
    .toMatchObject({ status: "ok", result: { authority: { transitions: [] } } });
});
it("returns the actual versioned alias authority while preserving the transition-only API", async () => {
  const h = createLifecycleHarness();
  const former = await h.seedMeta("former");
  const reference = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const current = lifecycleSuccess(await h.store.read({ reference }));
  const authority = lifecycleSuccess(await acquireStoreUserReferenceAuthority(h.store));
  expect(authority.records).toEqual([current]);
  expect(authority.transitions).toEqual([{ subject: "former", outcome: { kind: "rename", targetSlug: "current" } }]);
  expect(lifecycleSuccess(await readStoreUserReferenceTransitions(h.store))).toEqual(authority.transitions);
});
it("refuses unresolved authority conflicts before they can authorize a target rewrite", async () => {
  const { vi } = await import("vitest");
  const h = createLifecycleHarness();
  await h.seedMeta("conflicted");
  const list = h.store.list.bind(h.store);
  vi.spyOn(h.store, "list").mockImplementation(async input => {
    const result = await list(input);
    return result.status === "ok" && result.result.status === "complete" ? { status: "ok", result: { ...result.result,
      records: result.result.records.map(record => ({ ...record, conflicts: [record.reference] })) } } : result;
  });
  expect(await acquireStoreUserReferenceAuthority(h.store)).toMatchObject({ status: "refused", refusal: {
    code: "record-malformed", condition: expect.stringContaining("unresolved conflicts"), remedy: { text: expect.any(String) } } });
});
