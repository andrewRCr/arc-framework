/** Terminal and merge authority use independent acquisitions and exact store subject records. */
import type { WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { currentStateVersion, recordKey } from "../../helpers/store/model.js";
import { expect, it, vi } from "vitest";
import { terminalStoreFixture } from "../../helpers/store-terminal-authority.js";
import { authorizeErrandTerminal } from "../../../src/lib/errand/terminal-authority.js";
import { selectCurrentErrandMergeIdentity } from "../../../src/scripts/integration/errand-merge-composition.js";
it("admits a current ordinary Errand with authoritatively absent claims at terminal and merge gates", async () => {
  const h = await terminalStoreFixture(), frame = await h.frame();
  expect(frame.identityDiscovery).toMatchObject({ kind: "store", errands: { kind: "complete" }, claims: { kind: "absent" } });
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "authorized", authority: "current-checkout", generation: `errand-v1/repair/${h.record.claimId}` });
  expect(await selectCurrentErrandMergeIdentity(frame, "repair", h.store)).toEqual({ slug: "repair", claimId: h.record.claimId, branch: "chore/repair", generation: `errand-v1/repair/${h.record.claimId}` });
});

it("refuses a failed claims read with its repair, then admits after the actual claims namespace recovers", async () => {
  const h = await terminalStoreFixture(), list = h.store.list.bind(h.store);
  const failure = vi.spyOn(h.store, "list").mockImplementation(async input => input.family === "claims"
    ? { status: "ok", result: { status: "unreadable", condition: "The claims snapshot index cannot be read.", remedy: { text: "Restore the claims snapshot index, then retry." } } } : list(input));
  const frame = await h.frame();
  if (frame.identityDiscovery.kind !== "store" || frame.identityDiscovery.claims.kind !== "error") throw new Error("Expected failed claims acquisition");
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "abandon", subject: h.subject })).toMatchObject({ kind: "refused", message: expect.stringContaining(frame.identityDiscovery.claims.message) });
  await expect(selectCurrentErrandMergeIdentity(frame, "repair", h.store)).rejects.toThrow(frame.identityDiscovery.claims.message);
  failure.mockRestore();
  const repaired = await h.frame();
  expect(await authorizeErrandTerminal({ frame: repaired, store: h.store, operation: "abandon", subject: h.subject })).toMatchObject({ kind: "authorized" });
  expect(await selectCurrentErrandMergeIdentity(repaired, "repair", h.store)).toMatchObject({ claimId: h.subject.claimId });
});

it("keeps another person's malformed Errand out of this subject's terminal and merge admission", async () => {
  const h = await terminalStoreFixture();
  const other = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "broken" })),
    JSON.stringify({ ...h.record, slug: "broken", owner: "bob", branch: "chore/broken", claimId: "b".repeat(32) }), { kind: "active" });
  corruptStoredBytes(h, other.reference, "not JSON");
  const frame = await h.frame();
  expect(frame.identityDiscovery).toMatchObject({ kind: "store", errands: { kind: "complete", diagnostics: [{ condition: expect.any(String) }] } });
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "authorized" });
  expect(await selectCurrentErrandMergeIdentity(frame, "repair", h.store)).toMatchObject({ claimId: h.subject.claimId });
});

async function seedGroom(h: Awaited<ReturnType<typeof terminalStoreFixture>>) {
  return h.seed(recordReferences["claims/groom"](OwnerIdentitySchema.parse({ type: "person", name: "alice" }), "groom-alpha"),
    JSON.stringify({ version: 3, kind: "groom", slug: "groom-alpha", claimId: "d".repeat(32), createdAt: h.record.createdAt, updatedAt: h.record.updatedAt,
      anchorStub: "alpha", members: ["alpha"], openedBaseHead: "e".repeat(40), protection: "full", branch: "chore/groom-alpha", state: "open", changeRequest: null }));
}

it("refuses a claims diagnostic with its remedy and admits after the claim is repaired", async () => {
  const h = await terminalStoreFixture(), claim = await seedGroom(h);
  const repair = corruptStoredBytes(h, claim.reference, "not JSON");
  const frame = await h.frame();
  if (frame.identityDiscovery.kind !== "store" || frame.identityDiscovery.claims.kind !== "complete") throw new Error("Expected complete claims inventory");
  const diagnostic = frame.identityDiscovery.claims.diagnostics[0];
  if (diagnostic === undefined) throw new Error("Expected broken claim diagnostic");
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "leave", subject: h.subject })).toMatchObject({ kind: "refused", message: expect.stringContaining(diagnostic.remedy.text) });
  await expect(selectCurrentErrandMergeIdentity(frame, "repair", h.store)).rejects.toThrow(diagnostic.remedy.text);
  repair();
  const repaired = await h.frame();
  expect(await authorizeErrandTerminal({ frame: repaired, store: h.store, operation: "leave", subject: h.subject })).toMatchObject({ kind: "authorized" });
  expect(await selectCurrentErrandMergeIdentity(repaired, "repair", h.store)).toMatchObject({ claimId: h.subject.claimId });
});

it("refuses the subject's own missing owner while preserving the named record repair", async () => {
  const h = await terminalStoreFixture();
  const written = await h.store.write({ action: "put", reference: h.saved.reference, expected: h.saved.version,
    content: JSON.stringify({ ...h.record, owner: undefined }), placement: { kind: "active" }, provenance: { verb: "test-owner", lifecycleAction: "update" } });
  expect(written.status).toBe("ok");
  const frame = await h.frame();
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "refused", message: expect.stringContaining("owner") });
  await expect(selectCurrentErrandMergeIdentity(frame, "repair", h.store)).rejects.toThrow("owner");
});

// Physical corruption is injected below write validation, in both current storage and its saved-state copy.
function corruptStoredBytes(h: Awaited<ReturnType<typeof terminalStoreFixture>>, reference: typeof h.saved.reference, content: string) {
  const key = recordKey(reference), current = h.store.state.records.get(key);
  const snapshot = h.store.state.snapshots.get(currentStateVersion(h.store.state))?.get(key);
  if (current === undefined || snapshot === undefined) throw new Error("Expected persisted record and snapshot");
  const previous = current.content; current.content = content; snapshot.content = content;
  return () => { current.content = previous; snapshot.content = previous; };
}

it("names diagnostic and repair when the exact subject lookup cannot resolve malformed stored bytes", async () => {
  const h = await terminalStoreFixture(); corruptStoredBytes(h, h.saved.reference, "not JSON");
  const frame = await h.frame();
  if (frame.identityDiscovery.kind !== "store" || frame.identityDiscovery.errands.kind !== "complete") throw new Error("Expected Errands snapshot");
  const diagnostic = frame.identityDiscovery.errands.diagnostics[0];
  if (diagnostic === undefined) throw new Error("Expected malformed subject diagnostic");
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "refused", message: expect.stringContaining(diagnostic.remedy.text) });
  await expect(selectCurrentErrandMergeIdentity(frame, "repair", h.store)).rejects.toThrow(diagnostic.remedy.text);
});

it("keeps legacy marker admission when a current lookup finds no subject beside no listing diagnostic", async () => {
  const h = await terminalStoreFixture(), frame = await h.frame();
  // The frame's saved inventory remains valid while the current object disappears before exact lookup.
  h.store.state.records.delete(recordKey(h.saved.reference));
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "authorized" });
  expect(await selectCurrentErrandMergeIdentity(frame, "repair", h.store)).toMatchObject({ claimId: h.subject.claimId });
});

it("preserves an exact record read refusal and admits after that storage format is repaired", async () => {
  const h = await terminalStoreFixture(), frame = await h.frame();
  const stored = h.store.state.records.get(recordKey(h.saved.reference));
  if (stored === undefined) throw new Error("Expected persisted subject");
  const previous = stored.formatVersion; stored.formatVersion = 99;
  const unreadable = await h.store.read({ reference: h.saved.reference });
  if (unreadable.status !== "refused") throw new Error("Expected unsupported stored format");
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "refused", message: expect.stringContaining(unreadable.refusal.condition) });
  await expect(selectCurrentErrandMergeIdentity(frame, "repair", h.store)).rejects.toThrow(unreadable.refusal.remedy.text);
  stored.formatVersion = previous;
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "authorized" });
});

it("resolves the active UID and exact claim when a completed Errand retains the same slug", async () => {
  const h = await terminalStoreFixture();
  const completed = await h.store.write({ action: "put", reference: h.saved.reference, expected: h.saved.version,
    content: JSON.stringify(h.record), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "complete-fixture", lifecycleAction: "complete" } });
  expect(completed.status).toBe("ok");
  const claimId = "f".repeat(32);
  const active = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "repair", uid: "00000000-0000-4000-8000-000000000002" })),
    JSON.stringify({ ...h.record, claimId, owner: "bob" }), { kind: "active" });
  expect(active.reference.owner).not.toEqual(h.saved.reference.owner);
  const read = h.io.readMarker;
  h.io.readMarker = async cwd => {
    const result = await read(cwd);
    if (result.kind !== "present") return result;
    const marker: WorktreeMarker = { spawnedByArc: result.marker.spawnedByArc, spawningIdentity: result.marker.spawningIdentity,
      createdAt: result.marker.createdAt, parentCheckoutPath: "/repo", provisioning: "ready", createdFor: { kind: "errand", slug: "repair", claimId } };
    return { ...result, marker, bytes: Buffer.from(`${JSON.stringify(marker, null, 2)}\n`) };
  };
  const frame = await h.frame();
  const subject = { kind: "errand" as const, slug: "repair", claimId };
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject })).toMatchObject({ kind: "authorized" });
  expect(await selectCurrentErrandMergeIdentity(frame, "repair", h.store)).toMatchObject({ claimId });
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "refused", message: expect.stringContaining("active Errand record") });
});

it("refuses an exact subject with an unresolved conflict record", async () => {
  const h = await terminalStoreFixture(), frame = await h.frame();
  const value = { reference: h.saved.reference, content: h.saved.content, version: h.saved.version,
    formatVersion: h.saved.formatVersion, placement: h.saved.placement };
  const conflict = await h.store.write({ action: "put", reference: recordReferences["work-item/conflict-record"](h.saved.reference.owner, "subject-conflict"), expected: null, content: JSON.stringify({ record: h.saved.reference,
    location: { kind: "record" }, base: null, current: { value, label: { actor: "alice", time: h.record.createdAt } },
    incoming: { value: null, label: { actor: "bob", time: h.record.createdAt } } }), provenance: { verb: "merge", lifecycleAction: "capture" } });
  expect(conflict.status).toBe("ok");
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "close", subject: h.subject })).toMatchObject({ kind: "refused", message: expect.stringContaining("conflicts") });
  await expect(selectCurrentErrandMergeIdentity(frame, "repair", h.store)).rejects.toThrow("Resolve its conflict records");
});

it("preserves exact foreign confirmation for an identity-only Errand with no checkout holder", async () => {
  const h = await terminalStoreFixture(), scan = await h.io.scanWorktrees();
  if (!scan.ok) throw new Error("Expected topology");
  h.io.scanWorktrees = async () => ({ ...scan, worktrees: scan.worktrees.filter(row => row.primary) });
  const frame = await h.frame("/repo"), generation = `errand-v1/repair/${h.subject.claimId}`;
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "abandon", subject: h.subject })).toMatchObject({ kind: "confirmation-required", checkoutPath: null, generation });
  expect(await authorizeErrandTerminal({ frame, store: h.store, operation: "abandon", subject: h.subject, confirmForeignGeneration: generation })).toMatchObject({ kind: "authorized", authority: "confirmed-foreign", checkoutPath: null, row: null });
});
