/** Prepared user-reference authority retains the exact records behind every transition. */
import { expect, it } from "vitest";
import { acquireStoreUserReferenceAuthority, readStoreUserReferenceTransitions } from "../../../../src/lib/store/user-reference-authority.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
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
