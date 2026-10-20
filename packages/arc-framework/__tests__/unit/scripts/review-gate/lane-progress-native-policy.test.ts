/** Portable mapped lanes retain repository source order and policy results. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { createLocalReviewPreparationFixture } from "../../../fixtures/local-review-preparation.js";
import { createLocalMappingFixture, mappingOperation } from "../../../fixtures/review-mapping.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";
import { serializeCandidateManagedRecord } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { mapReviewRecords } from "../../../../src/lib/store/kinds/review/mapping.js";
import { createReviewCompositionContext } from "../../../../src/scripts/review-gate/runtime/composition-context.js";
import { LocalReviewResultReader } from "../../../../src/scripts/review-gate/hosts/local/review-result-reader.js";
import { LocalApprovedDispositionRecordStore } from "../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { createRepositoryReviewResultReader } from "../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { confirmLocalReviewTarget } from "../../../../src/scripts/review-gate/hosts/local/repository-target.js";
import { resolveEvidenceBoundReviewPolicy } from "../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { projectReviewPolicyAttempt } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { recordHostedRequestAdmission, acknowledgeHostedRequest, recordHostedAwaitAttempt, readLaneProgress, laneProgressOperationId }
  from "../../../../src/scripts/review-gate/lane-progress.js";
import type { ReviewResultReader } from "../../../../src/scripts/review-gate/core/ports.js";
import { createNativeReviewPerformanceFixture } from "../../../fixtures/native-review-performance.js";
import { reviewEvidenceFixture } from "../../../fixtures/review-evidence.js";
import { localOutcome } from "../../../fixtures/review-outcome.js";
import { ReviewOutcomeSchema } from "../../../../src/lib/store/kinds/review/outcome/schema.js";
import { composeReviewDispositionRecord } from "../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewPerformance } from "../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { publishNativeReviewApproval } from "../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeConditionalPass } from "../../../../src/scripts/review-gate/runtime/native-conditional-pass.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { readStandardPassCounts } from "../../../../src/scripts/review-gate/runtime/lane-pass-counts.js";

it.each(["fallback", "retry"] as const)("preserves a mapped %s lane's terminal producer and source-order policy", async kind => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), candidate = candidateFixture();
  if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Expected the native generation");
  const lineage = { kind: "candidate" as const, candidateId: candidate.attestation.candidateId };
  const imported = { workItems: [{ kind: "work-unit" as const, slug: "example", uid: primary.reference.owner.uid, live: true }],
    candidates: [{ workItem: primary.reference.owner.uid, versions: [{ commit: "a".repeat(40),
      content: serializeCandidateManagedRecord(candidate) }], boundary: null }] };
  const fixture = await createLocalMappingFixture({ repositoryId: projectId, lineage,
    vehicle: { kind: "work-unit", identity: "example" }, imported });
  let store = fixture.dependencies.operationStore, resultReader: ReviewResultReader = fixture.resultReader;
  let input: ReturnType<typeof fixture.input>;
  const handle = createHostedHandleFixture({ repositoryId: projectId, lineage });
  if (kind === "retry") {
    await fixture.conclude("failed");
    const retry = await fixture.prepare();
    await fixture.conclude("clean", retry);
    input = fixture.input();
  } else {
    const hosted = createLocalReviewPreparationFixture({ repositoryId: projectId });
    store = hosted.dependencies.operationStore;
    let tick = 0;
    const now = () => new Date(Date.parse("2026-10-20T12:00:00Z") + tick++ * 1000).toISOString();
    for (const provider of ["coderabbit-pr", "codex-pr"] as const) {
      const handle = createHostedHandleFixture({ repositoryId: projectId, lineage, provider });
      const admission = await recordHostedRequestAdmission(store, { repositoryId: projectId, lineage,
        request: { schemaVersion: 1, target: handle.target, provider, coverage: "complete" },
        reviewTarget: handle.admission.reviewTarget, requirement: handle.admission.requirement,
        actorIdentity: handle.admission.actorIdentity, authorizeCapacity: async () => {}, now: now() });
      if (admission.state !== "admitted") throw new Error(JSON.stringify(admission));
      expect(admission.admission).toEqual(handle.admission);
      await acknowledgeHostedRequest(store, { admission: admission.admission, handle, now: now() });
      await recordHostedAwaitAttempt(store, { repositoryId: projectId, now: now(), result: provider === "coderabbit-pr"
        ? { schemaVersion: 1, mode: "review-hosted-await", handle, state: "rate-limited", nextAction: "try-next-source" }
        : { schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete",
          reviewUrl: "https://example.invalid/review" } });
    }
    input = { projectId, ...imported, gate: [...hosted.operations.values()].map(({ state, version }) => mappingOperation(state, version)) };
    resultReader = new LocalReviewResultReader({ operationIndex: { readOperationSnapshot: async () => ({ status: "complete",
      records: [...hosted.operations.values()] }) }, sourceStore: hosted.dependencies.sourceStore,
      receiptIndex: { readReceiptEntries: async () => [], readReceiptReference: async () => null },
      outcomeStore: { readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
        appendOutcome: async () => { throw new Error("Unexpected frontline outcome"); } } });
  }
  const target = fixture.state.target, coordinates = { lane: "standard" as const, repositoryId: projectId,
    headSha: target.headSha, lineage };
  const mapped = mapReviewRecords(input);
  lifecycleSuccess(await h.store.batch({ writes: mapped.records.map(record => ({ action: "put", reference: record.reference,
    expected: null, content: record.contents[0]! })), provenance: { verb: "review", lifecycleAction: "create" } }));
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: target.headSha }] },
    { match: ["rev-parse", "--verify", "refs/heads/main"], responses: [{ stdout: target.diffBaseSha }] },
    ...[target.headSha, target.diffBaseSha].map(oid => ({ match: ["cat-file", "-t", oid], responses: [{ stdout: "commit" }] })),
    { match: ["status", "--porcelain=v2", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: ["merge-base", "--all", target.diffBaseSha, target.headSha], responses: [{ stdout: target.diffBaseSha }] },
    { match: ["rev-parse", `${target.headSha}^{tree}`], responses: [{ stdout: target.headTree }] },
    { match: ["rev-parse", `${target.diffBaseSha}^{tree}`], responses: [{ stdout: target.diffBaseTree }] },
  ] });
  onTestFinished(checkout.cleanup);
  const context = createReviewCompositionContext({ ...checkout, workItem: primary.reference.owner });
  const legacy = await readLaneProgress(store, coordinates), native = await readLaneProgress(context.family.ports.inFlight, coordinates);
  expect(native).toEqual(legacy);
  if (native.status !== "recorded" || legacy.status !== "recorded") throw new Error("Expected the produced lane");
  const whole = await store.readOperation(laneProgressOperationId(coordinates));
  expect(await context.family.ports.inFlight.readOperation(laneProgressOperationId(coordinates)))
    .toMatchObject({ version: 0, state: { ...whole.state, workItem: primary.reference.owner } });
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = kind === "retry"
    ? fixture.state.requirement : handle.admission.requirement;
  const request = { schemaVersion: 1, lane: "standard", target: kind === "retry"
    ? { repository: "owner/repo", pullRequest: null, headSha: target.headSha } : handle.target,
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    completedPasses: native.completedPasses, attempts: native.attempts.map(projectReviewPolicyAttempt) };
  const dependencies = { sources: kind === "retry" ? ["delegated-agent"] : ["coderabbit-pr", "codex-pr"], maxPasses: 2,
    nextPassContext: { completePasses: native.completePasses, convergence: "converged" as const, responseDue: false, incremental: null },
    confirmTarget: async (attemptedTarget: typeof target) => {
      const confirmed = await confirmLocalReviewTarget({ ...checkout, attemptedTarget });
      if (confirmed.state !== "current") throw new Error("Expected the exact current target");
      return confirmed.target;
    } };
  const expected = await resolveEvidenceBoundReviewPolicy(request, { ...dependencies, resultReader,
    dispositionStore: new LocalApprovedDispositionRecordStore(context.publisher) });
  const actual = await resolveEvidenceBoundReviewPolicy(request, { ...dependencies,
    resultReader: createRepositoryReviewResultReader(context.publisher, { ...checkout, workItem: primary.reference.owner }),
    dispositionStore: context.family.ports.dispositions });
  expect(actual).toEqual(expected);
  expect(actual).toMatchObject({ state: "pass-complete", payload: { pass: 1, sourceId: kind === "retry" ? "delegated-agent" : "codex-pr" } });
});

it("numbers a conditional grant after an incremental fix check by logical passes while retaining the complete-pass budget", async () => {
  const f = await createNativeReviewPerformanceFixture("errand");
  await publishNativeReviewPerformance(f.input);
  const { targetId: ignored, ...coordinates } = f.outcome.target;
  void ignored;
  const target = createReviewTarget({ ...coordinates, headSha: f.input.performance.producedHeadSha, headTree: "f".repeat(40) });
  if (f.outcome.lineage.kind !== "head-bound") throw new Error("Expected the Errand's lineage");
  const vehicle = f.outcome.local?.vehicle;
  if (vehicle?.kind !== "errand" || vehicle.claimId === undefined) throw new Error("Expected the exact Errand claim");
  const lineage = { ...f.outcome.lineage, headSha: target.headSha };
  const value = ReviewOutcomeSchema.parse(localOutcome({ target, lineage,
    vehicle: { kind: "errand", identity: vehicle.identity, claimId: vehicle.claimId }, logicalPass: 2,
    coverageAdmission: { requestedCoverage: "incremental", correctionScope: { schemaVersion: 1,
      predecessorProducerId: f.outcome.attemptId, predecessorHeadSha: f.outcome.target.headSha,
      basisHeadSha: f.outcome.target.headSha, headSha: target.headSha,
      requiredFindings: f.outcome.findings.map(finding => ({ producerId: f.outcome.attemptId,
        findingId: finding.findingId, locus: finding.locus })) } }, outcome: "findings", findings: [{
      findingId: "successor-finding", severity: "major", locus: "src/example.ts:2", evidenceUrlOrId: "finding:successor", sourceOrdinal: 1 }] }));
  await f.ports.outcomes.create(value);
  const evidence = { ...reviewEvidenceFixture(value, "fix"), binding: f.value.binding };
  await publishNativeReviewApproval({ ...f.ports, record: composeReviewDispositionRecord(value, [evidence], f.primary.reference.owner),
    now: () => "2026-10-20T12:02:00Z" });
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const { family } = createReviewCompositionContext({ ...checkout, workItem: f.primary.reference.owner });
  if (family.mode !== "stored") throw new Error("Expected native review facts");
  const counts = await readStandardPassCounts({ ...checkout, store: family.ports.inFlight,
    repositoryId: target.repositoryId, headSha: target.headSha, lineage });
  expect(counts).toEqual({ completedPasses: 2, completePasses: 1 });
  const capture = { lane: "standard" as const, repositoryId: target.repositoryId, headSha: target.headSha, lineage,
    producerId: value.attemptId, dispositionSetId: evidence.dispositionSet.dispositionSetId,
    authorizedBy: evidence.approval.approvedBy, exhaustedPassCount: counts.completedPasses,
    nextPass: counts.completedPasses + 1, now: "2026-10-20T12:03:00Z" };
  await expect(publishNativeConditionalPass({ ...family.ports, readProjectId: f.h.projectId,
    capture: { ...capture, exhaustedPassCount: counts.completePasses, nextPass: counts.completePasses + 1 } }))
    .rejects.toThrow("does not match its terminal producer");
  expect((await publishNativeConditionalPass({ ...family.ports, readProjectId: f.h.projectId, capture })).value)
    .toMatchObject({ choice: { kind: "extra-pass", passCount: 2,
      precondition: { kind: "approved-fix", exhaustedPassCount: 2 } } });
});
