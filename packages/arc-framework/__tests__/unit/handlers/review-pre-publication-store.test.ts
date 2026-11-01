/** Native pre-publication defaults retain the named primary before accessing review facts. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { handleReviewPrePublication } from "../../../src/handlers/review.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, createCandidateSubjectSnapshot, createCandidateReviewResponseEvidence } from "../../../src/lib/work-unit/candidate-attestation.js";
import { PrePublicationReplayInputSchema, replayTokenFromAction, decodePrePublicationReplayV2, encodePrePublicationReplayV2 } from "../../../src/scripts/review-gate/policy/pre-publication-replay.js";
import { canonicalDigest, SlugSchema, type CanonicalDigest } from "../../../src/lib/kernel/index.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { StoreRefusalSchema } from "../../../src/lib/store/refusal.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewTarget } from "../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { PreBindingDeliveryReviewTarget } from "../../../src/scripts/review-gate/policy/pre-publication-delivery-targets.js";
import { deliveryMember, nativeDeliveryCompositionDependencies } from "../../helpers/store/native-delivery-composition.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { projectPublicationBoundary, projectCandidateReviewResumeBoundary, recoverAttestedOwnerTerminusBoundary } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeSubmissionBoundary, readSubmissionBoundaryVersioned } from "../../../src/lib/store/kinds/review/integration-boundary/access.js";

import { createReviewCompositionContext } from "../../../src/scripts/review-gate/runtime/composition-context.js";
import { readReviewReadinessBinding } from "../../../src/scripts/review-gate/runtime/readiness-binding.js";
import { readCandidateRecord, readCandidateRecordVersioned, writeCandidateRecord } from "../../../src/lib/store/kinds/review/candidate/access.js";
import { recordNativeFrontlineSkip } from "../../../src/scripts/review-gate/runtime/native-frontline-window.js";
import { composePrePublicationReviewRequest } from "../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { createPrePublicationCompositionDependencies } from "../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { resolveReviewPolicy } from "../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { readAdvancedPrePublicationReentry, readPrePublicationProgress } from "../../../src/handlers/review-pre-publication-progress.js";

import { createReviewDecisionPort } from "../../../src/lib/store/kinds/review/decision/access.js";
import { createReviewOutcomePort } from "../../../src/lib/store/kinds/review/outcome/access.js";
import { ReviewOutcomeSchema } from "../../../src/lib/store/kinds/review/outcome/schema.js";
import { localOutcome } from "../../fixtures/review-outcome.js";
import { createHostedHandleFixture } from "../../fixtures/hosted-review.js";
import { reviewDecisionKey } from "../../../src/lib/store/kinds/review/decision/key.js";
import { mapReviewReplayDecisions } from "../../../src/lib/store/kinds/review/mapping-replay-decisions.js";
import { prepareNativeReviewTerminus } from "../../../src/scripts/review-gate/runtime/native-terminus-write.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";

it("reports damaged publication listings as durable corruption and continues after repair", async () => {
  const h = await fixture();
  await h.seedCandidate();
  const condition = "The review/decision listing is incomplete.";
  const incomplete = { status: "incomplete" as const, condition };
  const read = () => Promise.resolve(incomplete);
  await expect(readPrePublicationProgress({ readStandardLaneOwnerVersion: async () => 0,
    readReadinessBinding: read }, h.cwd, canonicalDigest({ candidate: true }), "a".repeat(40), 2))
    .rejects.toMatchObject({ code: "corrupt-state", message: expect.stringContaining(condition) });
  expect(await h.run(false, {}, undefined, { readReadinessBinding: read })).toMatchObject({
    error: { code: "corrupt-state", message: expect.stringContaining(condition) } });
  expect(await h.run()).toMatchObject({ nextAction: { kind: "run-self-review" } });
});

it("requires owner selection before reading readiness and continues after the boundary selects it", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const current = await createPrePublicationCompositionDependencies({ ...h, workItem: owner }).readCandidate("example");
  const version = await h.store.version();
  expect(await h.run(false, {}, undefined, { readBoundary: async () => snapshot, readCandidate: async () => current }))
    .toMatchObject({ error: { code: "invalid-input", message: expect.stringContaining("exact work item") } });
  expect(await h.store.version()).toEqual(version);
  expect(await h.run()).toMatchObject({ nextAction: { kind: "run-self-review" } });
});
async function fixture(project = true) {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
  const head = "a".repeat(40), base = "b".repeat(40), branch = "topic/opaque";
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: head }] },
    { match: ["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", head, base], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", "refs/heads/main", head], responses: [{ stdout: base }] },
    { match: ["diff", "--cached", "--name-only", "-z", base, "--"], responses: [{ stdout: "" }] },
    { match: ["diff", "--name-only", "-z", base, head, "--"], responses: [{ stdout: "" }] },
    { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "https://github.com/owner/repository.git" }] },
    { match: ["config", "--get-all", "arc.frontlineSources"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["rev-parse", "--show-object-format"], responses: [{ stdout: "sha1" }] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["check-ref-format", "--branch", branch], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], responses: [{ stdout: head }] },
    { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], responses: [{ stdout: "" }] },
    { command: "gh", match: { prefix: ["pr", "list", "--repo", "owner/repository", "--state", "all"] }, responses: [{ stdout: "[]" }] },
    ...[head, base].flatMap(revision => [
      { match: ["rev-parse", "--verify", revision], responses: [{ stdout: revision }] },
      { match: ["cat-file", "-t", revision], responses: [{ stdout: "commit" }] },
      { match: ["rev-parse", `${revision}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    ]),
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy(branch, { kind: "work-unit", name: "example" });
  const seedCandidate = async (convergence = false, existingPrimary?: Awaited<ReturnType<typeof h.seedMeta>>) => {
    const primary = existingPrimary ?? await h.seedMeta("example", { branch: null }, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
    const subject = createCandidateSubjectSnapshot([]);
    let candidate = CandidateManagedRecordV1Schema.parse({ schemaVersion: 1, semanticsVersion: "candidate-attestation/v1", subject,
      attestation: createCandidateAttestation({ workUnit: "example", subject, baseRevision: head, attestedBy: "test-user",
        attestedAt: "2026-10-19T12:00:00Z", verificationEvidenceRef: "verified" }), transitions: [], lineageAttestations: [] });
    if (convergence) {
      const oldSubject = createCandidateSubjectSnapshot([{ path: "src/example.ts", mode: "100644",
        digest: canonicalDigest({ source: "reviewed" }), treatment: "reviewable" }]);
      const attestation = createCandidateAttestation({ workUnit: "example", subject: oldSubject, baseRevision: base,
        attestedBy: "test-user", attestedAt: "2026-10-19T11:00:00Z", verificationEvidenceRef: "verified" });
      const response = createCandidateReviewResponseEvidence({ candidateId: attestation.candidateId,
        oldTarget: { revision: base, subject: oldSubject }, newTarget: { revision: head, subject },
        dispositionId: canonicalDigest({ response: 1 }), approvedBy: "test-user", appliedBy: "test-user",
        applicability: "full", approvedVerification: "full", verificationEvidenceRefs: ["verified-response"], implementationChanged: true });
      candidate = CandidateManagedRecordV1Schema.parse({ ...candidate, attestation, subject: oldSubject, transitions: [response] });
    }
    await h.seedCandidate(primary.reference.owner, candidate);
    await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "pre-publication-review", workUnit: "example", candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
      nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
    return primary.reference.owner;
  };
  const invoke = async (options: Parameters<typeof handleReviewPrePublication>[1], lanes: unknown,
    overrides: Parameters<typeof handleReviewPrePublication>[2] = {}) => {
    let output = "";
    await handleReviewPrePublication("example", options, { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify(lanes), write: text => { output += text; }, setExitCode: () => {}, ...overrides }, undefined,
    { ...checkout, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  };
  return { ...checkout, seedCandidate, seedMeta: h.seedMeta,
    run: (settled = false, lanes: unknown = { frontline: { invocation: { mode: "skip" } } }, resume?: string,
      overrides?: Parameters<typeof handleReviewPrePublication>[2]) => invoke(
      resume === undefined ? settled ? { selfReview: "settled", lanes: "lanes.json" } : {} : { resume }, lanes, overrides),
    runPendingJudgment: (lanes: unknown) => invoke({ lanes: "lanes.json" }, lanes),
  };
}

it("reaches self-review through the native default without an injected owner or metadata file", async () => {
  const h = await fixture();
  await h.seedCandidate();
  const version = lifecycleSuccess(await h.store.version());
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "run-self-review" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it("persists native full convergence and emits merge verification through the default command", async () => {
  const h = await fixture();
  const owner = await h.seedCandidate(true);
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [codex-pr]\n");
  const result = await h.run(true);
  expect(result, JSON.stringify(result)).toMatchObject({ schemaVersion: 2, locus: "candidate-convergence-verification-pending",
    nextAction: { kind: "run-convergence-verification", verificationKind: "merge" } });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
    .toMatchObject({ schemaVersion: 2, locus: "candidate-convergence-verification-pending",
      nextAction: { verificationKind: "merge" } });
});

it("retains the project-identity remedy and reaches self-review after repair", async () => {
  const h = await fixture(false);
  await h.seedCandidate();
  expect(await h.run()).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
  await h.seedProject(projectId);
  expect(await h.run()).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "run-self-review" } });
});

it("reports an unreadable native review listing as the store's refusal and reaches self-review after repair", async () => {
  const h = await fixture();
  await h.seedCandidate();
  h.store.state.unreadable.add("review");
  expect(await h.run()).toMatchObject({ error: { code: "store-refused" } });
  h.store.state.unreadable.clear();
  expect(await h.run()).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "run-self-review" } });
});

it("reports a refused Candidate history read as the store's refusal rather than a Candidate delta", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const currentRecord = await readCandidateRecordVersioned(h.cwd, "example", { store: h.store, owner });
  const current = currentRecord.record;
  if (current === null) throw new Error("Expected the attested Candidate");
  const next = { ...current, attestation: createCandidateAttestation({ ...current.attestation, subject: current.subject,
    attestedAt: "2026-10-20T12:00:00Z", supersedes: current.attestation.candidateId }) };
  await writeCandidateRecord(h.cwd, "example", next, currentRecord.version, { store: h.store, owner });
  const history = h.store.history.bind(h.store);
  let refused = true;
  h.store.history = async input => refused && input.reference.kind === "review/candidate" ? { status: "refused",
    refusal: StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "Candidate history is unavailable.", remedy: { text: "Restore the Candidate history, then retry." } }) }
    : history(input);
  expect(await h.run()).toMatchObject({ error: { code: "store-refused",
    message: expect.stringContaining("Candidate history is unavailable.") } });
  refused = false;
  const repaired = await h.run();
  expect(repaired).not.toHaveProperty("error");
  expect(repaired).toMatchObject({ candidateId: next.attestation.candidateId });
});

it("keeps the missing-Candidate response and reaches self-review after the records are created", async () => {
  const h = await fixture();
  const primary = await h.seedMeta("example");
  expect(await h.run()).toMatchObject({ error: { message: "No managed Candidate record exists for `example`." } });
  await h.seedCandidate(false, primary);
  expect(await h.run()).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "run-self-review" } });
});

it.each(["same", "scope", "invocation"] as const)("compares native post-attest call inputs with a %s judgment", async changed => {
  const h = await fixture(), owner = await h.seedCandidate();
  const lanes = { frontline: { scopeMode: "whole-target" as const, invocation: { mode: "skip" as const } },
    standard: { terminus: { mode: "owner-accepted" as const }, ceilingOverride: { exhaustedPassCount: 0, nextPass: 1 } } };
  expect(await h.run(true, lanes)).toMatchObject({ locus: "candidate-publish-ready" });
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const ready = snapshot.boundary;
  if (ready?.schemaVersion !== 2 || ready.candidateSubjectDigest === null) throw new Error("Expected native readiness");
  const token = encodePrePublicationReplayV2({ candidateId: ready.candidateId, candidateSubjectDigest: ready.candidateSubjectDigest,
    selfReview: "settled", lanes: { frontline: lanes.frontline } });
  await writeSubmissionBoundary(h.cwd, projectCandidateReviewResumeBoundary({ workUnit: "example", candidateId: ready.candidateId,
    candidateSubjectDigest: ready.candidateSubjectDigest, reservation: null, terminus: ready.terminus, postAttestContinuation: {
      reviewedHead: "a".repeat(40), nextAction: { kind: "continue-pre-publication-review",
        command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume review." } } }, 2), snapshot.version,
  { store: h.store, owner });
  const supplied = changed === "scope" ? { ...lanes, frontline: { ...lanes.frontline, scopeMode: "chunked" } }
    : changed === "invocation" ? { ...lanes, frontline: { scopeMode: lanes.frontline.scopeMode } } : lanes;
  const result = await h.run(true, supplied);
  expect(result, JSON.stringify(result)).toMatchObject(changed === "same" ? { locus: "candidate-publish-ready" }
    : { error: { code: "post-attest-judgment-mismatch" } });
});

it("projects a native skipped window as proven closure through default pre-publication composition", async () => {
  const h = await fixture();
  const owner = await h.seedCandidate();
  await mkdir(join(h.cwd, ".arc/system/methods"), { recursive: true });
  await writeFile(join(h.cwd, ".arc/system/methods/code-review-frontline.md"), "---\nname: code-review-frontline\ndescription: Review the target\nactive: true\noverride-active: false\n---\nReview the target.\n");
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.frontline_sources: [coderabbit-cli]\nreview.standard_sources: [delegated-agent]\n");
  const invocation = { ...h, workItem: owner };
  const { family } = createReviewCompositionContext(invocation);
  if (family.mode !== "stored" || family.ports.inFlight.nativeFacts === undefined) throw new Error("Expected native facts");
  const candidate = await readCandidateRecord(h.cwd, "example", { store: h.store, owner });
  if (candidate === null) throw new Error("Expected the selected Candidate");
  await recordNativeFrontlineSkip({ invocation, facts: family.ports.inFlight.nativeFacts, repositoryId: projectId,
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId }, headSha: "a".repeat(40),
    now: "2026-10-20T12:00:00Z" });
  const composition = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    changeSet: { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } },
  createPrePublicationCompositionDependencies(invocation));
  expect(composition, JSON.stringify(composition)).toMatchObject({ status: "composed" });
  if (composition.status !== "composed") throw new Error(composition.reason);
  expect(resolveReviewPolicy(composition.request.frontline)).toMatchObject({ state: "skipped",
    payload: { reason: "phase-closed" }, diagnostics: [{ code: "frontline-window-closed" }] });
});

it("records native readiness with the selected Candidate's complete review binding", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const result = await h.run(true, { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } });
  const decisions = createReviewDecisionPort(h.store, owner);
  const listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  const termini = listing.records.filter(({ value }) => value.choice.kind === "terminus");
  expect(termini).toHaveLength(1);
  const decision = termini[0];
  if (decision === undefined) throw new Error("expected accepted terminus decision");
  const decisionKey = reviewDecisionKey(decision.value);
  expect(decision.value).toMatchObject({ lane: "standard", decidedBy: "test-user", basis: { passCount: 0 },
    subject: { headSha: null } });
  expect(result).toMatchObject({ terminus: decisionKey });
  const stored = (await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary;
  const candidate = await readCandidateRecord(h.cwd, "example", { store: h.store, owner });
  if (candidate === null) throw new Error("expected the current Candidate");
  const { family } = createReviewCompositionContext({ ...h, workItem: owner });
  const binding = await readReviewReadinessBinding({ store: h.store, workItem: owner, inFlight: family.ports.inFlight,
    repositoryId: projectId, candidateId: candidate.attestation.candidateId, headSha: "a".repeat(40) });
  if (binding.status !== "complete") throw new Error(binding.condition);
  expect(result, JSON.stringify(result)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: binding.digest });
  expect(stored).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: binding.digest });
  expect(stored).toHaveProperty("terminus", decisionKey);
  expect(stored).not.toHaveProperty("standardLaneOwnerVersion");
});

it("retains a hosted reservation on readiness refresh and replaces it after a Candidate re-root", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const lanes = { frontline: { invocation: { mode: "skip" } } };
  const changeSet = { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
    changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" };
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [codex-pr]\n");
  const run = async () => {
    let output = "";
    await handleReviewPrePublication("example", { selfReview: "settled", lanes: "lanes.json", changeSet: "change.json" }, {
      resolveRoot: () => h.cwd, readText: async source => JSON.stringify(source === "lanes.json" ? lanes : changeSet),
      write: text => { output += text; }, setExitCode: () => {} }, undefined, { ...h, projectId: createProjectIdentityReader(h.store) });
    return JSON.parse(output) as unknown;
  };
  expect(await run()).toMatchObject({ locus: "candidate-publish-ready" });
  const first = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (first.boundary?.reservation === null || first.boundary?.reservation === undefined) throw new Error("Expected the hosted reservation");
  const token = encodePrePublicationReplayV2({ candidateId: first.boundary.candidateId,
    candidateSubjectDigest: first.boundary.candidateSubjectDigest, selfReview: "settled", changeSet, lanes });
  const resume = projectCandidateReviewResumeBoundary({ workUnit: "example", candidateId: first.boundary.candidateId,
    candidateSubjectDigest: first.boundary.candidateSubjectDigest!, reservation: first.boundary.reservation,
    postAttestContinuation: { reviewedHead: "a".repeat(40), nextAction: { kind: "continue-pre-publication-review",
      command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume readiness." } } }, 2);
  await writeSubmissionBoundary(h.cwd, resume, first.version, { store: h.store, owner });
  expect(await h.run(false, {}, token)).toHaveProperty("reservation", first.boundary.reservation);
  const currentRecord = await readCandidateRecordVersioned(h.cwd, "example", { store: h.store, owner });
  const current = currentRecord.record;
  if (current === null) throw new Error("Expected the attested Candidate");
  const next = { ...current, attestation: createCandidateAttestation({ ...current.attestation, subject: current.subject,
    attestedAt: "2026-10-20T12:00:00Z", supersedes: current.attestation.candidateId }) };
  await writeCandidateRecord(h.cwd, "example", next, currentRecord.version, { store: h.store, owner });
  const refreshed = await run();
  expect(refreshed).toMatchObject({ locus: "candidate-publish-ready", candidateId: next.attestation.candidateId });
  const last = (await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary;
  expect(last?.reservation).toMatchObject({ sources: first.boundary.reservation.sources, target: first.boundary.reservation.target });
  expect(last?.reservation?.reservationId).not.toBe(first.boundary.reservation.reservationId);
});

it.each(["candidate-publish-ready", "publication-pending"] as const)("re-enters native %s without recomposing saved judgments or changing records", async locus => {
  const h = await fixture(), owner = await h.seedCandidate();
  const first = await h.run(true, { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } });
  expect(first).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready" });
  const ready = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (ready.boundary?.schemaVersion !== 2 || ready.boundary.locus !== "candidate-publish-ready") throw new Error("expected native readiness");
  const expected = locus === "candidate-publish-ready" ? ready.boundary : projectPublicationBoundary({ workUnit: "example", branch: "topic/opaque",
    candidateId: ready.boundary.candidateId, candidateSubjectDigest: ready.boundary.candidateSubjectDigest,
    reservation: ready.boundary.reservation, terminus: ready.boundary.terminus, readinessBinding: ready.boundary.readinessBinding, changeRequest: null }, 2);
  if (locus === "publication-pending") await writeSubmissionBoundary(h.cwd, expected, ready.version, { store: h.store, owner });
  const before = await h.store.version();
  expect(await h.run()).toMatchObject({ ...expected });
  expect(await h.store.version()).toEqual(before);
});

it("refuses native readiness when the Candidate became current during composition, then records it on retry", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const lanes = { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } };
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  expect(await h.run(true, lanes, undefined, { readCandidate: async () => ({ status: "missing" }) })).toMatchObject({
    error: { code: "invalid-input", message: "Standard review progress changed while publication readiness was being composed." } });
  expect(await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).toEqual(before);
  expect(await h.run(true, lanes)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready" });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
    .toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: expect.stringMatching(/^sha256:/u) });
});

const readyLanes = { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } };

/** Store a concluded standard-lane pass over the Candidate, which publication readiness binds, as a concurrent writer would. */
async function recordStandardOutcome(owner: OwnerIdentity, h: Awaited<ReturnType<typeof fixture>>, candidateId: CanonicalDigest) {
  const target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  await createReviewOutcomePort(h.store, owner).create(ReviewOutcomeSchema.parse(localOutcome({ target,
    lineage: { kind: "candidate", candidateId } })));
}

async function liveReadinessBinding(h: Awaited<ReturnType<typeof fixture>>, owner: OwnerIdentity, candidateId: CanonicalDigest) {
  const { family } = createReviewCompositionContext({ ...h, workItem: owner });
  const binding = await readReviewReadinessBinding({ store: h.store, workItem: owner, inFlight: family.ports.inFlight,
    repositoryId: projectId, candidateId, headSha: "a".repeat(40) });
  if (binding.status !== "complete") throw new Error(binding.condition);
  return binding.digest;
}

it("refuses native readiness when review progress moves before its locked write, then records the moved binding on retry", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (before.boundary === null) throw new Error("expected the Candidate boundary");
  const candidateId = before.boundary.candidateId, stale = await liveReadinessBinding(h, owner, candidateId);
  let moved = false;
  const refusal = await h.run(true, readyLanes, undefined, { withStandardLaneLock: async (_root, _candidate, _head, action) => {
    // Another pass concludes after composition read the binding and before this write takes the lane lock.
    if (!moved) { moved = true; await recordStandardOutcome(owner, h, candidateId); }
    return action();
  } });
  expect(refusal).toMatchObject({ error: { code: "invalid-input",
    message: "Standard review progress changed while publication readiness was being composed." } });
  expect(await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).toEqual(before);
  const listing = await createReviewDecisionPort(h.store, owner).list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  // Composition's frontline skip stands; the refused write records neither the terminus nor readiness.
  expect(listing.records.map(({ value }) => value.choice.kind)).toEqual(["lane-skip"]);
  const current = await liveReadinessBinding(h, owner, candidateId);
  expect(current).not.toBe(stale);
  expect(await h.run(true, readyLanes)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: current });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
    .toMatchObject({ locus: "candidate-publish-ready", readinessBinding: current });
});

it("recomposes native re-entry over review progress that moved after readiness, writing nothing, then records the moved binding", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  expect(await h.run(true, readyLanes)).toMatchObject({ locus: "candidate-publish-ready" });
  const ready = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (ready.boundary?.schemaVersion !== 2 || ready.boundary.locus !== "candidate-publish-ready") throw new Error("expected native readiness");
  const boundary = ready.boundary;
  await recordStandardOutcome(owner, h, boundary.candidateId);
  const input = { ...h, workItem: owner }, context = createReviewCompositionContext(input);
  const dependencies = createPrePublicationCompositionDependencies(input), before = await h.store.version();
  expect(await readAdvancedPrePublicationReentry({ root: h.cwd, workUnit: "example", currentHead: "a".repeat(40),
    boundary, replay: null, orderingRecoveryPresent: false, plainReentry: true }, {
    readCandidate: (_root, workUnit) => dependencies.readCandidate(workUnit),
    readStandardLaneOwnerVersion: async () => { throw new Error("repository progress read"); },
    readReadinessBinding: (_root, candidateId, headSha) => readReviewReadinessBinding({ store: h.store, workItem: owner,
      inFlight: context.family.ports.inFlight, repositoryId: projectId, candidateId, headSha }),
  })).toEqual({ status: "compose" });
  expect(await h.store.version()).toEqual(before);
  const current = await liveReadinessBinding(h, owner, boundary.candidateId);
  expect(current).not.toBe(boundary.readinessBinding);
  expect(await h.run(true, readyLanes)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: current });
});

it("retains native advanced authority by Candidate and subject without a checkout-head binding", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  await h.run(true, { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } });
  const saved = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (saved.boundary?.schemaVersion !== 2 || saved.boundary.locus !== "candidate-publish-ready") throw new Error("Expected native readiness");
  const input = { ...h, workItem: owner }, context = createReviewCompositionContext(input);
  const dependencies = createPrePublicationCompositionDependencies(input), before = await h.store.version();
  expect(await readAdvancedPrePublicationReentry({ root: h.cwd, workUnit: "example", currentHead: "b".repeat(40),
    boundary: saved.boundary, replay: null, orderingRecoveryPresent: false, plainReentry: true }, {
    readCandidate: (_root, workUnit) => dependencies.readCandidate(workUnit),
    readStandardLaneOwnerVersion: async () => { throw new Error("repository progress read"); },
    readReadinessBinding: (_root, candidateId, headSha) => readReviewReadinessBinding({ store: h.store, workItem: owner,
      inFlight: context.family.ports.inFlight, repositoryId: projectId, candidateId, headSha }),
  })).toMatchObject({ status: "continued", envelope: { locus: "candidate-publish-ready" } });
  expect(await h.store.version()).toEqual(before);
});

it("recovers native attestation ordering against its stored version and records the live readiness binding", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const lanes = { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } };
  expect(await h.run(true, lanes)).toMatchObject({ locus: "candidate-publish-ready" });
  const ready = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (ready.boundary?.schemaVersion !== 2 || ready.boundary.locus !== "candidate-publish-ready"
    || ready.boundary.candidateSubjectDigest === null) throw new Error("Expected native readiness");
  const token = encodePrePublicationReplayV2({ candidateId: ready.boundary.candidateId,
    candidateSubjectDigest: ready.boundary.candidateSubjectDigest, selfReview: "settled", lanes: { frontline: lanes.frontline } });
  const pending = projectCandidateReviewResumeBoundary({ workUnit: "example", candidateId: ready.boundary.candidateId,
    candidateSubjectDigest: ready.boundary.candidateSubjectDigest, reservation: null, postAttestContinuation: {
      reviewedHead: "b".repeat(40), nextAction: { kind: "continue-pre-publication-review",
        command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume review" } } }, 2);
  await writeSubmissionBoundary(h.cwd, pending, ready.version, { store: h.store, owner });
  const stored = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const before = await h.store.version();
  const refusal = await h.run(true, lanes);
  expect(refusal).toMatchObject({ error: { code: "attestation-ordering-conflict" } });
  expect(await h.store.version()).toEqual(before);
  const action = (refusal as { remedy: { argv: string[] } }).remedy.argv;
  const resume = action[5];
  if (resume === undefined) throw new Error("Expected the explicit recovery token");
  expect(decodePrePublicationReplayV2(resume))
    .toMatchObject({ attestationOrderingRecovery: { expectedBoundaryVersion: stored.version } });
  expect(await h.run(false, undefined, resume)).toMatchObject({ locus: "candidate-publish-ready", schemaVersion: 2,
    readinessBinding: ready.boundary.readinessBinding });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
    .toMatchObject({ locus: "candidate-publish-ready", schemaVersion: 2, readinessBinding: ready.boundary.readinessBinding });
});

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("records and relays a native %s judgment by its decision key", async field => {
  const h = await fixture(), owner = await h.seedCandidate();
  const invocation = { ...h, workItem: owner };
  const dependencies = createPrePublicationCompositionDependencies(invocation);
  const value = field === "ceilingOverride" ? { exhaustedPassCount: 0, nextPass: 1 }
    : { headSha: "a".repeat(40), precedingProducerId: "producer-1", completedPasses: 0, nextPass: 1 };
  const first = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    lanes: { standard: { [field]: value } } }, dependencies);
  if (first.status !== "composed") throw new Error(JSON.stringify(first));
  expect(first.request.standard[field]).toMatchObject({ lane: "standard", target: { headSha: "a".repeat(40) } });
  const key = first.request.standard[field]?.decisionKey;
  expect(key).toEqual(expect.stringMatching(/^sha256:/u));
  const { family } = createReviewCompositionContext(invocation);
  if (family.mode !== "stored") throw new Error("Expected stored review facts");
  expect(await family.ports.decisions.list()).toMatchObject({ status: "complete", records: [{ reference: { key }, value: {
    lane: "standard", decidedBy: "test-user", basis: null, choice: { kind: "extra-pass", passCount: 0,
      precondition: { kind: field === "ceilingOverride" ? "ceiling" : "additional" } },
  } }] });
  const before = await h.store.version();
  for (const lanes of [undefined, { standard: { [field]: { ...value, decisionKey: key } } }]) {
    const replay = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled", lanes }, dependencies);
    expect(replay, JSON.stringify(replay)).toMatchObject({ status: "composed", request: { standard: { [field]: {
      decisionKey: key, lane: "standard", target: { headSha: "a".repeat(40) },
    } } } });
    expect(await h.store.version()).toEqual(before);
  }
});


it.each([null, "recorded-owner"])("resolves an imported native terminus with author %s through the default readiness path", async author => {
  const h = await fixture(), owner = await h.seedCandidate();
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (snapshot.boundary?.candidateSubjectDigest === null || snapshot.boundary === null) throw new Error("expected Candidate boundary");
  const { candidateId, candidateSubjectDigest } = snapshot.boundary;
  const token = Buffer.from(JSON.stringify(PrePublicationReplayInputSchema.parse({ candidateId, candidateSubjectDigest,
    lanes: { standard: { terminus: { mode: "owner-accepted" } } } })), "utf8").toString("base64url");
  const original = projectCandidateReviewResumeBoundary({ workUnit: "example", candidateId, candidateSubjectDigest,
    reservation: null, postAttestContinuation: { projectionDisposition: "keep-staged-until-publication", reviewedHead: "a".repeat(40), nextAction: {
      kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume the retained review judgment." } } });
  if (original.schemaVersion !== 1) throw new Error("expected original replay boundary");
  const mapped = mapReviewReplayDecisions(original, () => 2);
  const imported = mapped.find(value => value.choice.kind === "terminus");
  if (imported === undefined) throw new Error("expected imported terminus");
  const decision = author === null ? imported : { ...imported, decidedBy: author };
  const port = createReviewDecisionPort(h.store, owner);
  const recorded = await port.create(decision);
  const key = reviewDecisionKey(recorded.value);
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [delegated-agent]\n");
  const result = await h.run(true);
  expect(result, JSON.stringify(result)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: key });
  const stored = (await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary;
  expect(stored).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: key });
  const listing = await port.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records.filter(({ value }) => value.choice.kind === "terminus"))
    .toMatchObject([{ value: { decidedBy: author, basis: { passCount: 2 } } }]);
  expect((await port.read(key))?.version).toBe(recorded.version);
  const before = await h.store.version();
  expect(await h.run()).toMatchObject({ terminus: key, locus: "candidate-publish-ready" });
  expect(await h.store.version()).toEqual(before);
});

it.each(["live", "missing", "wrong-kind", "withdrawn", "wrong-lineage", "superseded"] as const)(
  "validates a retained native %s terminus before policy and recovers with a live key", async kind => {
    const h = await fixture(), owner = await h.seedCandidate();
    const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
    const boundary = snapshot.boundary;
    if (boundary?.schemaVersion !== 2) throw new Error("expected native boundary");
    const port = createReviewDecisionPort(h.store, owner);
    const decision = { schemaVersion: 1 as const,
      subject: { lineage: { kind: "candidate" as const, candidateId: boundary.candidateId }, headSha: null,
        subjectDigest: boundary.candidateSubjectDigest }, lane: "standard" as const, choice: { kind: "terminus" as const },
      decidedBy: null, decidedAt: null, basis: { passCount: 2 } };
    const recorded = await port.create(decision);
    let liveKey = reviewDecisionKey(recorded.value), retainedKey = liveKey;
    if (kind === "missing") retainedKey = canonicalDigest({ missing: true });
    if (kind === "wrong-kind") retainedKey = reviewDecisionKey((await port.create({ ...decision, basis: null,
      choice: { kind: "extra-pass", passCount: 2, precondition: { kind: "ceiling", targetBinding: { kind: "call-target" } } } })).value);
    if (kind === "wrong-lineage") retainedKey = reviewDecisionKey((await port.create({ ...decision,
      subject: { lineage: { kind: "delivery-member", planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: canonicalDigest({ member: 1 }), workUnitId: SlugSchema.parse("example") }, headSha: "a".repeat(40), subjectDigest: null } })).value);
    if (kind === "withdrawn") await port.create({ ...decision, basis: null, choice: { kind: "withdrawal", decisionKey: liveKey } });
    if (kind === "withdrawn" || kind === "superseded") liveKey = reviewDecisionKey((await port.create({ ...decision,
      decidedBy: "recorded-owner", decidedAt: "2026-10-20T16:00:00Z" })).value);
    await writeSubmissionBoundary(h.cwd, { ...boundary, terminus: retainedKey }, snapshot.version, { store: h.store, owner });
    const retained = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
    await writeFile(join(h.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [delegated-agent]\n");
    if (kind !== "live") {
      const version = await h.store.version();
      expect(await h.run(true)).toMatchObject({ error: { message: expect.stringMatching(/terminus/i) } });
      expect(await h.store.version()).toEqual(version);
      await writeSubmissionBoundary(h.cwd, { ...boundary, terminus: liveKey }, retained.version, { store: h.store, owner });
    }
    expect(await h.run(true)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: liveKey });
  });


it("records a native singleton terminus before self-review and reuses it when the saved command reaches readiness", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const result = await h.runPendingJudgment({ frontline: { invocation: { mode: "skip" } },
    standard: { terminus: { mode: "owner-accepted" } } });
  expect(result).toMatchObject({ schemaVersion: 2, nextAction: { kind: "run-self-review" } });
  const decisions = createReviewDecisionPort(h.store, owner), listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  const termini = listing.records.filter(({ value }) => value.choice.kind === "terminus");
  expect(termini).toHaveLength(1);
  const decision = termini[0];
  if (decision === undefined) throw new Error("expected accepted terminus");
  const key = reviewDecisionKey(decision.value);
  expect(result).toHaveProperty("terminus", key);
  expect(await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).toEqual(before);
  const token = replayTokenFromAction((result as { nextAction: { command: string } }).nextAction.command, "example");
  const replay = decodePrePublicationReplayV2(token);
  expect(replay).toMatchObject({ selfReview: "settled", lanes: { frontline: { invocation: { mode: "skip" } } } });
  expect(replay).not.toHaveProperty("lanes.standard.terminus");
  expect(replay).not.toHaveProperty("frontlineCeilingHeadSha");
  expect(await h.run(false, {}, token)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: key });
  expect(await decisions.read(key)).toEqual(decision);
  const after = await decisions.list();
  if (after.status !== "complete") throw new Error(after.reason);
  expect(after.records.filter(({ value }) => value.choice.kind === "terminus")).toEqual(termini);
});

it("records a native scope refusal's carried terminus before its call-input continuation reaches readiness", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const probe = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    lanes: { frontline: { invocation: { mode: "skip" } } } }, createPrePublicationCompositionDependencies({ ...h, workItem: owner }));
  if (probe.status !== "composed" || probe.request.target === null) throw new Error(JSON.stringify(probe));
  const decisions = createReviewDecisionPort(h.store, owner);
  const terminusDecision = await prepareNativeReviewTerminus({ facts: { decisions }, subject: { lineage: { kind: "candidate",
    candidateId: probe.request.candidateId }, headSha: null, subjectDigest: probe.request.candidate.subjectDigest },
  acceptedBy: "test-user", completedPasses: 0, now: "2026-10-31T12:00:00Z" });
  const scopeMismatch = { lane: "frontline" as const, observedScope: "whole-target" as const,
    selectedScope: "chunked" as const, target: probe.request.target };
  const refused = await h.run(true, { frontline: { scopeMode: "chunked", invocation: { mode: "skip" } },
    standard: { terminus: { mode: "owner-accepted" } } }, undefined, { compose: async () => ({ status: "refused",
    code: "scope-judgment-required", reason: "review producer scope does not match the selected scope", scopeMismatch,
    terminusDecision }) });
  expect(refused).toMatchObject({ error: { code: "scope-judgment-required" },
    remedy: { argv: ["arc", "review", "pre-publication", "example", "--resume", expect.any(String)] } });
  expect(await decisions.read(terminusDecision.key)).toMatchObject({ value: { choice: { kind: "terminus" } } });
  const token = (refused as { remedy: { argv: string[] } }).remedy.argv[5] ?? "";
  const replay = decodePrePublicationReplayV2(token);
  expect(replay).toMatchObject({ lanes: { frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } } } });
  expect(replay).not.toHaveProperty("lanes.standard.terminus");
  expect(await h.run(false, {}, token)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready",
    terminus: terminusDecision.key });
});

it.each([false, true])("keeps a native scope refusal's grants in its remedy only when it retains them (%s)", async retains => {
  const h = await fixture();
  await h.seedCandidate();
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: projectId, baseRef: "main", diffBaseSha: "b".repeat(40), diffBaseTree: "c".repeat(40),
    headSha: "d".repeat(40), headTree: "e".repeat(40) });
  const grants = { frontline: { ceilingOverride: { exhaustedPassCount: 1, nextPass: 2 } },
    standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } };
  const refused = await h.run(true, { frontline: { ...grants.frontline, scopeMode: "chunked" }, standard: grants.standard },
    undefined, { compose: async () => ({ status: "refused", code: "scope-judgment-required",
      reason: "review producer scope does not match the selected scope", scopeMismatch: { lane: "frontline",
        observedScope: "whole-target", selectedScope: "chunked", target }, ...(retains ? { retainsGrants: true } : {}) }) });
  const token = (refused as { remedy: { argv: string[] } }).remedy.argv[5] ?? "";
  expect(decodePrePublicationReplayV2(token).lanes).toEqual(retains
    ? { frontline: { ...grants.frontline, scopeMode: "whole-target" }, standard: grants.standard }
    : { frontline: { scopeMode: "whole-target" } });
});

const DELIVERY_REPOSITORY = "arc-framework/example";
// The first member's frontline pass is complete, so a plan selects the second; the first is where a scope refuses.
const first = deliveryMember(DELIVERY_REPOSITORY, "1", "2", "3"), second = deliveryMember(DELIVERY_REPOSITORY, "4", "3", "5");

/** Wire a real native delivery composition over the fixture's store as the command's composition. */
async function deliveryCommand(h: Awaited<ReturnType<typeof fixture>>, owner: OwnerIdentity,
  members: () => readonly PreBindingDeliveryReviewTarget[]) {
  const current = await createPrePublicationCompositionDependencies({ ...h, workItem: owner }).readCandidate("example");
  if (current.status !== "current") throw new Error(JSON.stringify(current));
  const dependencies = nativeDeliveryCompositionDependencies({ store: h.store, owner, repository: DELIVERY_REPOSITORY,
    actor: h.identity, now: "2026-11-01T12:00:00Z", members, candidate: { candidateId: current.candidateId,
      subjectDigest: current.subjectDigest, headSha: current.headSha } });
  const compose = async (_root: string, input: { name: string }, judgment: { selfReview?: "settled"; lanes?: unknown }) =>
    composePrePublicationReviewRequest({ workUnit: input.name,
      ...(judgment.selfReview === undefined ? {} : { selfReview: judgment.selfReview }),
      ...(judgment.lanes === undefined ? {} : { lanes: judgment.lanes }) }, dependencies);
  const decisions = createReviewDecisionPort(h.store, owner);
  const listDecisions = async () => {
    const listing = await decisions.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    return listing.records.map(({ value }) => value);
  };
  return { compose, listDecisions };
}

const remedyToken = (output: unknown) => (output as { remedy: { argv: string[] } }).remedy.argv[5] ?? "";

it("follows a delivery plan's scope remedy to readiness when its re-entry selects another member", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const { compose, listDecisions } = await deliveryCommand(h, owner, () => [first, second]);
  const refused = await h.run(true, { frontline: { scopeMode: "chunked" },
    standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 }, terminus: { mode: "owner-accepted" } } },
  undefined, { compose });
  expect(refused, JSON.stringify(refused)).toMatchObject({ error: { code: "scope-judgment-required" },
    remedy: { argv: ["arc", "review", "pre-publication", "example", "--resume", expect.any(String)] } });

  const ready = await h.run(false, {}, remedyToken(refused), { compose });
  const decisions = await listDecisions();
  const terminus = decisions.find(value => value.choice.kind === "terminus");
  expect(ready, JSON.stringify(ready)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready",
    terminus: terminus === undefined ? "missing" : reviewDecisionKey(terminus) });
  expect(decisions.map(value => ({ lane: value.lane, kind: value.choice.kind, headSha: value.subject.headSha })))
    .toEqual(expect.arrayContaining([{ lane: "standard", kind: "terminus", headSha: null },
      { lane: "standard", kind: "extra-pass", headSha: second.target.headSha }]));
  expect(decisions).toHaveLength(2);
});

it("refuses a delivery scope judgment whose member target moved before its remedy re-entered", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  let members = [first, second];
  const { compose } = await deliveryCommand(h, owner, () => members);
  const refused = await h.run(true, { frontline: { scopeMode: "chunked" } }, undefined, { compose });
  expect(refused, JSON.stringify(refused)).toMatchObject({ error: { code: "scope-judgment-required" } });
  members = [deliveryMember(DELIVERY_REPOSITORY, "1", "2", "6"), second];
  expect(await h.run(false, {}, remedyToken(refused), { compose })).toMatchObject({ error: { code: "invalid-input",
    message: "The saved scope judgment no longer matches the current exact review target." } });
});

it("asks a fresh scope judgment for a later member's mismatch after an earlier member's confirmed one", async () => {
  const h = await fixture();
  await h.seedCandidate();
  const refusals = [
    { lane: "frontline" as const, observedScope: "whole-target" as const, selectedScope: "chunked" as const,
      target: first.target, examinedTargets: [first.target] },
    { lane: "standard" as const, observedScope: "chunked" as const, selectedScope: "whole-target" as const,
      target: second.target, examinedTargets: [first.target, second.target] },
  ];
  let call = 0;
  const compose = async () => {
    const next = refusals[Math.min(call++, refusals.length - 1)];
    if (next === undefined) throw new Error("no scripted refusal");
    const { examinedTargets, ...scopeMismatch } = next;
    return { status: "refused" as const, code: "scope-judgment-required" as const,
      reason: "review producer scope does not match the selected scope", scopeMismatch, examinedTargets };
  };
  const refused = await h.run(true, { frontline: { scopeMode: "chunked" } }, undefined, { compose });
  expect(decodePrePublicationReplayV2(remedyToken(refused))).toMatchObject({ scopeJudgmentTarget: first.target });
  const again = await h.run(false, {}, remedyToken(refused), { compose });
  expect(again, JSON.stringify(again)).toMatchObject({ error: { code: "scope-judgment-required" },
    scopeMismatch: { lane: "standard", target: second.target } });
  expect(decodePrePublicationReplayV2(remedyToken(again))).toMatchObject({ scopeJudgmentTarget: second.target,
    lanes: { frontline: { scopeMode: "whole-target" }, standard: { scopeMode: "chunked" } } });
});

it("leaves no accepted decision when its native boundary batch refuses and succeeds on retry", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const write = h.store.write.bind(h.store), batch = h.store.batch.bind(h.store);
  let refuseBoundary = true;
  h.store.write = async input => {
    if (refuseBoundary && input.action === "put" && input.reference.kind === "review/integration-boundary") {
      refuseBoundary = false;
      return write({ ...input, expected: null });
    }
    return write(input);
  };
  h.store.batch = async input => {
    if (refuseBoundary && input.writes.some(value => value.reference.kind === "review/integration-boundary")) {
      refuseBoundary = false;
      return batch({ ...input, writes: input.writes.map(value => value.action === "put"
        && value.reference.kind === "review/integration-boundary" ? { ...value, expected: null } : value) });
    }
    return batch(input);
  };
  const lanes = { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } };
  expect(await h.run(true, lanes)).toMatchObject({ error: { message: expect.stringMatching(/boundary.*changed|boundary.*version/i) } });
  const decisions = createReviewDecisionPort(h.store, owner), listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records.filter(({ value }) => value.choice.kind === "terminus")).toEqual([]);
  expect(await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).toEqual(before);
  const repaired = await h.run(true, lanes);
  const after = await decisions.list();
  if (after.status !== "complete") throw new Error(after.reason);
  const termini = after.records.filter(({ value }) => value.choice.kind === "terminus");
  expect(termini).toHaveLength(1);
  if (termini[0] === undefined) throw new Error("expected recovered terminus");
  expect(repaired).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: reviewDecisionKey(termini[0].value) });
});

it("retains a concurrent decision conflict's remedy and reuses that decision on retry", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const batch = h.store.batch.bind(h.store);
  let concurrent = true, condition = "";
  h.store.batch = async input => {
    const decision = input.writes.find(value => value.action === "put" && value.reference.kind === "review/decision");
    if (concurrent && decision !== undefined) {
      concurrent = false;
      lifecycleSuccess(await h.store.write({ ...decision, provenance: input.provenance }));
      const result = await batch(input);
      if (result.status !== "refused") throw new Error("expected concurrent decision conflict");
      condition = `${result.refusal.condition} ${result.refusal.remedy.text}`;
      return result;
    }
    return batch(input);
  };
  const lanes = { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } };
  const result = await h.run(true, lanes);
  expect(condition).not.toBe("");
  expect(result).toMatchObject({ error: { message: expect.stringContaining(condition) } });
  expect(await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).toEqual(before);
  const decisions = createReviewDecisionPort(h.store, owner), listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  const termini = listing.records.filter(({ value }) => value.choice.kind === "terminus");
  expect(termini).toHaveLength(1);
  if (termini[0] === undefined) throw new Error("expected concurrently recorded decision");
  const recorded = termini[0], key = reviewDecisionKey(recorded.value);
  expect(await h.run(true, lanes)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: key });
  expect(await decisions.read(key)).toEqual(recorded);
});


it.each([null, "original-owner"])("carries a recovered singleton decision to the attested subject with author %s", async decidedBy => {
  const h = await fixture(), owner = await h.seedCandidate();
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const current = snapshot.boundary;
  if (current?.schemaVersion !== 2 || current.candidateSubjectDigest === null) throw new Error("Expected native boundary");
  const decisions = createReviewDecisionPort(h.store, owner);
  const recorded = await decisions.create({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: current.candidateId }, headSha: null,
      subjectDigest: canonicalDigest({ earlierSubject: true }) }, lane: "standard", choice: { kind: "terminus" },
    decidedBy, decidedAt: null, basis: { passCount: 2 } });
  const key = reviewDecisionKey(recorded.value);
  const published = projectPublicationBoundary({ workUnit: "example", branch: "topic/opaque", candidateId: current.candidateId,
    candidateSubjectDigest: recorded.value.subject.subjectDigest, reservation: null, changeRequest: null,
    terminus: key, readinessBinding: null }, 2);
  const recovered = recoverAttestedOwnerTerminusBoundary({ workUnit: "example", candidateId: current.candidateId,
    candidateSubjectDigest: current.candidateSubjectDigest, repairCurrent: true, stored: published });
  if (recovered === null) throw new Error("Expected non-semantic boundary recovery");
  await writeSubmissionBoundary(h.cwd, recovered, snapshot.version, { store: h.store, owner });
  const termini = async () => { const listing = await decisions.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    return listing.records.filter(record => record.value.choice.kind === "terminus"); };
  const before = await termini();
  const ready = await h.run(true);
  expect(ready, JSON.stringify(ready)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: key });
  const replay = await h.run();
  expect(replay, JSON.stringify(replay)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: key });
  expect(await termini()).toEqual(before);
  expect(await decisions.read(key)).toEqual(recorded);
});


it("drops a native terminus when an approved fix advances the private Candidate subject", async () => {
  const h = await fixture(), owner = await h.seedCandidate(true);
  const candidate = await readCandidateRecord(h.cwd, "example", { store: h.store, owner });
  if (candidate === null) throw new Error("Expected response Candidate");
  const decisions = createReviewDecisionPort(h.store, owner);
  const recorded = await decisions.create({ schemaVersion: 1, subject: {
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId }, headSha: null,
    subjectDigest: candidate.subject.subjectDigest }, lane: "standard", choice: { kind: "terminus" },
    decidedBy: "test-user", decidedAt: null, basis: { passCount: 2 } });
  const old = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  await writeSubmissionBoundary(h.cwd, projectCandidateReviewResumeBoundary({ workUnit: "example",
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest,
    reservation: null, terminus: reviewDecisionKey(recorded.value), postAttestContinuation: {
      reviewedHead: candidate.attestation.baseRevision, nextAction: { kind: "continue-pre-publication-review",
        command: "arc review pre-publication example", interactionText: "Continue review after attestation." } } }, 2),
  old.version, { store: h.store, owner });
  const listing = await decisions.list();
  const result = await h.run(true);
  expect(result, JSON.stringify(result)).toHaveProperty("terminus", null);
  const after = await decisions.list();
  if (listing.status !== "complete" || after.status !== "complete") throw new Error("Expected complete decisions");
  expect(after.records.filter(record => record.value.choice.kind === "terminus"))
    .toEqual(listing.records.filter(record => record.value.choice.kind === "terminus"));
});
