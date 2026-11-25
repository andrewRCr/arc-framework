/** Incomplete inventories require exact marker proof without hiding their public incompleteness. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { readStoreIdentityEvidence, markerIdentitySnapshot, projectStoreIdentityDiscovery, type StoreIdentityEvidence } from "../../../src/lib/locus/store-identities.js";
import { projectDerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { DormantMarkerGenerationEvidence } from "../../../src/lib/locus/derived-lifecycle-evidence.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

async function fixture(kind: "errand" | "groom" | "housekeep", omit = false, missingOwner = false, missed = true) {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const slug = kind === "groom" ? "groom-alpha" : "repair", claimId = "a".repeat(32);
  const base = { version: 3, slug, claimId, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", state: "open", changeRequest: null, branch: `chore/${slug}` };
  const content = TransientIdentityRecordSchema.parse(kind === "groom"
    ? { ...base, kind, protection: "full", anchorStub: "alpha", members: ["alpha"], openedBaseHead: "a".repeat(40) }
    : { ...base, kind: "errand", purpose: kind === "errand" ? "errand" : "housekeep-routing", savedHead: null,
      ...(kind === "errand" ? { ...(missingOwner ? {} : { owner: "alice" }), intent: "Repair", origin: "description", originEntry: null } : {}) });
  const person = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  const reference = kind === "errand" ? recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug }))
    : kind === "groom" ? recordReferences["claims/groom"](person, slug) : recordReferences["claims/housekeep"](person, slug);
  const saved = await h.seed(reference, JSON.stringify(content), kind === "errand" ? { kind: "active" } : undefined);
  const partial = Object.create(h.store) as Store;
  partial.list = async input => {
    const listed = await h.store.list(input);
    return missed && input.kind === reference.kind && listed.status === "ok" && listed.result.status === "complete"
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

it.each(["normal", "missed", "omitted"])("retains a valid Errand role and its subject-local owner repair after %s discovery", async mode => {
  const h = await fixture("errand", mode === "omitted", true, mode !== "normal");
  const evidence = await readStoreIdentityEvidence(h.partial, "alice");
  const row = await h.project(evidence);
  expect(row).toMatchObject({ kind: "transient", identity: { kind: "errand", key: "repair", claimId: "a".repeat(32) } });
  expect(row.diagnostics).toEqual([expect.objectContaining({ message: expect.stringMatching(/Errand owner is missing.*Repair.*record repair.*retry/u) })]);
  expect(projectStoreIdentityDiscovery(evidence, []).errands).toMatchObject({ kind: "complete", missed: mode !== "normal",
    identities: mode === "omitted" ? [] : [expect.objectContaining({ key: "repair" })] });
});

it("keeps another Errand's owner warning off a valid owned subject", async () => {
  const h = await fixture("errand", false, false, false);
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "other" }));
  await h.seed(reference, JSON.stringify({ ...h.content, slug: "other", branch: "chore/other", claimId: "b".repeat(32), owner: undefined }), { kind: "active" });
  const evidence = await readStoreIdentityEvidence(h.partial, "alice");
  expect(evidence.errands).toMatchObject({ missed: false, diagnostics: [expect.objectContaining({ key: "other", condition: expect.stringContaining("Errand owner is missing") })] });
  expect(await h.project(evidence)).toMatchObject({ kind: "transient", subject: { kind: "errand", key: "repair" }, diagnostics: [] });
});

it("reports an omitted Errand's owner warning at the acquired state after its current record is repaired", async () => {
  const h = await fixture("errand", true, true);
  const evidence = await readStoreIdentityEvidence(h.partial, "alice");
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.saved.reference, expected: h.saved.version,
    placement: { kind: "active" }, content: JSON.stringify({ ...h.content, owner: "alice" }), provenance: { verb: "repair", lifecycleAction: "repair" } }));
  const pinned = await h.project(evidence);
  expect(pinned.kind).toBe("transient");
  expect(pinned.diagnostics).toEqual([expect.objectContaining({ message: expect.stringMatching(/Errand owner is missing.*retry/u) })]);
  expect(await h.project(await readStoreIdentityEvidence(h.partial, "alice"))).toMatchObject({ kind: "transient", diagnostics: [] });
});

it("keeps a valid Errand's observed checkout usable beside its advisory owner warning", async () => {
  const h = await fixture("errand", false, true, false);
  const row = await h.project(await readStoreIdentityEvidence(h.partial, "alice"));
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await deriveStoreInFlight({ store: h.partial, exec: fake.exec, identity: "alice", teamMode: false,
    projectId: async () => "project", roster: [row] });
  expect(result.entries).toEqual([expect.objectContaining({ slug: "repair", worktreePath: "/holder" })]);
  expect(result.entries[0]).not.toHaveProperty("marks");
  expect(result.warnings).toEqual([expect.objectContaining({ rendered: expect.stringMatching(/Errand owner is missing.*retry/u) })]);
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
