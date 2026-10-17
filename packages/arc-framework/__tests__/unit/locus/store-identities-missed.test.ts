/** Incomplete inventories require exact marker proof without hiding their public incompleteness. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { readStoreIdentityEvidence, markerIdentitySnapshot, projectStoreIdentityDiscovery, type StoreIdentityEvidence } from "../../../src/lib/locus/store-identities.js";
import { projectDerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { DormantMarkerGenerationEvidence } from "../../../src/lib/locus/derived-lifecycle-evidence.js";
import type { Store } from "../../../src/lib/store/contract.js";

async function fixture(kind: "errand" | "groom" | "housekeep", omit = false) {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const slug = kind === "groom" ? "groom-alpha" : "repair", claimId = "a".repeat(32);
  const base = { version: 3, slug, claimId, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", state: "open", changeRequest: null, branch: `chore/${slug}` };
  const content = TransientIdentityRecordSchema.parse(kind === "groom"
    ? { ...base, kind, protection: "full", anchorStub: "alpha", members: ["alpha"], openedBaseHead: "a".repeat(40) }
    : { ...base, kind: "errand", purpose: kind === "errand" ? "errand" : "housekeep-routing", savedHead: null,
      ...(kind === "errand" ? { owner: "alice", intent: "Repair", origin: "description", originEntry: null } : {}) });
  const person = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  const reference = kind === "errand" ? recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug }))
    : kind === "groom" ? recordReferences["claims/groom"](person, slug) : recordReferences["claims/housekeep"](person, slug);
  const saved = await h.seed(reference, JSON.stringify(content), kind === "errand" ? { kind: "active" } : undefined);
  const partial = Object.create(h.store) as Store;
  partial.list = async input => {
    const listed = await h.store.list(input);
    return input.kind === reference.kind && listed.status === "ok" && listed.result.status === "complete"
      ? { status: "ok", result: { ...listed.result, missed: true, records: omit ? [] : listed.result.records } } : listed;
  };
  const marker: DormantMarkerGenerationEvidence = { kind: "present", generation: "generation", marker: {
    spawnedByArc: true, provisioning: "ready", createdFor: { kind, slug, claimId },
  } };
  const project = async (evidence: StoreIdentityEvidence) => projectDerivedCheckoutRow({
    checkout: { path: "/holder", branch: base.branch, head: "b".repeat(40), detached: false, primary: false, folderPresent: true }, marker,
    activeMeta: { kind: "absent" }, completed: { status: "available", records: new Map() },
    identities: await markerIdentitySnapshot(evidence, marker, partial), primarySafety: { kind: "error", message: "Not primary" },
  });
  return { ...h, partial, saved, content, project };
}

it.each(["errand", "groom", "housekeep"] as const)("withholds an incompletely inventoried %s when exact corroboration refuses, then retries without clearing missed", async kind => {
  const h = await fixture(kind);
  let unavailable = true;
  h.partial.lookup = async input => unavailable ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "claims",
    condition: "Exact claim lookup is unavailable.", remedy: { text: "Restore exact claim lookup, then retry." } } } : h.store.lookup(input);
  const evidence = await readStoreIdentityEvidence(h.partial, "alice");
  const blocked = await h.project(evidence);
  expect(blocked.kind).toBe("unresolved-checkout");
  expect(blocked.diagnostics.map(item => item.message).join(" ")).toMatch(/exact claim lookup.*retry/iu);
  unavailable = false;
  expect((await h.project(evidence)).kind).toBe("transient");
  const publicEvidence = projectStoreIdentityDiscovery(evidence, []);
  expect(kind === "errand" ? publicEvidence.errands : publicEvidence.claims).toMatchObject({ kind: "complete", missed: true });
});

it.each(["errand", "groom", "housekeep"] as const)("corroborates an omitted %s through its exact claim at the acquired saved state", async kind => {
  const h = await fixture(kind, true), evidence = await readStoreIdentityEvidence(h.partial, "alice");
  if (kind === "errand") {
    lifecycleSuccess(await h.store.write({ action: "put", reference: h.saved.reference, expected: h.saved.version, placement: { kind: "active" },
      content: JSON.stringify({ ...h.content, state: "paused", savedHead: "c".repeat(40) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
    const current = lifecycleSuccess(await h.store.read({ reference: h.saved.reference }));
    expect(TransientIdentityRecordSchema.parse(JSON.parse(current.content))).toMatchObject({ state: "paused" });
  }
  expect((await h.project(evidence)).kind).toBe("transient");
  const publicEvidence = projectStoreIdentityDiscovery(evidence, []);
  expect(kind === "errand" ? publicEvidence.errands : publicEvidence.claims).toMatchObject({ kind: "complete", missed: true, identities: [] });
});
