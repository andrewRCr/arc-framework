/** Import refuses inconsistent joins and attributes each failure to its supplied source. */
import { expect, it } from "vitest";
import { createLocalMappingFixture, createFrontlineMappingFixture, mappingOperation, mappingErrand } from "../../../../../fixtures/review-mapping.js";
import { mappingBoundaryFixture } from "../../../../../fixtures/review-mapping-boundary.js";
import { approvedRecord } from "../../../../../fixtures/review-response-proof.js";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import type { ReviewMappingInput } from "../../../../../../src/lib/store/kinds/review/mapping-types.js";
import { collectReviewMappingSources } from "../../../../../../src/lib/store/kinds/review/mapping-listing.js";
import { ReviewMappingSourceError } from "../../../../../../src/lib/store/kinds/review/mapping-error.js";
import { createFrontlineOutcomeRecord } from "../../../../../../src/scripts/review-gate/core/advisory-records.js";
import { FrontlineOutcomeStoreRecordSchema } from "../../../../../../src/scripts/review-gate/core/repository-record-schemas.js";
import { IntegrationBoundaryLocusSchema } from "../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { bindReviewSourceReference } from "../../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";
import { LaneProgressStateSchema } from "../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { laneProgressOperationId } from "../../../../../../src/scripts/review-gate/lane-progress.js";

const laneJoins = "the operations, frontline outcomes, and receipts its attempts cite";
const boundaryJoins = "the Candidate records, review outcomes, and operations it cites";
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function kind(source: ReviewMappingInput["gate"][number]): string | undefined {
  return (JSON.parse(new TextDecoder().decode(source.bytes)) as { state?: { kind?: string } }).state?.kind;
}
function refuses(input: ReviewMappingInput, source: string, message: RegExp, joins?: string): void {
  let failure: unknown;
  try { mapReviewRecords(input); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(ReviewMappingSourceError);
  expect(failure).toMatchObject({ source, joins, message: expect.stringMatching(message) });
}

it("refuses a local producer in another live lane owner and maps its repaired historical head", async () => {
  const h = await createLocalMappingFixture();
  await h.conclude("clean");
  const entry = [...h.operations.entries()].find(([, record]) => record.state.kind === "lane-progress");
  if (entry === undefined || entry[1].state.kind !== "lane-progress") throw new Error("Expected local lane");
  const [key, original] = entry, lane = original.state;
  if (lane.kind !== "lane-progress" || lane.lineage.kind !== "head-bound") throw new Error("Expected Errand lineage");
  const lineage = { ...lane.lineage, vehicleIdentity: "claim-other" };
  const foreign = LaneProgressStateSchema.parse({ ...lane, lineage,
    operationId: laneProgressOperationId({ lane: lane.lane, repositoryId: lane.repositoryId,
      headSha: lineage.headSha, lineage }) });
  h.operations.set(key, { ...original, state: foreign });
  const input = h.input();
  input.workItems.push({ ...mappingErrand, slug: "other-review-errand", claimId: "claim-other",
    uid: "123e4567-e89b-42d3-a456-426614174001" });
  refuses(input, mappingOperation(foreign, original.version).path, /Local producer lane owner mismatch/u, laneJoins);
  const repairedLineage = { ...lane.lineage, headSha: "e".repeat(40) };
  h.operations.set(key, { ...original, state: LaneProgressStateSchema.parse({ ...lane, lineage: repairedLineage,
    operationId: laneProgressOperationId({ lane: lane.lane, repositoryId: lane.repositoryId,
      headSha: repairedLineage.headSha, lineage: repairedLineage }) }) });
  await assertReviewMapping(mapReviewRecords(h.input()));
});

it.each(["missing", "duplicate"] as const)("refuses a %s joined local operation and maps after repair", async fault => {
  const h = await createLocalMappingFixture();
  await h.conclude("clean");
  const input = h.input(), original = [...input.gate];
  const local = input.gate.find(source => source.path.includes("/operations/") && kind(source) === "local-review")!;
  const lane = input.gate.find(source => source.path.includes("/operations/") && kind(source) === "lane-progress")!;
  input.gate = fault === "missing" ? input.gate.filter(source => source !== local)
    : [...input.gate, { ...local, path: "arc/review-gate/operations/copied-local.json" }];
  refuses(input, lane.path, /Expected one local operation/u, laneJoins);
  input.gate = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it.each(["scope", "coverage", "vehicle", "request", "pass", "head"] as const)(
  "attributes a mismatching local admission %s and maps after repair", async fault => {
    const h = await createLocalMappingFixture();
    await h.conclude("clean");
    const input = h.input();
    const lane = input.gate.find(source => kind(source) === "lane-progress")!;
    const original = lane.bytes;
    const envelope = JSON.parse(new TextDecoder().decode(original)) as { state: import("../../../../../../src/scripts/review-gate/core/operation-state-schema.js").LaneProgressState };
    const attempt = envelope.state.attempts[0]!;
    if (attempt.local === undefined) throw new Error("Expected local admission");
    if (fault === "scope") attempt.local.scopeMode = "chunked";
    else if (fault === "coverage") {
      attempt.local.requestedCoverage = "incremental";
      attempt.local.effectiveCoverage = "incremental";
      attempt.local.correctionScope = { schemaVersion: 1, predecessorProducerId: "previous", predecessorHeadSha: "a".repeat(40),
        basisHeadSha: "a".repeat(40), headSha: attempt.headSha, requiredFindings: [] };
    } else if (fault === "vehicle") attempt.local.vehicle.identity = "different-errand";
    else if (fault === "request") attempt.local.requestId = canonicalDigest({ another: "request" });
    else if (fault === "pass") attempt.retryGeneration += 1;
    else attempt.headSha = "9".repeat(40);
    lane.bytes = bytes(envelope);
    refuses(input, lane.path, /Local attempt does not match admission/u, laneJoins);
    lane.bytes = original;
    await assertReviewMapping(mapReviewRecords(input));
  });

it.each(["missing", "duplicate"] as const)("refuses a %s joined frontline outcome and maps after repair", async fault => {
  const { input } = await createFrontlineMappingFixture(), original = [...input.gate];
  const outcome = input.gate.find(source => source.path.includes("/outcomes/"))!;
  const lane = input.gate.find(source => source.path.includes("/operations/") && kind(source) === "lane-progress")!;
  input.gate = fault === "missing" ? input.gate.filter(source => source !== outcome)
    : [...input.gate, { ...outcome, path: "arc/review-gate/outcomes/copied-outcome.json" }];
  refuses(input, lane.path, /Expected one frontline outcome/u, laneJoins);
  input.gate = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it("refuses a digest-valid frontline outcome from another admission and maps the repaired join", async () => {
  const { fixture, input } = await createFrontlineMappingFixture();
  const source = input.gate.find(source => source.path.includes("/outcomes/"))!;
  const lane = input.gate.find(source => source.path.includes("/operations/") && kind(source) === "lane-progress")!;
  const original = source.bytes;
  const { outcomeDigest: ignored, ...record } = fixture.outcomeRecord;
  void ignored;
  const altered = createFrontlineOutcomeRecord({ ...record, outcome: { ...record.outcome, pass: record.outcome.pass + 1 } });
  source.bytes = bytes(FrontlineOutcomeStoreRecordSchema.parse({ schemaVersion: 1, semanticsVersion: "frontline-outcome-store/v1",
    operationId: altered.operationId, version: 1, record: altered }));
  refuses(input, lane.path, /Frontline outcome does not match admission/u, laneJoins);
  source.bytes = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it.each(["operation", "frontline"] as const)("attributes a mismatching %s envelope identity and maps after repair", async type => {
  const { input } = await createFrontlineMappingFixture();
  const source = input.gate.find(source => type === "frontline" ? source.path.includes("/outcomes/")
    : source.path.includes("/operations/") && kind(source) === "lane-progress")!;
  const original = source.bytes;
  const envelope = JSON.parse(new TextDecoder().decode(original)) as { operationId: string };
  source.bytes = bytes({ ...envelope, operationId: "another-operation" });
  refuses(input, source.path, type === "frontline" ? /Outcome identity mismatch/u : /Operation identity mismatch/u);
  source.bytes = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it("refuses a response source with no mapped producer and maps once that dangling source is removed", async () => {
  const { input, boundary } = mappingBoundaryFixture("candidate-fix-pending");
  const original = input.candidates[0]!.boundary;
  const source = collectReviewMappingSources(input).find(source => source.kind === "boundary")!.source;
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary, nextAction: {
    kind: "continue-pre-publication-review", command: "arc review respond -", interactionText: "Respond.",
    responseOperationId: "missing-producer", responseSource: { kind: "attested-local", receiptRef: bindReviewSourceReference({
      kind: "attested-local", operationId: "missing-producer", durableRef: "missing-result" }) } } }));
  refuses(input, source, /Response source missing-producer has no mapped live result/u, boundaryJoins);
  input.candidates[0]!.boundary = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it("refuses a replay terminus with no readable Candidate and maps after its identity is repaired", async () => {
  const { input, boundary } = mappingBoundaryFixture();
  const original = input.candidates[0]!.boundary;
  const source = collectReviewMappingSources(input).find(source => source.kind === "boundary")!.source;
  const token = Buffer.from(JSON.stringify({ lanes: { standard: { terminus: { mode: "owner-accepted" } } } })).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    candidateId: canonicalDigest({ missing: true }), nextAction: { kind: "continue-pre-publication-review",
      command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume." } }));
  refuses(input, source, /Replay terminus Candidate .* has no readable record/u, boundaryJoins);
  input.candidates[0]!.boundary = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it.each(["multiple-owners", "missing-version", "duplicate-evidence"] as const)("refuses %s in imported readiness and maps after repair", async fault => {
  const { input: base, boundary } = mappingBoundaryFixture("candidate-publish-ready");
  const h = await createLocalMappingFixture({ imported: base, lineage: { kind: "candidate", candidateId: boundary.candidateId },
    vehicle: { kind: "work-unit", identity: "example" } });
  await h.conclude();
  const input = h.input();
  const owner = [...h.operations.values()].find(({ state }) => state.kind === "lane-progress")!;
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary, standardLaneOwnerVersion: owner.version }));
  const source = collectReviewMappingSources(input).find(source => source.kind === "boundary")!.source;
  const lane = mappingOperation(owner.state, owner.version);
  const original = [...input.gate];
  if (fault === "multiple-owners") input.gate.push({ ...lane, path: "arc/review-gate/operations/copied-lane.json" });
  else if (fault === "missing-version") input.gate = input.gate.map(entry => {
    if (entry.path !== lane.path) return entry;
    const payload = JSON.parse(new TextDecoder().decode(entry.bytes)) as { version?: number };
    delete payload.version;
    return { ...entry, bytes: bytes(payload) };
  });
  else {
    const producer = await h.resultReader.readResult(h.state.operationId);
    const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
    input.gate.push({ path: "arc/review-gate/evidence/disposition-first.json", bytes: bytes(record) },
      { path: "arc/review-gate/evidence/disposition-copy.json", bytes: bytes(record) });
  }
  refuses(input, fault === "missing-version" ? lane.path : source,
    fault === "multiple-owners" ? /multiple standard lane owners/u : fault === "missing-version" ? /version/u
      : /Cannot bind imported readiness/u, fault === "missing-version" ? undefined : boundaryJoins);
  input.gate = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it("refuses a consumed authorization with no matching admission and maps after repair", async () => {
  const { captureConditionalNextPassAuthorization } = await import("../../../../../../src/scripts/review-gate/lane-progress-conditional.js");
  const { settleLaneAttempt } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const h = await createLocalMappingFixture();
  await h.conclude();
  const producer = h.state;
  const record = approvedRecord(await h.resultReader.readResult(producer.operationId), [
    { sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const dispositionSetId = record.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const context = { lane: "standard" as const, repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.lineage, dispositionSetId };
  const captured = await captureConditionalNextPassAuthorization(h.dependencies.operationStore, { ...context,
    producerId: producer.operationId, authorizedBy: "author-1", exhaustedPassCount: 1, nextPass: 2, now: h.dependencies.now() });
  await settleLaneAttempt(h.dependencies.operationStore, { ...context, attemptId: producer.operationId,
    producedHeadSha: producer.target.headSha, now: h.dependencies.now() });
  h.dependencies.validatePolicyAdmission = async () => ({ state: "ready", pass: 2,
    coverageAdmission: { requestedCoverage: "complete" } });
  const admitted = await h.prepare({ ceilingOverride: { exhaustedPassCount: 1, nextPass: 2,
    conditionalPassAuthorizationId: captured.authorizationId } });
  await h.conclude("clean", admitted);
  const input = h.input();
  const lane = input.gate.find(source => source.path.includes("/operations/") && kind(source) === "lane-progress")!;
  const original = lane.bytes;
  const damaged = JSON.parse(new TextDecoder().decode(original)) as {
    state: { attempts: { conditionalPassAuthorizations?: { authorizations: { status: string; admissionId?: string }[] } }[] } };
  const grant = damaged.state.attempts.flatMap(attempt => attempt.conditionalPassAuthorizations?.authorizations ?? [])
    .find(authorization => authorization.status === "consumed")!;
  grant.admissionId = "unavailable-admission";
  lane.bytes = bytes(damaged);
  refuses(input, lane.path, /Consumed admission unavailable-admission is unavailable/u, "the review outcomes it cites");
  lane.bytes = original;
  await assertReviewMapping(mapReviewRecords(input));
});

it("refuses a contradictory joined delivery admission and maps after restoring its original snapshot", async () => {
  const { createLocalReviewPreparationFixture, createDeliveryLocalReviewAdmission } = await import("../../../../../fixtures/local-review-preparation.js");
  const { prepareLocalReview } = await import("../../../../../../src/scripts/review-gate/runtime/local-prepare.js");
  const { createReviewReceipt } = await import("../../../../../../src/scripts/review-gate/core/gate-contract-v2.js");
  const { recordLocalReceiptConclusion } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const f = createLocalReviewPreparationFixture();
  const prepared = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
    deliveryAdmission: createDeliveryLocalReviewAdmission(f.memberTarget.headSha),
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" },
    }, f.dependencies);
  const state = f.published();
  if (prepared.state !== "ready" || state?.kind !== "local-review") throw new Error(JSON.stringify(prepared));
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "run-delivery", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  await recordLocalReceiptConclusion(f.dependencies.operationStore, { state, receipt, now: f.dependencies.now() });
  const input: ReviewMappingInput = { projectId: state.repositoryId, candidates: [], workItems: [{ kind: "work-unit",
    slug: "review-surface-binding", uid: "123e4567-e89b-42d3-a456-426614174001", live: true }],
    gate: [...f.operations.values()].map(({ state, version }) => mappingOperation(state, version)).concat([{
      path: "arc/review-gate/evidence/receipts-v2.json", bytes: bytes({ schemaVersion: 2,
        semanticsVersion: "review-gate/v2", repositoryId: state.repositoryId, ledgerVersion: 1, receipts: [receipt] }),
    }]) };
  const lane = input.gate.find(source => kind(source) === "lane-progress")!, original = lane.bytes;
  const envelope = JSON.parse(new TextDecoder().decode(original)) as {
    state: import("../../../../../../src/scripts/review-gate/core/operation-state-schema.js").LaneProgressState };
  const admission = envelope.state.attempts[0]?.local?.deliveryAdmission;
  if (admission === undefined) throw new Error("Expected delivery admission");
  admission.statusTarget.headRef = "delivery/other-branch";
  lane.bytes = bytes(envelope);
  refuses(input, lane.path, /Local attempt does not match admission/u, laneJoins);
  lane.bytes = original;
  await assertReviewMapping(mapReviewRecords(input));
});
