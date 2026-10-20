/** Publication preserves Candidate authority and atomic record ordering off branch. */
import { describe, expect, it } from "vitest";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { createCandidateAttestation } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../../../src/lib/store/kinds/review/candidate/access.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { writeMetaPause, writeMetaCandidate } from "../../../../src/lib/store/kinds/meta/writers.js";
import { ParsedMetaRecordSchema } from "../../../../src/lib/active/meta-schema.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { IntegrationBoundaryLocusV2Schema, type IntegrationBoundaryLocusV2 } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { runPublish } from "../../../../src/lib/work-unit/verbs/publish.js";
import { buildStoreCurrentWuReconcile } from "../../../../src/lib/work-unit/store-current-wu-reconcile.js";
import { batchLifecycleWrites, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../../src/lib/store/kinds/lineage/writer.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { nativePublicationParameters } from "../../../fixtures/native-publication.js";
const candidate = candidateFixture();
const candidateId = candidate.attestation.candidateId, candidateSubjectDigest = candidate.subject.subjectDigest;
async function seedAttestedMeta(h: ReturnType<typeof createReviewHarness>, ...args: Parameters<typeof h.seedMeta>) {
  const primary = await h.seedMeta(...args);
  await writeCandidateRecord("/memory", "example", candidate, null, { store: h.store, owner: primary.reference.owner });
  return primary;
}
function context(store: Store) {
  const forbidden = async (): Promise<never> => { throw new Error("tracked artifact access"); };
  const ctx: ExecuteTransitionContext = { cwd: "/repo", store, indexFs: { readdir: forbidden, readFile: forbidden },
    setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    writeSoftFields: forbidden, writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
  return { ...ctx, currentWuReconcile: buildStoreCurrentWuReconcile(store) };
}
const parameters = nativePublicationParameters;
describe("store publish", () => {
  it.each(["initial", "refreshed"] as const)("rejects malformed %s fields without publication writes and publishes after repair", async (when) => {
    const h = createReviewHarness(), meta = await seedAttestedMeta(h, "example", { candidateId }, { kind: "active" },
      { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
    let once = true, claims = 0;
    const base = await parameters(h, async () => {});
    const raw = [...h.store.state.records.values()].find((record) => record.reference.kind === "work-item/meta");
    if (raw === undefined) throw new Error("Missing stored metadata");
    const original = raw.content, corrupt = () => { raw.content = original.replace(/^# Metadata:.*$/mu, "No metadata heading"); };
    const params = { ...base, preparePublicationClaim: async (claim: IntegrationBoundaryLocusV2) => { claims++; return base.preparePublicationClaim(claim); },
      refreshCandidateAuthorization: async () => {
        if (when === "refreshed" && once) { once = false; corrupt(); }
        return { candidateId, candidateSubjectDigest, candidateCurrent: true };
      } };
    const version = lifecycleSuccess(await h.store.version());
    if (when === "initial") corrupt();
    expect(await runPublish(context(h.store), params)).toMatchObject({ status: "rejected", refusal: { code: "record-malformed",
      reference: meta.reference, remedy: { text: expect.stringMatching(/repair.*retry/isu) } } });
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).content).toBe(raw.content);
    expect(lifecycleSuccess(await h.store.version())).toBe(version);
    expect(claims).toBe(0);
    raw.content = original;
    expect(await runPublish(context(h.store), params)).toMatchObject({ status: "published" });
    expect(claims).toBe(1);
  });
  it("publishes a renamed dependent after reconciling its retained cut disposition", async () => {
    const h = createReviewHarness(), origin = await h.seedMeta("origin");
    await h.seedMeta("member", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
    const dependent = await h.seedMeta("former-dependent", { dependsOn: ["origin"] }, { kind: "active" },
      { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
    const lineage = recordReferences["lineage/transition"](origin.reference.owner);
    lifecycleSuccess(await batchLifecycleWrites(h.store, [{ action: "remove", reference: origin.reference, expected: origin.version },
      { action: "put", reference: lineage, expected: null, content: writeLineageRecord({ schemaVersion: 2,
        origin: { name: SlugSchema.parse("origin") }, kind: "decompose", successors: [{ name: SlugSchema.parse("member") }],
        incoming: [{ dependent: { name: dependent.reference.owner.name,
          ...(dependent.reference.owner.type === "work-item" ? { uid: dependent.reference.owner.uid } : {}) },
        disposition: { kind: "replace", replacementTargets: [{ name: SlugSchema.parse("member") }] } }], outgoing: [] }) }],
    { verb: "decompose", lifecycleAction: "decompose" }));
    const immutable = lifecycleSuccess(await h.store.read({ reference: lineage }));
    const renamed = await runStoreRename({ store: h.store, cwd: "/memory", baseBranch: "main", exec: async () => { throw Error("No Git needed"); },
      locusPorts: { findHoldingCheckout: async () => null, checkMarkerExclusivity: async () => ({ kind: "clear" }), writeAnchoredMarker: async () => ({ kind: "unadmitted" }) } },
    { sourceSlug: "former-dependent", targetSlug: "example" });
    expect(renamed.status, JSON.stringify(renamed)).toBe("renamed");
    const current = lifecycleSuccess(await h.store.read({ reference: dependent.reference }));
    lifecycleSuccess(await h.store.write({ ...recordPut(current, { content: writeMetaCandidate(current.content, candidateId) }),
      provenance: { verb: "attest", lifecycleAction: "attest" } }));
    await writeCandidateRecord("/memory", "example", candidate, null, { store: h.store, owner: dependent.reference.owner });
    expect(await runPublish(context(h.store), (await parameters(h, async () => {})))).toMatchObject({ status: "published" });
    expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference })).fields).toMatchObject({ state: "Integrating", dependsOn: [] });
    expect(lifecycleSuccess(await h.store.read({ reference: lineage }))).toEqual(immutable);
  });
  it("applies reconcile before renewed authorization and claim, then publishes without deriving Last Completed", async () => {
    const h = createReviewHarness();
    await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
    const primary = await seedAttestedMeta(h, "example", { candidateId, dependsOn: ["done"], lastCompleted: null }, { kind: "active" },
      { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
    let checks = 0;
    const result = await runPublish(context(h.store), (await parameters(h, async () => {
      const meta = ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields);
      expect(meta.state).toBe("Active"); expect(meta.dependsOn).toEqual([]); checks++;
    })));
    expect(result.status).toBe("published"); expect(checks).toBe(2);
    const meta = ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields);
    expect(meta).toMatchObject({ state: "Integrating", currentWorkflow: "integrate-work-unit", lastCompleted: null, nextTask: null });
    if (result.status === "published") expect(result.boundary).toMatchObject({ nextAction: { kind: "continue-publication" } });
  });
});

it("paused publication returns the store-backed resume action before reconcile writes", async () => {
  const h = createReviewHarness(); const primary = await seedAttestedMeta(h, "example", { candidateId });
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, placement: { kind: "active" },
    content: writeMetaPause(primary.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const paused = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  let checkpoints = 0;
  expect(await runPublish(context(h.store), (await parameters(h, async () => { checkpoints++; })))).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "resume", "example"] } });
  expect(checkpoints).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(paused);
});
it("preserves a missing primary's store refusal and recovery action", async () => {
  const h = createReviewHarness();
  expect(await runPublish(context(h.store), (await parameters(h, async () => {})))).toMatchObject({ status: "rejected", refusal: { code: "not-found", remedy: { text: expect.any(String) } } });
});
it("a rerun after reconcile lands reaches the publication batch and preserves ignored legacy orientation", async () => {
  const h = createReviewHarness(); await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const primary = await seedAttestedMeta(h, "example", { candidateId, dependsOn: ["done"], lastCompleted: "Old completed work", nextTask: "Old pointer" }, { kind: "active" },
    { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  let claims = 0;
  const base = await parameters(h, async () => {});
  const params = { ...base, lastCompleted: "Accepted but unwritten override",
    preparePublicationClaim: async (claim: IntegrationBoundaryLocusV2) => { if (++claims === 1) throw new Error("interrupted claim"); return base.preparePublicationClaim(claim); } };
  expect(await runPublish(context(h.store), params)).toMatchObject({ status: "rejected" });
  const reconciled = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(ParsedMetaRecordSchema.parse(reconciled.fields)).toMatchObject({ state: "Active", dependsOn: [] });
  const result = await runPublish(context(h.store), params);
  expect(result.status).toBe("published");
  expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields))
    .toMatchObject({ state: "Integrating", lastCompleted: "Old completed work", nextTask: "Old pointer" });
  expect(claims).toBe(2);
});

it("preserves the resume remedy when a pause arrives after prepare, then publishes after resume", async () => {
  const h = createReviewHarness();
  const primary = await seedAttestedMeta(h, "example", { candidateId }, { kind: "active" },
    { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const ctx = context(h.store), apply = ctx.currentWuReconcile.apply;
  let pauseOnce = true, claims = 0;
  ctx.currentWuReconcile.apply = async (prepared) => {
    if (pauseOnce) {
      pauseOnce = false;
      lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version,
        placement: { kind: "active" }, content: writeMetaPause(primary.content, { pausedBy: SlugSchema.parse("test-user"),
          since: "2026-10-15T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
        provenance: { verb: "pause", lifecycleAction: "pause" } }));
    }
    return apply(prepared);
  };
  const base = await parameters(h, async () => {});
  const params = { ...base, preparePublicationClaim: async (claim: IntegrationBoundaryLocusV2) => { claims++; return base.preparePublicationClaim(claim); } };
  expect(await runPublish(ctx, params)).toMatchObject({ status: "reconcile-failed", reason: "paused",
    remedy: { argv: ["arc", "resume", "example"] } });
  const paused = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(paused.fields).toMatchObject({ state: "Active", pause: expect.any(Object) });
  expect(claims).toBe(0);
  lifecycleSuccess(await h.store.write({ action: "put", reference: paused.reference, expected: paused.version,
    placement: { kind: "active" }, content: writeMetaPause(paused.content, null),
    provenance: { verb: "resume", lifecycleAction: "resume" } }));
  expect(await runPublish(ctx, params)).toMatchObject({ status: "published" });
  expect(claims).toBe(1);
});


it.each(["legacy-candidate", "branch"])("refuses a primary $0 race at the publication claim, then publishes a fresh retry", async (change) => {
  const h = createReviewHarness();
  const primary = await seedAttestedMeta(h, "example", { candidateId }, { kind: "active" },
    { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const otherCandidate = `sha256:${"c".repeat(64)}` as const;
  const base = await parameters(h, async () => {});
  const params = { ...base, preparePublicationClaim: async (claim: IntegrationBoundaryLocusV2) => {
    const current = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
    lifecycleSuccess(await h.store.write({ action: "put", reference: current.reference, expected: current.version,
      placement: { kind: "active" }, content: change === "legacy-candidate" ? writeMetaCandidate(current.content, otherCandidate) : current.content,
      links: change === "branch" ? { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/renewed", linkedAs: "created", excluded: [] }] } : current.links,
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return base.preparePublicationClaim(claim);
  } };
  expect(await runPublish(context(h.store), params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("primary changed") });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields).toMatchObject({ state: "Active" });
  const freshId = candidateId;
  const fresh = { ...(await parameters(h, async () => {})), candidateId: freshId,
    boundary: { ...params.boundary, candidateId: freshId },
    refreshCandidateAuthorization: async () => ({ candidateId: freshId, candidateSubjectDigest, candidateCurrent: true }) };
  expect(await runPublish(context(h.store), fresh)).toMatchObject({ status: "published",
    boundary: { nextAction: { command: `git push -u origin ${change === "branch" ? "feat/renewed" : "feat/example"}` } } });
});


it("advances renewed publication readiness while Integrating and preserves the resulting publication retry", async () => {
  const h = createReviewHarness();
  const primary = await seedAttestedMeta(h, "example", { candidateId, state: "Integrating", currentWorkflow: "integrate-work-unit" }, { kind: "active" },
    { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const params = (await parameters(h, async () => {}));
  const result = await runPublish(context(h.store), params);
  expect(result).toMatchObject({ status: "unchanged", boundary: { locus: "publication-pending",
    nextAction: { kind: "continue-publication", command: "git push -u origin feat/example" } } });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  if (result.status !== "unchanged" || result.boundary.schemaVersion !== 2) {
    throw new Error("Expected version-two publication continuation");
  }
  expect(await runPublish(context(h.store), { ...params, boundary: result.boundary })).toEqual(result);
});
it("refuses unresolved renewed review while Integrating and publishes after readiness is repaired", async () => {
  const h = createReviewHarness();
  await seedAttestedMeta(h, "example", { candidateId, state: "Integrating", currentWorkflow: "integrate-work-unit" }, { kind: "active" },
    { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const params = (await parameters(h, async () => {}));
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2, mode: "pre-publication-review",
    workUnit: "example", candidateId, candidateSubjectDigest, locus: "candidate-review-pending",
    reservation: null, terminus: null, deliveryReviewTermini: [], nextAction: { kind: "continue-pre-publication-review",
      command: "arc review pre-publication example", interactionText: "Resolve review" } });
  expect(await runPublish(context(h.store), { ...params, boundary })).toMatchObject({ status: "rejected",
    reason: expect.stringContaining("obligations remain open"), remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
  expect(await runPublish(context(h.store), params)).toMatchObject({ status: "unchanged", boundary: { locus: "publication-pending" } });
});


it.each(["Active", "Integrating"] as const)("uses the logical work branch for %s publication from a retained Errand branch", async (state) => {
  const h = createReviewHarness();
  const primary = await seedAttestedMeta(h, "example", { candidateId, state, currentWorkflow: state === "Active" ? "process-task-loop" : "integrate-work-unit" }, { kind: "active" }, { branches: [
    { repository: "123e4567-e89b-42d3-a456-426614174099", ref: "chore/retained", linkedAs: "adopted", excluded: [] },
    { repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] },
    { repository: "elsewhere", ref: "feat/foreign", linkedAs: "created", excluded: [] },
  ] });
  const ctx = { ...context(h.store), projectId: async () => "123e4567-e89b-42d3-a456-426614174099", exec: async () => ({ stdout: "chore/retained", stderr: "" }) };
  const result = await runPublish(ctx, (await parameters(h, async () => {})));
  expect(result).toMatchObject({ status: state === "Active" ? "published" : "unchanged", boundary: {
    nextAction: { kind: "continue-publication", command: "git push -u origin feat/example" },
  } });
  const persisted = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(persisted.fields).toMatchObject({ state: "Integrating", currentWorkflow: "integrate-work-unit" });
  expect(persisted.links).toEqual(primary.links);
  if (state === "Integrating") expect(persisted).toEqual(primary);
});

it.each(["Active", "Integrating"] as const)("reads the stored Candidate for %s publication with no metadata Candidate bullet", async state => {
  const h = createReviewHarness();
  const primary = await seedAttestedMeta(h, "example", { state,
    currentWorkflow: state === "Integrating" ? "integrate-work-unit" : "process-task-loop" }, { kind: "active" },
    { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  expect(primary.fields).toMatchObject({ candidateId: null });
  expect(await runPublish(context(h.store), (await parameters(h, async () => {})))).toMatchObject({ status: state === "Active" ? "published" : "unchanged" });
});

it.each(["absent", "different"] as const)("refuses %s stored Candidate authority despite a metadata claim and publishes after repair", async kind => {
  const h = createReviewHarness();
  const primary = await h.seedMeta("example", { candidateId }, { kind: "active" },
    { branches: [{ repository: "123e4567-e89b-42d3-a456-426614174099", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const renewed = { ...candidate, attestation: createCandidateAttestation({ workUnit: "example", subject: candidate.subject,
    baseRevision: candidate.attestation.baseRevision, attestedBy: "andrew", attestedAt: "2026-10-19T00:00:00.000Z",
    verificationEvidenceRef: "tasks-example.md#verification" }) };
  if (kind === "different") await writeCandidateRecord("/memory", "example", renewed, null, { store: h.store, owner: primary.reference.owner });
  const invalid = await parameters(h, async () => {});
  const version = lifecycleSuccess(await h.store.version());
  expect(await runPublish(context(h.store), invalid)).toMatchObject({ status: "rejected",
    reason: expect.stringContaining("Candidate identity is absent or stale") });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  if (kind === "absent") await writeCandidateRecord("/memory", "example", candidate, null, { store: h.store, owner: primary.reference.owner });
  expect(await runPublish(context(h.store), (await parameters(h, async () => {}, kind === "different" ? renewed : candidate))))
    .toMatchObject({ status: "published" });
});
