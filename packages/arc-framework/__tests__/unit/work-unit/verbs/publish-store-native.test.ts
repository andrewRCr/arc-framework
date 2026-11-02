/** Native publication commits its readiness claim and lifecycle move together. */
import { expect, it, onTestFinished } from "vitest";
import { ReviewOwnerSelectionError } from "../../../../src/lib/store/kinds/review/errors.js";
import { storedWorkUnitMismatch } from "../../../../src/lib/store/kinds/review/access-shared.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { boundaryV1Fixture, boundaryV2Fixture } from "../../../fixtures/review-boundary.js";
import { IntegrationBoundaryLocusV2Schema, type IntegrationBoundaryLocusV2 } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createReviewCompositionContext } from "../../../../src/scripts/review-gate/runtime/composition-context.js";
import { readReviewReadinessBinding } from "../../../../src/scripts/review-gate/runtime/readiness-binding.js";
import { prepareNativePublicationClaim } from "../../../../src/lib/store/kinds/review/integration-boundary/publication.js";
import { ReviewOutcomeSchema } from "../../../../src/lib/store/kinds/review/outcome/schema.js";
import { localOutcome } from "../../../fixtures/review-outcome.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createReviewOutcomePort } from "../../../../src/lib/store/kinds/review/outcome/access.js";
import { projectCandidateReviewBoundary, projectPublicationBoundary } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeSubmissionBoundary, readSubmissionBoundaryVersioned } from "../../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createPublicationBoundaryAccess, openPublicationReviewContext } from "../../../../src/handlers/lifecycle-publication-boundary.js";
import { performedEvidenceFixture } from "../../../fixtures/review-evidence.js";
import { approvedFixDecision, terminusDecision } from "../../../fixtures/review-decision.js";
import { createReviewEvidencePort } from "../../../../src/lib/store/kinds/review/evidence/access.js";
import { createReviewDecisionPort } from "../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../src/lib/store/kinds/review/decision/key.js";
import { recordLaneAttempt } from "../../../../src/scripts/review-gate/lane-progress.js";
import { candidateRecordFixture } from "../../../fixtures/review-candidate.js";
import { CandidateManagedRecordV1Schema } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecordVersioned, writeCandidateRecord } from "../../../../src/lib/store/kinds/review/candidate/access.js";
import { runPublish } from "../../../../src/lib/work-unit/verbs/publish.js";
import { buildStoreCurrentWuReconcile } from "../../../../src/lib/work-unit/store-current-wu-reconcile.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import { StoreRefusalError } from "../../../../src/lib/store/refusal-error.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";

async function fixture() {
  const h = createReviewHarness(), repositoryId = "123e4567-e89b-42d3-a456-426614174099", candidate = candidateFixture();
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example", { candidateId: null }, { kind: "active" }, {
    branches: [{ repository: repositoryId, ref: "feat/example", linkedAs: "created", excluded: [] }],
  });
  await h.seedCandidate(primary.reference.owner, candidate);
  const checkout = await createReviewCheckout(h, { script: [{ match: ["rev-parse", "HEAD"], responses: [{ stdout: "a".repeat(40) }] }] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy("feat/example", { kind: "work-unit", name: "example" });
  const { family } = createReviewCompositionContext({ ...checkout, workItem: primary.reference.owner });
  const candidateId = candidate.attestation.candidateId, candidateSubjectDigest = candidate.subject.subjectDigest;
  const readReadinessBinding = () => readReviewReadinessBinding({ store: h.store, workItem: primary.reference.owner,
    inFlight: family.ports.inFlight, repositoryId, candidateId, headSha: "a".repeat(40) });
  const binding = await readReadinessBinding();
  if (binding.status !== "complete") throw new Error(binding.condition);
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("candidate-publish-ready"), candidateId,
    candidateSubjectDigest, reservation: null, readinessBinding: binding.digest });
  if (boundary.locus !== "candidate-publish-ready") throw new Error("expected ready publication");
  await h.seedBoundary(primary.reference.owner, boundary);
  const snapshot = await readSubmissionBoundaryVersioned(checkout.cwd, "example", { store: h.store, owner: primary.reference.owner });
  const forbidden = (): Promise<never> => Promise.reject(new Error("tracked publication write"));
  const ctx: ExecuteTransitionContext = { ...checkout, indexFs: { readdir: forbidden, readFile: forbidden },
    setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    writeSoftFields: forbidden, writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
  const params = { name: "example", candidateId, candidateSubjectDigest, candidateCurrent: true, boundary,
    refreshCandidateAuthorization: () => Promise.resolve({ candidateId, candidateSubjectDigest, candidateCurrent: true }),
    readReadinessBinding, readStandardLaneOwnerVersion: forbidden, claimPublicationBoundary: forbidden,
    preparePublicationClaim: (claim: IntegrationBoundaryLocusV2) => prepareNativePublicationClaim({ store: h.store,
      cwd: checkout.cwd, owner: primary.reference.owner, boundary: claim, expectedVersion: snapshot.version, readReadinessBinding }) };
  return { ...h, ...checkout, primary, params, ctx: { ...ctx, currentWuReconcile: buildStoreCurrentWuReconcile(h.store) } };
}

it("publishes without a metadata Candidate bullet and commits the native claim in the lifecycle batch", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  expect(h.primary.fields).toMatchObject({ candidateId: null, state: "Active" });
  const result = await runPublish(h.ctx, h.params);
  expect(result).toMatchObject({ status: "published", boundary: { schemaVersion: 2, locus: "publication-pending",
    readinessBinding: h.params.boundary.readinessBinding } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).fields)
    .toMatchObject({ state: "Integrating", candidateId: null });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner })).boundary)
    .toMatchObject({ schemaVersion: 2, locus: "publication-pending", readinessBinding: h.params.boundary.readinessBinding });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes.map(change => change.reference.kind).sort()).toEqual(["review/integration-boundary", "work-item/meta"]);
  const batchIds = changes.map(change => "batchId" in change.provenance ? change.provenance.batchId : undefined);
  expect(batchIds).toEqual([expect.any(String), expect.any(String)]);
  expect(new Set(batchIds).size).toBe(1);
});

it("refuses an incomplete claim-time listing without publishing and prepares successfully after repair", async () => {
  const h = await fixture(), before = await h.store.version();
  const claim = projectPublicationBoundary({ workUnit: "example", branch: "feat/example", candidateId: h.params.candidateId,
    candidateSubjectDigest: h.params.candidateSubjectDigest, reservation: h.params.boundary.reservation,
    terminus: h.params.boundary.terminus, readinessBinding: h.params.boundary.readinessBinding, changeRequest: null }, 2);
  h.store.state.unreadable.add("review");
  await expect(h.params.preparePublicationClaim(claim)).rejects.toMatchObject({
    refusal: { code: "record-malformed", class: "recoverable", rule: "review.listing-unreadable" } });
  expect(await h.store.version()).toEqual(before);
  h.store.state.unreadable.clear();
  expect(await h.params.preparePublicationClaim(claim)).toMatchObject({ action: "put", reference: { kind: "review/integration-boundary" } });
  expect(await h.store.version()).toEqual(before);
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
});

it("reports an unreadable readiness listing through publish as the store's refusal, and publishes once readable", async () => {
  const h = await fixture(), before = await h.store.version();
  h.store.state.unreadable.add("review");
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "rejected",
    refusal: { code: "record-malformed", class: "recoverable", rule: "review.listing-unreadable" } });
  expect(await h.store.version()).toEqual(before);
  h.store.state.unreadable.clear();
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
});

it("sends a version-one readiness boundary back to pre-publication review, and publishes from version two", async () => {
  const h = await fixture(), before = await h.store.version();
  const legacy = { ...boundaryV1Fixture("candidate-publish-ready"), candidateId: h.params.candidateId,
    candidateSubjectDigest: h.params.candidateSubjectDigest };
  expect(await runPublish(h.ctx, { ...h.params, boundary: legacy })).toMatchObject({ status: "rejected",
    reason: expect.stringMatching(/version-two readiness boundary/u),
    remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
  expect(await h.store.version()).toEqual(before);
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
});

function claimFor(h: Awaited<ReturnType<typeof fixture>>) {
  return projectPublicationBoundary({ workUnit: "example", branch: "feat/example", candidateId: h.params.candidateId,
    candidateSubjectDigest: h.params.candidateSubjectDigest, reservation: h.params.boundary.reservation,
    terminus: h.params.boundary.terminus, readinessBinding: h.params.boundary.readinessBinding, changeRequest: null }, 2);
}
async function refreshedParameters(h: Awaited<ReturnType<typeof fixture>>, ready: IntegrationBoundaryLocusV2) {
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  return { ...h.params, boundary: ready, preparePublicationClaim: (claim: IntegrationBoundaryLocusV2) => prepareNativePublicationClaim({
    store: h.store, cwd: h.cwd, owner: h.primary.reference.owner, boundary: claim,
    expectedVersion: snapshot.version, readReadinessBinding: h.params.readReadinessBinding }) };
}
it("refuses a moved boundary at claim preparation and publishes against renewed readiness", async () => {
  const h = await fixture();
  let snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  await writeSubmissionBoundary(h.cwd, projectCandidateReviewBoundary({ workUnit: "example", candidateId: h.params.candidateId,
    candidateSubjectDigest: h.params.candidateSubjectDigest }, 2), snapshot.version, { store: h.store, owner: h.primary.reference.owner });
  const before = await h.store.version();
  await expect(h.params.preparePublicationClaim(claimFor(h))).rejects.toThrow(/changed|moved/iu);
  expect(await h.store.version()).toEqual(before);
  snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  await writeSubmissionBoundary(h.cwd, h.params.boundary, snapshot.version, { store: h.store, owner: h.primary.reference.owner });
  expect(await runPublish(h.ctx, await refreshedParameters(h, h.params.boundary))).toMatchObject({ status: "published" });
});
it("refuses new standard outcomes at claim time and publishes after readiness is recorded again", async () => {
  const h = await fixture();
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: await h.projectId(), baseRef: "main", diffBaseSha: "b".repeat(40), diffBaseTree: "c".repeat(40),
    headSha: "a".repeat(40), headTree: "d".repeat(40) });
  await createReviewOutcomePort(h.store, h.primary.reference.owner).create(ReviewOutcomeSchema.parse(localOutcome({ target,
    lineage: { kind: "candidate", candidateId: h.params.candidateId } })));
  const before = await h.store.version();
  await expect(h.params.preparePublicationClaim(claimFor(h))).rejects.toThrow(/review|readiness/iu);
  expect(await h.store.version()).toEqual(before);
  const binding = await h.params.readReadinessBinding();
  if (binding.status !== "complete") throw new Error(binding.condition);
  const ready = IntegrationBoundaryLocusV2Schema.parse({ ...h.params.boundary, readinessBinding: binding.digest });
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  await writeSubmissionBoundary(h.cwd, ready, snapshot.version, { store: h.store, owner: h.primary.reference.owner });
  expect(await runPublish(h.ctx, await refreshedParameters(h, ready))).toMatchObject({ status: "published" });
});

it("refuses a claim-time progress change through publish naming pre-publication review, and publishes once readiness is recorded again", async () => {
  const h = await fixture();
  const recorded = await h.params.readReadinessBinding();
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: await h.projectId(), baseRef: "main", diffBaseSha: "b".repeat(40), diffBaseTree: "c".repeat(40),
    headSha: "a".repeat(40), headTree: "d".repeat(40) });
  await createReviewOutcomePort(h.store, h.primary.reference.owner).create(ReviewOutcomeSchema.parse(localOutcome({ target,
    lineage: { kind: "candidate", candidateId: h.params.candidateId } })));
  const before = await h.store.version();
  expect(await runPublish(h.ctx, { ...h.params, readReadinessBinding: () => Promise.resolve(recorded) })).toMatchObject({
    status: "rejected", reason: "Standard review progress changed after publication readiness.",
    remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
  expect(await h.store.version()).toEqual(before);
  const binding = await h.params.readReadinessBinding();
  if (binding.status !== "complete") throw new Error(binding.condition);
  const ready = IntegrationBoundaryLocusV2Schema.parse({ ...h.params.boundary, readinessBinding: binding.digest });
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  await writeSubmissionBoundary(h.cwd, ready, snapshot.version, { store: h.store, owner: h.primary.reference.owner });
  expect(await runPublish(h.ctx, await refreshedParameters(h, ready))).toMatchObject({ status: "published" });
});
it("reports a store refusal from claim preparation with its own remedy, and publishes once the claim prepares", async () => {
  const h = await fixture();
  const refusal = { code: "lock-held" as const, class: "recoverable" as const, lock: "review",
    condition: "The review lock is held.", remedy: { text: "Wait for the holder to finish, then retry.", argv: ["arc", "store", "pull"] } };
  expect(await runPublish(h.ctx, { ...h.params, preparePublicationClaim: () => Promise.reject(new StoreRefusalError(refusal, true)) }))
    .toMatchObject({ status: "rejected", reason: refusal.condition, refusal, remedy: { argv: ["arc", "store", "pull"] } });
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
});

it("reports a work-item selection refusal from claim preparation with its own remedy, and publishes once it prepares", async () => {
  const h = await fixture();
  const refusal = storedWorkUnitMismatch(h.store, "submission boundary", "example", "other", "Submission boundary work unit does not match its path");
  if (!(refusal instanceof ReviewOwnerSelectionError)) throw new Error("Expected the native owner refusal");
  expect(await runPublish(h.ctx, { ...h.params, preparePublicationClaim: () => Promise.reject(refusal) })).toMatchObject({
    status: "rejected", reason: "The bound work item's submission boundary belongs to work unit `other`, not `example`.",
    remedy: { text: expect.stringContaining("Name work unit `other`, or run the command from `example`'s checkout."),
      argv: ["arc", "publish", "example"] } });
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
});

async function defaultAccess(h: Awaited<ReturnType<typeof fixture>>) {
  const invocation = { store: h.store, projectId: h.projectId, workItem: h.primary.reference.owner };
  const review = await openPublicationReviewContext({ ...h, exec: h.exec, invocation, candidateId: h.params.candidateId });
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  if (snapshot.boundary === null) throw new Error("Missing publication boundary");
  return { review, access: createPublicationBoundaryAccess({ ...h, exec: h.exec, invocation,
    snapshot: { ...snapshot, boundary: snapshot.boundary }, ...review }) };
}
it("publishes through the lifecycle's default native progress and claim ports", async () => {
  const h = await fixture(), { review, access } = await defaultAccess(h);
  const { preparePublicationClaim: _claim, readReadinessBinding: _binding, ...params } = h.params;
  void _claim; void _binding;
  expect(await runPublish(h.ctx, { ...params, ...review, ...access.ports })).toMatchObject({ status: "published",
    boundary: { schemaVersion: 2, readinessBinding: h.params.boundary.readinessBinding } });
});
it("persists renewed Integrating publication through the native continuation without staging", async () => {
  const h = await fixture(), { access } = await defaultAccess(h), claim = claimFor(h);
  await access.persistUnchanged(claim);
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  expect(snapshot.boundary).toEqual(claim);
  const before = await h.store.version();
  const refreshed = await defaultAccess(h);
  await refreshed.access.persistUnchanged(claim);
  expect(await h.store.version()).toEqual(before);
});

async function recordReady(h: Awaited<ReturnType<typeof fixture>>) {
  const binding = await h.params.readReadinessBinding();
  if (binding.status !== "complete") throw new Error(binding.condition);
  const ready = IntegrationBoundaryLocusV2Schema.parse({ ...h.params.boundary, readinessBinding: binding.digest });
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  await writeSubmissionBoundary(h.cwd, ready, snapshot.version, { store: h.store, owner: h.primary.reference.owner });
  return refreshedParameters(h, ready);
}
it.each(["outcome-add", "evidence-advance", "approved-fix", "withdrawal"] as const)(
  "refuses %s synchronized after claim preparation without partial publication, then accepts renewed readiness", async kind => {
    const h = await fixture(), owner = h.primary.reference.owner;
    const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
      repositoryId: await h.projectId(), baseRef: "main", diffBaseSha: "b".repeat(40), diffBaseTree: "c".repeat(40),
      headSha: "a".repeat(40), headTree: "d".repeat(40) });
    const outcome = ReviewOutcomeSchema.parse(localOutcome({ target, lineage: { kind: "candidate", candidateId: h.params.candidateId },
      outcome: "findings", findings: [{ findingId: "finding-1", severity: "major", locus: "src/main.ts:1",
        evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
    if (kind !== "outcome-add") await createReviewOutcomePort(h.store, owner).create(outcome);
    const performed = performedEvidenceFixture("candidate", outcome).value;
    const { performance: ignored, ...unperformed } = performed;
    void ignored;
    if (kind === "evidence-advance") await createReviewEvidencePort(h.store, owner).create(unperformed);
    const grant = approvedFixDecision(outcome);
    if (kind === "withdrawal") await createReviewDecisionPort(h.store, owner).create(grant);
    const params = await recordReady(h);
    const remote = createMemoryRemote();
    h.store.context.publication.remote = remote;
    lifecycleSuccess(await h.store.push());
    const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
    if (kind === "outcome-add") await createReviewOutcomePort(writer, owner).create(outcome);
    else if (kind === "evidence-advance") {
      const evidence = createReviewEvidencePort(writer, owner), prior = await evidence.read(performed.dispositionSet.dispositionSetId);
      if (prior === null) throw new Error("Expected remote approval");
      await evidence.advance(performed, prior.version);
    } else await createReviewDecisionPort(writer, owner).create(kind === "approved-fix" ? grant
      : { ...grant, choice: { kind: "withdrawal", decisionKey: reviewDecisionKey(grant) } });
    let synchronized: Awaited<ReturnType<typeof h.store.version>> | undefined;
    const raced = { ...params, preparePublicationClaim: async (claim: IntegrationBoundaryLocusV2) => {
      const prepared = await params.preparePublicationClaim(claim);
      lifecycleSuccess(await h.store.pull());
      synchronized = await h.store.version();
      return prepared;
    } };
    expect(await runPublish(h.ctx, raced)).toMatchObject({ status: "rejected",
      remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
    expect(await h.store.version()).toEqual(synchronized);
    expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).fields).toMatchObject({ state: "Active" });
    expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
      .toMatchObject({ locus: "candidate-publish-ready" });
    expect(await runPublish(h.ctx, await recordReady(h))).toMatchObject({ status: "published" });
  },
);
it("refuses a Candidate replacement after final inspection without partial publication and accepts renewed authorization", async () => {
  const h = await fixture(), owner = h.primary.reference.owner;
  let afterReplacement: Awaited<ReturnType<typeof h.store.version>> | undefined;
  const params = { ...h.params, preparePublicationClaim: async (claim: IntegrationBoundaryLocusV2) => {
    const prepared = await h.params.preparePublicationClaim(claim);
    const current = await readCandidateRecordVersioned(h.cwd, "example", { store: h.store, owner });
    if (current.record === null) throw new Error("Expected current Candidate");
    const selection = { ...candidateRecordFixture().reviewSelection, candidateId: h.params.candidateId };
    const changed = CandidateManagedRecordV1Schema.parse({ ...current.record, transitions: [...current.record.transitions, selection] });
    await writeCandidateRecord(h.cwd, "example", changed, current.version, { store: h.store, owner });
    afterReplacement = await h.store.version();
    return prepared;
  } };
  expect(await runPublish(h.ctx, params)).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(await h.store.version()).toEqual(afterReplacement);
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).fields).toMatchObject({ state: "Active" });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
    .toMatchObject({ locus: "candidate-publish-ready" });
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
});
it.each(["evidence-advance", "approved-fix", "withdrawal", "in-flight"])("refuses publication after %s changes and admits renewed readiness", async kind => {
  const h = await fixture(), owner = h.primary.reference.owner;
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: await h.projectId(), baseRef: "main", diffBaseSha: "b".repeat(40), diffBaseTree: "c".repeat(40),
    headSha: "a".repeat(40), headTree: "d".repeat(40) });
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target, lineage: { kind: "candidate", candidateId: h.params.candidateId },
    outcome: "findings", findings: [{ findingId: "finding-1", severity: "major", locus: "src/main.ts:1",
      evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
  await createReviewOutcomePort(h.store, owner).create(outcome);
  const evidence = createReviewEvidencePort(h.store, owner), decisions = createReviewDecisionPort(h.store, owner);
  const performed = performedEvidenceFixture("candidate", outcome).value;
  const { performance, ...unperformed } = performed;
  void performance;
  const approved = kind === "evidence-advance" ? await evidence.create(unperformed) : null;
  const grant = approvedFixDecision(outcome);
  if (kind === "withdrawal") await decisions.create(grant);
  const params = await recordReady(h);
  const pending = ReviewOutcomeSchema.parse(localOutcome({ target, lineage: outcome.lineage, logicalPass: 2, outcome: "terminal-failure" }));
  if (approved !== null) await evidence.advance(performed, approved.version);
  else if (kind === "approved-fix") await decisions.create(grant);
  else if (kind === "withdrawal") await decisions.create({ ...grant, choice: { kind: "withdrawal", decisionKey: reviewDecisionKey(grant) } });
  else {
    const { family } = createReviewCompositionContext({ ...h, workItem: owner });
    if (pending.local === undefined) throw new Error("Expected local admission");
    const { operationId, requestId, vehicle, target: reviewTarget, requestedCoverage, effectiveCoverage, scopeMode } = pending.local;
    await recordLaneAttempt(family.ports.inFlight, { lane: "standard", repositoryId: target.repositoryId,
      headSha: target.headSha, changeRequestId: null, lineage: outcome.lineage, attemptId: pending.attemptId,
      sourceId: outcome.source.sourceId, outcome: "pending", consumedPass: false, logicalPass: 2,
      local: { operationId, requestId, vehicle, target: reviewTarget, requestedCoverage, effectiveCoverage, scopeMode },
      now: "2026-10-20T13:00:00Z" });
  }
  const before = await h.store.version();
  expect(await runPublish(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringMatching(/review progress changed/iu),
    remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
  expect(await h.store.version()).toEqual(before);
  if (kind === "in-flight") await createReviewOutcomePort(h.store, owner).create(pending);
  expect(await runPublish(h.ctx, await recordReady(h))).toMatchObject({ status: "published" });
});
it("resumes the Integrating publication left by an interruption after the atomic batch", async () => {
  const h = await fixture();
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
  const stored = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  if (stored.boundary?.schemaVersion !== 2) throw new Error("Expected the durable publication claim");
  const before = await h.store.version();
  const params = await refreshedParameters(h, stored.boundary);
  expect(await runPublish(h.ctx, params)).toEqual({ status: "unchanged", boundary: stored.boundary });
  expect(await h.store.version()).toEqual(before);
});

async function interruptedPublication() {
  const h = await fixture();
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
  const stored = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner: h.primary.reference.owner });
  if (stored.boundary?.schemaVersion !== 2) throw new Error("Expected the durable publication claim");
  return { h, boundary: stored.boundary, params: await refreshedParameters(h, stored.boundary) };
}
it("reports an unreadable readiness listing resuming an Integrating publication as the store's refusal, and resumes once readable",
  async () => {
    const { h, boundary, params } = await interruptedPublication(), before = await h.store.version();
    h.store.state.unreadable.add("review");
    expect(await runPublish(h.ctx, params)).toMatchObject({ status: "rejected",
      refusal: { code: "record-malformed", class: "recoverable", rule: "review.listing-unreadable" },
      remedy: { argv: ["arc", "publish", "example"] } });
    expect(await h.store.version()).toEqual(before);
    h.store.state.unreadable.clear();
    expect(await runPublish(h.ctx, params)).toEqual({ status: "unchanged", boundary });
  });
it("sends a version-one boundary resuming an Integrating publication back to pre-publication review, and resumes from version two",
  async () => {
    const { h, boundary, params } = await interruptedPublication();
    const legacy = { ...boundaryV1Fixture("publication-pending"), candidateId: h.params.candidateId,
      candidateSubjectDigest: h.params.candidateSubjectDigest };
    expect(await runPublish(h.ctx, { ...params, boundary: legacy })).toMatchObject({ status: "rejected",
      reason: expect.stringMatching(/version-two readiness boundary/u),
      remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
    expect(await runPublish(h.ctx, params)).toEqual({ status: "unchanged", boundary });
  });

it.each(["terminus", "selection", "lane-skip"] as const)("publishes after a %s is recorded outside standard progress", async kind => {
  const h = await fixture(), owner = h.primary.reference.owner;
  if (kind === "selection") {
    const current = await readCandidateRecordVersioned(h.cwd, "example", { store: h.store, owner });
    if (current.record === null) throw new Error("Expected the selected Candidate");
    const selection = { ...candidateRecordFixture().reviewSelection, candidateId: h.params.candidateId };
    const record = CandidateManagedRecordV1Schema.parse({ ...current.record, transitions: [...current.record.transitions, selection] });
    await writeCandidateRecord(h.cwd, "example", record, current.version, { store: h.store, owner });
  } else {
    const decision = { ...terminusDecision(), subject: { lineage: { kind: "candidate" as const, candidateId: h.params.candidateId },
      headSha: null, subjectDigest: h.params.candidateSubjectDigest } };
    await createReviewDecisionPort(h.store, owner).create(kind === "terminus" ? decision
      : { ...decision, lane: "frontline", basis: null, choice: { kind: "lane-skip" } });
  }
  expect(await runPublish(h.ctx, h.params)).toMatchObject({ status: "published" });
});
