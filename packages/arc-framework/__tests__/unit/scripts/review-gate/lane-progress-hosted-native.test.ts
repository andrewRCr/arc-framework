/** Hosted admission, acknowledgment, and terminal replay use portable outcomes with pending-only execution. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { createHostedHandleFixture, createHostedTerminalAttemptFixture } from "../../../fixtures/hosted-review.js";
import { RepositoryGitCommonStatePublisher } from "../../../../src/lib/git-common-state.js";
import { createReviewOutcomePort } from "../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../src/lib/store/kinds/review/evidence/access.js";
import { NativeReviewInFlightStateStore } from "../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { requestHostedReview, type HostedRequestOutcome } from "../../../../src/scripts/review-gate/hosted/request.js";
import { awaitHostedReview } from "../../../../src/scripts/review-gate/hosted/await.js";
import { recordHostedRequestAdmission, acknowledgeHostedRequest, resolveHostedAwaitResult, recordHostedAwaitAttempt } from
  "../../../../src/scripts/review-gate/lane-progress-hosted-request.js";
import { HostedRequestOwnerIndex } from "../../../../src/scripts/review-gate/hosts/local/hosted-request-owner-index.js";
import { readStandardPassCounts } from "../../../../src/scripts/review-gate/runtime/lane-pass-counts.js";
import { recordHostedRequestConclusion } from "../../../../src/scripts/review-gate/lane-progress-hosted-settlement.js";
import { ReviewInFlightRecordSchema } from "../../../../src/scripts/review-gate/core/in-flight-state-schema.js";
import { laneProgressOperationId } from "../../../../src/scripts/review-gate/lane-progress.js";

async function hostedReview() {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
  const evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: primary.reference.owner,
    outcomes, evidence, projectId: h.projectId });
  const template = createHostedHandleFixture({ repositoryId: projectId });
  const request = { schemaVersion: 1 as const, provider: template.provider, target: template.target, coverage: "complete" as const };
  const admission = template.admission, now = () => "2026-10-20T12:01:00Z";
  const dispatch = async (outcome: HostedRequestOutcome, store = operations) => requestHostedReview(request, {
    adapters: [{ id: template.provider, identities: { botUserId: "136622811", appId: "347564" },
      request: async () => outcome }],
    admitRequest: req => recordHostedRequestAdmission(store, { repositoryId: projectId, lineage: admission.lineage,
      request: req, reviewTarget: admission.reviewTarget, requirement: admission.requirement,
      actorIdentity: admission.actorIdentity, authorizeCapacity: async () => undefined, now: now() }),
    acknowledgeRequest: async (admitted, handle) => { await acknowledgeHostedRequest(store, { admission: admitted, handle, now: now() }); },
    concludeRequest: async (admitted, result) => { await recordHostedRequestConclusion(store, { admission: admitted, result, now: now() }); },
  });
  return { ...checkout, primary, publisher, outcomes, evidence, operations, template, dispatch, now };
}

it.each(["clean", "findings"] as const)("publishes a sealed %s result at its admission key and replays it on another checkout", async verdict => {
  const h = await hostedReview();
  const requested = await h.dispatch({ kind: "created", artifact: h.template.artifact, effectiveCoverage: "complete" });
  if (requested.state !== "requested") throw new Error("Expected actual provider acknowledgment");
  const handle = requested.handle, admission = handle.admission;
  const ownerId = laneProgressOperationId({ lane: "standard", repositoryId: admission.repositoryId,
    headSha: admission.target.headSha, lineage: admission.lineage });
  expect((await h.operations.readOperation(ownerId)).state).toMatchObject({ kind: "lane-progress", completedPasses: 0,
    attempts: [{ attemptId: expect.not.stringContaining("hosted-admission/"), outcome: "pending", hosted: { handle } }] });
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
  expect(await h.publisher.list({ root: "review-gate", namespace: "in-flight" })).toHaveLength(1);
  const first = await resolveHostedAwaitResult(h.operations, { repositoryId: admission.repositoryId, handle, now: h.now,
    observe: () => awaitHostedReview({ ...requested.action, timeoutMs: 2_000, pollIntervalMs: 100 }, {
      clock: { now: () => Date.parse(handle.artifact.createdAt), sleep: async () => undefined }, attentionAfterMs: 60_000,
      observers: [{ id: handle.provider, readHead: async () => handle.target.headSha,
        observe: async () => verdict === "clean" ? { kind: "clean", reviewUrl: "https://example.invalid/review-1" }
          : { kind: "findings", reviewUrl: "https://example.invalid/review-1", findings: [{ findingId: "finding-1",
            origin: "review-thread", commentId: "comment-1", threadId: "thread-1", settlement: "reply-and-resolve",
            severity: "major", locus: "src/example.ts:1", url: "https://example.invalid/finding-1", sourceOrdinal: 1 }] } }],
    }) });
  const key = admission.admissionId.replace(/^hosted-admission\//u, "hosted-admission-");
  const stored = await h.outcomes.read(key);
  expect(stored?.reference.owner).toEqual(h.primary.reference.owner);
  expect(stored?.value).toMatchObject({ attemptId: first.progress.attempts[0]?.attemptId, lane: "standard", outcome: verdict,
    logicalPass: 1, hosted: { admission, handle, sealedResult: { outcome: verdict, hostedResultId: first.hostedResultId,
      reviewUrl: "https://example.invalid/review-1" } } });
  expect(first.progress.completedPasses).toBe(1);
  const raw = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
  const entry = raw[0];
  if (entry?.kind !== "file") throw new Error("Expected native in-flight record");
  const working = ReviewInFlightRecordSchema.parse(JSON.parse(entry.content));
  expect(working.state.kind === "lane-progress" && working.state.attempts).toEqual([]);
  if (stored === null) throw new Error("Expected actual stored owner");
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: stored.reference.owner,
    outcomes: h.outcomes, evidence: h.evidence, projectId: h.projectId });
  const replay = await resolveHostedAwaitResult(operations, { repositoryId: admission.repositoryId, handle, now: h.now,
    observe: async () => { throw new Error("Completed native await must not poll the provider again"); } });
  expect(replay).toMatchObject({ hostedResultId: first.hostedResultId, result: { state: verdict,
    reviewUrl: "https://example.invalid/review-1" }, progress: { completedPasses: 1 } });
  expect(await h.outcomes.read(key)).toEqual(stored);
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it("publishes a failed request's reason without a handle and replays that conclusion from its outcome", async () => {
  const h = await hostedReview();
  const first = await h.dispatch({ kind: "terminal-failure", reason: "Provider rejected the request." });
  expect(first).toMatchObject({ state: "terminal-failure", reason: "Provider rejected the request." });
  const key = h.template.admission.admissionId.replace(/^hosted-admission\//u, "hosted-admission-");
  const stored = await h.outcomes.read(key);
  expect(stored?.value).toMatchObject({ attemptId: h.template.admission.admissionId, outcome: "terminal-failure",
    effectiveCoverage: null, findings: [], hosted: { admission: h.template.admission,
      requestFailureReason: "Provider rejected the request." } });
  expect(stored?.value.hosted).not.toHaveProperty("handle");
  expect(stored?.value.hosted).not.toHaveProperty("sealedResult");
  expect(await h.dispatch({ kind: "ambiguous-delivery" })).toEqual(first);
  expect(await h.outcomes.read(key)).toEqual(stored);
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
});

it("admits hosted logical pass three after a complete and incremental verdict while retaining one complete pass", async () => {
  const h = await hostedReview(), repositoryId = h.template.admission.repositoryId;
  const lineage = h.template.admission.lineage, index = new HostedRequestOwnerIndex(h.publisher);
  for (const [pass, coverage] of [[1, "complete"], [2, "incremental"], [3, "complete"]] as const) {
    const template = createHostedHandleFixture({ repositoryId, lineage, logicalPass: pass, requestedCoverage: coverage,
      artifact: { ...h.template.artifact, id: `request-${pass}` } });
    const request = { schemaVersion: 1 as const, provider: template.provider, target: template.target, coverage,
      ...(template.admission.correctionScope === undefined ? {} : { correctionScope: template.admission.correctionScope }) };
    const admitted = await recordHostedRequestAdmission(h.operations, { repositoryId, lineage, request,
      reviewTarget: template.admission.reviewTarget, requirement: template.admission.requirement,
      actorIdentity: template.admission.actorIdentity, now: h.now(), authorizeCapacity: async capacity => {
        const reserved = await index.reserve({ repositoryId, workItem: h.primary.reference.owner, request, lineage,
          logicalPass: capacity.logicalPass, completedPassesAtAdmission: capacity.progress?.completedPasses ?? 0,
          oldAdmissionAbsent: async () => false,
          oldPassCompleted: async prior => (capacity.progress?.completedPasses ?? 0) > prior.completedPassesAtAdmission });
        expect(reserved).toBe("reserved");
      } });
    if (admitted.state !== "admitted") throw new Error(JSON.stringify(admitted));
    expect(admitted.admission.logicalPass).toBe(pass);
    await index.markAdmitted({ repositoryId, request, lineage, logicalPass: admitted.admission.logicalPass });
    const indexed = await index.read(repositoryId, request);
    expect(indexed).toMatchObject({ logicalPass: pass, completedPassesAtAdmission: pass - 1, phase: "admitted" });
    if (pass === 3) {
      expect(await readStandardPassCounts({ ...h, store: h.operations, repositoryId,
        headSha: template.target.headSha, lineage })).toEqual({ completedPasses: 2, completePasses: 1 });
      const listing = await h.outcomes.list();
      expect(listing.status === "complete" && listing.records.map(record => record.value.logicalPass).sort()).toEqual([1, 2]);
      continue;
    }
    const handle = { ...template, admission: admitted.admission };
    await acknowledgeHostedRequest(h.operations, { admission: admitted.admission, handle, now: h.now() });
    const terminal = createHostedTerminalAttemptFixture({ admission: admitted.admission, artifact: handle.artifact, outcome: "clean" });
    const coverageEvidence = terminal.hosted.sealedResult?.coverageEvidence;
    await recordHostedAwaitAttempt(h.operations, { repositoryId, now: h.now(), result: { schemaVersion: 1,
      mode: "review-hosted-await", handle, state: "clean", nextAction: "complete", reviewUrl: "https://example.invalid/review",
      ...(coverageEvidence === undefined ? {} : { coverageEvidence }) } });
  }
});
