/** Synchronized transient conflicts withhold exact checkout authority until resolution. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { readStoreIdentityEvidence, markerIdentitySnapshot, projectStoreIdentityDiscovery } from "../../../src/lib/locus/store-identities.js";
import { projectDerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import { readStoreTerminalBasis } from "../../../src/lib/errand/store-terminal-basis.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import type { StoreIdentityEvidence } from "../../../src/lib/locus/store-identities.js";

const claimId = "a".repeat(32);
const base = { version: 3, claimId, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", state: "open", changeRequest: null };
function errand(slug: string) {
  return { ...base, savedHead: null, kind: "errand", purpose: "errand", slug, owner: "alice", branch: `chore/${slug}`, intent: "Fix", origin: "description", originEntry: null };
}
function housekeep(slug: string) { return { ...base, savedHead: null, kind: "errand", purpose: "housekeep-routing", slug, branch: `chore/${slug}` }; }
function row(evidence: StoreIdentityEvidence, kind: "errand" | "groom" | "housekeep", slug = "subject") {
  const marker = { kind: "present" as const, generation: "generation", marker: { spawnedByArc: true, provisioning: "ready" as const, createdFor: { kind, slug, claimId } } };
  return projectDerivedCheckoutRow({
    checkout: { path: "/holder", head: "b".repeat(40), branch: `chore/${slug}`, detached: false, primary: false, folderPresent: true }, marker,
    activeMeta: { kind: "absent" }, completed: { status: "available", records: new Map() },
    identities: markerIdentitySnapshot(evidence, marker), primarySafety: { kind: "error", message: "Not primary" },
  });
}

it.each(["errand", "groom", "housekeep"] as const)("withholds conflicted %s authority, preserves healthy identities and resumes after resolution", async kind => {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const person = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "healthy-errand" })), JSON.stringify(errand("healthy-errand")), { kind: "active" });
  await h.seed(recordReferences["claims/housekeep"](person, "healthy-claim"), JSON.stringify(housekeep("healthy-claim")));
  const slug = kind === "groom" ? "groom-alpha" : "subject";
  const content = TransientIdentityRecordSchema.parse(kind === "errand" ? errand(slug) : kind === "housekeep" ? housekeep(slug)
    : { ...base, slug, kind: "groom", protection: "full", anchorStub: "alpha", members: ["alpha"], openedBaseHead: "a".repeat(40), branch: `chore/${slug}` });
  const reference = kind === "errand" ? recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug }))
    : kind === "groom" ? recordReferences["claims/groom"](person, slug) : recordReferences["claims/housekeep"](person, slug);
  const initial = await h.seed(reference, JSON.stringify(content), kind === "errand" ? { kind: "active" } : undefined);
  expect(row(await readStoreIdentityEvidence(h.store, "alice"), kind, slug).kind).toBe("transient");
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry }); writer.environment.identity = "alice";
  const other = lifecycleSuccess(await writer.read({ reference: initial.reference }));
  const provenance = { verb: "update", lifecycleAction: "update" };
  lifecycleSuccess(await h.store.write({ action: "put", reference: initial.reference, expected: initial.version,
    content: JSON.stringify({ ...content, updatedAt: "2026-10-14T01:00:00Z" }), ...(kind === "errand" ? { placement: { kind: "active" as const } } : {}), provenance }));
  lifecycleSuccess(await writer.write({ action: "put", reference: initial.reference, expected: other.version,
    content: JSON.stringify({ ...content, updatedAt: "2026-10-14T02:00:00Z" }), ...(kind === "errand" ? { placement: { kind: "active" as const } } : {}), provenance }));
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference: initial.reference })); expect(disputed.conflicts).toHaveLength(1);
  const evidence = await readStoreIdentityEvidence(h.store, "alice"), acquisition = kind === "errand" ? evidence.errands : evidence.claims;
  expect(acquisition).toMatchObject({ kind: "complete", missed: true, diagnostics: [{ key: slug, condition: expect.stringContaining("conflicts"), remedy: { text: expect.stringMatching(/resolve.*retry/iu) } }] });
  if (acquisition.kind !== "complete") throw new Error("No selected acquisition");
  expect(acquisition.decoded.has(slug)).toBe(false);
  expect(acquisition.identities.some(identity => identity.key === slug)).toBe(false);
  const blocked = row(evidence, kind, slug);
  expect(blocked).toMatchObject({ kind: "unresolved-checkout", identity: null });
  for (const conflict of disputed.conflicts) expect(blocked.diagnostics.map(item => item.message).join(" ")).toContain(JSON.stringify(conflict));
  expect(row(evidence, "errand", "healthy-errand").kind).toBe("transient");
  expect(row(evidence, "housekeep", "healthy-claim").kind).toBe("transient");
  const terminal = await readStoreTerminalBasis({ store: h.store, discovery: projectStoreIdentityDiscovery(evidence, []), subject: { slug: "healthy-errand", claimId } });
  expect(terminal.kind).toBe(kind === "errand" ? "ready" : "refused");
  lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version, resolves: disputed.conflicts,
    content: JSON.stringify(content), ...(kind === "errand" ? { placement: { kind: "active" as const } } : {}), provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  const repaired = await readStoreIdentityEvidence(h.store, "alice");
  expect(kind === "errand" ? repaired.errands : repaired.claims).toMatchObject({ kind: "complete", missed: false, diagnostics: [] });
  expect(row(repaired, kind, slug)).toMatchObject({ kind: "transient", subject: { kind, key: slug, claimId } });
  expect(await readStoreTerminalBasis({ store: h.store, discovery: projectStoreIdentityDiscovery(repaired, []), subject: { slug: "healthy-errand", claimId } })).toMatchObject({ kind: "ready" });
});
