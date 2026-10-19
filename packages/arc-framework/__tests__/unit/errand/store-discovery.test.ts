/** Store migration behavior through production store and runtime boundaries. */
import { expect, it, vi } from "vitest";
import { acquireStoreErrands, acquireStoreClaims } from "../../../src/lib/errand/store-discovery.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
const source = { version: 3, slug: "fix-it", claimId: "a".repeat(32), createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z",
  kind: "errand", purpose: "errand", intent: "Fix", branch: "chore/fix-it", state: "open", savedHead: null, changeRequest: null, origin: "description", originEntry: null };
it("keeps active Errands project-scoped and ownerless diagnostics apart from claims", async () => {
  const h = createLifecycleHarness();
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })), JSON.stringify(source), { kind: "active" });
  const errands = await acquireStoreErrands(h.store);
  expect(errands).toMatchObject({ kind: "complete", identities: [{ key: "fix-it" }], diagnostics: [{ condition: expect.stringContaining("owner") }] });
  expect(await acquireStoreClaims(h.store, "alice")).toMatchObject({ kind: "absent" });
  h.store.environment.identity = "alice";
  const owner = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  await h.seed(recordReferences["claims/housekeep"](owner, "routing"), JSON.stringify({ ...source, slug: "routing", branch: "chore/routing", purpose: "housekeep-routing", intent: undefined, origin: undefined, originEntry: undefined }));
  const claims = await acquireStoreClaims(h.store, "alice");
  expect(claims).toMatchObject({ kind: "complete", identities: [{ key: "routing" }], diagnostics: [] });
  expect(await acquireStoreErrands(h.store)).toMatchObject({ kind: "complete", identities: [{ key: "fix-it" }] });
});
it("retains independent acquisition failures", async () => {
  const h = createLifecycleHarness(), list = h.store.list.bind(h.store);
  const spy = vi.spyOn(h.store, "list").mockImplementation(async (input) => input.family === "claims"
    ? { status: "ok", result: { status: "unreadable", condition: "Claims unreadable", remedy: { text: "Repair claims" } } } : list(input));
  expect(await acquireStoreClaims(h.store, "alice")).toEqual({ kind: "error", message: "Claims unreadable Repair claims" });
  expect(await acquireStoreErrands(h.store)).toMatchObject({ kind: "absent" });
  spy.mockRestore();
});

it("retains both claims from the initial snapshot when their current records change between listings", async () => {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const owner = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  const groom = { version: 3, slug: "groom-alpha", claimId: source.claimId, createdAt: source.createdAt, updatedAt: source.updatedAt,
    kind: "groom", anchorStub: "alpha", members: ["alpha"], openedBaseHead: "a".repeat(40), protection: "full", branch: "chore/groom-alpha", state: "open", changeRequest: null };
  const routing = { ...source, slug: "routing", branch: "chore/routing", purpose: "housekeep-routing", intent: undefined, origin: undefined, originEntry: undefined };
  const initial = [await h.seed(recordReferences["claims/groom"](owner, "groom-alpha"), JSON.stringify(groom)),
    await h.seed(recordReferences["claims/housekeep"](owner, "routing"), JSON.stringify(routing))];
  const updated = [groom, routing].map(record => JSON.stringify({ ...record, claimId: "b".repeat(32) }));
  const list = h.store.list.bind(h.store);
  let changed = false;
  vi.spyOn(h.store, "list").mockImplementation(async input => {
    const result = await list(input);
    if (input.family === "claims" && !changed) {
      changed = true;
      lifecycleSuccess(await h.store.batch({ provenance: { verb: "replace-claims", lifecycleAction: "capture" }, writes: initial.map((record, index) => ({ action: "put", reference: record.reference,
      expected: record.version, content: updated[index] ?? "" })) }));
    }
    return result;
  });
  const acquired = await acquireStoreClaims(h.store, "alice");
  expect(acquired).toMatchObject({ kind: "complete", identities: [{ key: "groom-alpha", claimId: source.claimId }, { key: "routing", claimId: source.claimId }], diagnostics: [], missed: false });
  for (const record of initial) {
    const current = lifecycleSuccess(await h.store.read({ reference: record.reference }));
    expect(JSON.parse(current.content)).toMatchObject({ claimId: "b".repeat(32) });
  }
});
