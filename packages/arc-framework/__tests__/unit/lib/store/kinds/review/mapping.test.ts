/** Pure import preserves producer facts and complete source accounting. */
import { expect, it } from "vitest";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { createLocalMappingFixture, mappingErrand, createFrontlineMappingFixture, mappingOperation } from "../../../../../fixtures/review-mapping.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";
import { reviewOutcomeResultDigest } from "../../../../../../src/lib/store/kinds/review/outcome/result.js";
import { ReviewOutcomeSchema } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";

it("maps a local producer with its exact admission, receipt, findings, and original result digest", async () => {
  const fixture = await createLocalMappingFixture();
  const receipt = await fixture.conclude();
  const result = mapReviewRecords(fixture.input());
  expect(result.records).toHaveLength(1);
  const mapped = result.records[0]!;
  expect(mapped.reference).toMatchObject({ kind: "review/outcome", key: fixture.state.operationId,
    owner: { type: "work-item", name: mappingErrand.slug, uid: mappingErrand.uid } });
  const outcome = ReviewOutcomeSchema.parse(JSON.parse(mapped.contents[0]!));
  expect(outcome.local).toMatchObject({ request: fixture.state.request, attestation: fixture.state.attestation,
    policyVersion: fixture.state.policyVersion, policyBindingDigest: fixture.state.policyBindingDigest,
    sourceDigest: fixture.state.sourceDigest, guidanceDigest: fixture.state.guidanceDigest, receipt });
  expect(outcome.findings).toEqual(receipt.findings);
  const { createReviewTarget } = await import("../../../../../../src/scripts/review-gate/core/gate-contract-v2.js");
  const { targetId, ...coordinates } = fixture.state.target;
  expect(createReviewTarget({ ...coordinates, repositoryId: fixture.input().projectId }).targetId).toBe(targetId);
  expect(outcome.target.targetId).toBe(targetId);
  expect(reviewOutcomeResultDigest(outcome)).toEqual((await fixture.resultReader.readResult(fixture.state.operationId)).resultDigest);
  await assertReviewMapping(result);
});

it("returns no outcomes from an in-flight lane, including its already-ended attempts", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.moveHead();
  const input = fixture.input();
  expect(fixture.laneProgress()?.attempts.map(({ outcome }) => outcome)).toEqual(["stale-target", "pending"]);
  expect(mapReviewRecords(input)).toMatchObject({ records: [], listing: expect.arrayContaining([
    expect.objectContaining({ source: expect.stringMatching(/operations/u), outcome: "in-flight", records: [] }),
  ]) });
});

it("leaves pending work on an ended owner behind before inspecting its continuation", async () => {
  const fixture = await createLocalMappingFixture();
  const input = fixture.input();
  input.workItems = input.workItems.map((row) => ({ ...row, live: false }));
  const result = mapReviewRecords(input);
  expect(result.records).toEqual([]);
  expect(result.listing.every(({ outcome }) => outcome === "left-behind")).toBe(true);
  expect(result.listing).toEqual(expect.arrayContaining([
    expect.objectContaining({ reason: expect.stringMatching(/No live work item/u) }),
  ]));
});


async function twoHeadHistory() {
  const fixture = await createLocalMappingFixture();
  const current = await fixture.moveHead();
  await fixture.conclude("clean", current);
  const result = mapReviewRecords(fixture.input());
  const outcomes = result.records.map(({ contents }) => ReviewOutcomeSchema.parse(JSON.parse(contents[0]!)));
  return { fixture, current, result, outcomes };
}

it("keeps an Errand's earlier attempt on its original head-bound admission lineage", async () => {
  const { fixture, current, result, outcomes } = await twoHeadHistory();
  expect(outcomes.map(({ lineage }) => lineage)).toEqual([fixture.state.lineage, current.lineage]);
  await assertReviewMapping(result);
});

it("maps a stale local attempt from its operation alone without inventing a receipt", async () => {
  const { fixture, result, outcomes } = await twoHeadHistory();
  expect(outcomes[0]).toMatchObject({ attemptId: fixture.state.operationId, outcome: "stale-target", findings: [],
    local: { request: fixture.state.request, attestation: fixture.state.attestation } });
  expect(outcomes[0]!.local?.receipt).toBeUndefined();
  await assertReviewMapping(result);
});

it("orders outcomes a millisecond apart in the original attempt order ending at the lane timestamp", async () => {
  const { fixture, result, outcomes } = await twoHeadHistory();
  const end = Date.parse(fixture.laneProgress()!.updatedAt);
  expect(outcomes.map(({ endedAt }) => Date.parse(endedAt))).toEqual([end - 1, end]);
  await assertReviewMapping(result);
});

it("maps a frontline command's original response-bound source identity without a run record", async () => {
  const { fixture, input } = await createFrontlineMappingFixture();
  const result = mapReviewRecords(input);
  expect(result.records).toHaveLength(1);
  const outcome = ReviewOutcomeSchema.parse(JSON.parse(result.records[0]!.contents[0]!));
  expect(outcome).toMatchObject({ lineage: fixture.admission.lineage, findings: fixture.outcomeRecord.outcome.findings,
    frontline: { sourceBindingId: fixture.run.sourceBindingId, executableIdentity: fixture.outcomeRecord.executableIdentity,
      outcomeDigest: fixture.outcomeRecord.outcomeDigest, responseBinding: fixture.outcomeRecord.responseBinding,
      admission: { frontlineReview: { source: { sourceId: "coderabbit-cli", kind: "command", capability: null } } } } });
  expect(JSON.stringify(outcome)).not.toContain('"executable"');
  expect(JSON.stringify(outcome)).not.toContain('"argv"');
  await assertReviewMapping(result);
});


it("refuses a joined frontline run whose original source-binding digest differs", async () => {
  const { fixture, input } = await createFrontlineMappingFixture();
  input.gate.push(mappingOperation({ ...fixture.run, sourceBindingId: `sha256:${"9".repeat(64)}` }));
  expect(() => mapReviewRecords(input)).toThrow(expect.objectContaining({ name: "ReviewMappingSourceError",
    source: expect.stringMatching(/^arc\/review-gate\/operations\/operation-/u),
    joins: "the operations, frontline outcomes, and receipts its attempts cite",
    message: expect.stringMatching(/Frontline source binding mismatch/u) }));
});

it("names an undecodable gate source in its mapping failure", async () => {
  const { input } = await createFrontlineMappingFixture();
  input.gate.push({ path: "arc/review-gate/operations/broken.json", bytes: new TextEncoder().encode("{}") });
  expect(() => mapReviewRecords(input)).toThrow(expect.objectContaining({ name: "ReviewMappingSourceError",
    source: "arc/review-gate/operations/broken.json",
    message: expect.stringContaining("Review source arc/review-gate/operations/broken.json cannot be mapped") }));
});


it("keeps hosted sealed findings under their admission key and strips mutable settlement state", async () => {
  const { createHostedHandleFixture, createHostedTerminalAttemptFixture } = await import("../../../../../fixtures/hosted-review.js");
  const { LaneProgressStateSchema } = await import("../../../../../../src/scripts/review-gate/core/operation-state-schema.js");
  const handle = createHostedHandleFixture({ lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: mappingErrand.claimId, headSha: "c".repeat(40) } });
  const ended = createHostedTerminalAttemptFixture({ admission: handle.admission, outcome: "findings", findings: [{
    findingId: "finding-hosted", origin: "review-thread", commentId: "comment-1", threadId: "thread-1",
    settlement: "reply-and-resolve", severity: "minor", nit: true, locus: "src/example.ts:3",
    url: "https://example.invalid/finding-1", sourceOrdinal: 1, sourceLabel: "reported finding",
  }] });
  const lane = LaneProgressStateSchema.parse({ schemaVersion: 1, semanticsVersion: "review-operation/v1",
    operationId: "hosted-lane", updatedAt: "2026-10-19T13:00:00Z", kind: "lane-progress", lane: "standard",
    repositoryId: handle.admission.repositoryId, lineage: handle.admission.lineage, completedPasses: 1,
    attempts: [{ attemptId: ended.attemptId, logicalPass: 1, retryGeneration: 0, changeRequestId: null,
      headSha: handle.target.headSha, terminalProducer: true, sourceId: handle.provider, outcome: "findings", hosted: ended.hosted }] });
  const result = mapReviewRecords({ projectId: lane.repositoryId, workItems: [mappingErrand], candidates: [], gate: [mappingOperation(lane)] });
  expect(result.records).toHaveLength(1);
  expect(result.records[0]!.reference.key).toEqual(handle.admission.admissionId.replace(/^hosted-admission\//u, "hosted-admission-"));
  const outcome = ReviewOutcomeSchema.parse(JSON.parse(result.records[0]!.contents[0]!));
  expect(outcome.hosted?.sealedResult).toEqual(ended.hosted.sealedResult);
  expect(outcome.findings).toEqual([{ findingId: "finding-hosted", severity: "minor", nit: true, locus: "src/example.ts:3",
    evidenceUrlOrId: "https://example.invalid/finding-1", sourceOrdinal: 1, sourceLabel: "reported finding" }]);
  expect(outcome.hosted).not.toHaveProperty("settledFindingIds");
  expect(outcome.hosted).not.toHaveProperty("dispositionSetLineage");
  expect(outcome.hosted).not.toHaveProperty("settlementEvidence");
  await assertReviewMapping(result);
});

it("accounts for consumed receipts and frontline files alongside their mapped outcomes", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const local = mapReviewRecords(fixture.input());
  expect(local.listing).toEqual(expect.arrayContaining([expect.objectContaining({
    source: "arc/review-gate/evidence/receipts-v2.json", outcome: "mapped", records: [local.records[0]!.reference],
  })]));
  const { input } = await createFrontlineMappingFixture();
  const frontline = mapReviewRecords(input);
  expect(frontline.listing).toEqual(expect.arrayContaining([expect.objectContaining({
    source: "arc/review-gate/outcomes/frontline-outcome.json", outcome: "mapped", records: [frontline.records[0]!.reference],
  })]));
});

it("names the reason for run state, suspensions, orphan outcomes, foreign identities and discarded snapshots", async () => {
  const { fixture, input } = await createFrontlineMappingFixture();
  input.gate = input.gate.filter(({ path }) => !path.includes("/operations/"));
  input.gate.push(mappingOperation(fixture.run));
  const { state } = await createLocalMappingFixture();
  const suspension = { schemaVersion: 1 as const, semanticsVersion: "review-operation/v1" as const,
    kind: "review-suspension" as const, operationId: "suspension-1", updatedAt: state.updatedAt,
    vehicle: state.vehicle, repositoryId: state.repositoryId, changeRequestId: null, targetId: state.targetId,
    requestId: state.requestId, sourceIdentity: state.laneSourceId, generation: state.retryGeneration,
    policyVersion: state.policyVersion, rubricVersion: state.requirement.rubricVersion,
    rubricDigest: state.requirement.rubricDigest, deadlineAt: "2026-10-19T13:00:00Z", wakeupToken: state.sourceDigest };
  input.gate.push(mappingOperation(suspension));
  input.gate.push({ ...mappingOperation({ ...fixture.run, operationId: "foreign-run", repositoryId: "other-repository" }),
    path: "arc/review-gate/operations/foreign.json" });
  input.gate.push({ path: "arc/review-gate/quarantine/old.json", bytes: new Uint8Array() },
    { path: "arc/review-gate/retired/old.json", bytes: new Uint8Array() });
  const result = mapReviewRecords(input);
  expect(result.records).toEqual([]);
  for (const [source, reason] of [
    ["outcomes/frontline-outcome.json", /retired|no current attempt/iu],
    ["operations/foreign.json", /another repository/iu], ["quarantine/old.json", /quarantin/iu],
    ["retired/old.json", /retired/iu],
  ] as const) expect(result.listing.find((entry) => entry.source === `arc/review-gate/${source}`))
    .toMatchObject({ outcome: "left-behind", reason: expect.stringMatching(reason) });
  expect(result.listing).toEqual(expect.arrayContaining([
    expect.objectContaining({ reason: expect.stringMatching(/frontline run/iu) }),
    expect.objectContaining({ reason: expect.stringMatching(/suspension/iu) }),
  ]));
});

it("imports settled local findings as the immutable findings verdict", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const { settleLaneAttempt } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  await settleLaneAttempt(fixture.dependencies.operationStore, { lane: "standard", repositoryId: fixture.state.repositoryId,
    headSha: fixture.state.target.headSha, lineage: fixture.state.lineage, attemptId: fixture.state.operationId,
    now: fixture.dependencies.now() });
  expect(fixture.laneProgress()?.attempts[0]?.outcome).toBe("settled-findings");
  const result = mapReviewRecords(fixture.input());
  expect(JSON.parse(result.records[0]!.contents[0]!).outcome).toBe("findings");
  await assertReviewMapping(result);
});

it("refuses ambiguous receipts for one local request rather than selecting the first", async () => {
  const fixture = await createLocalMappingFixture();
  const receipt = await fixture.conclude();
  const { createReviewReceipt } = await import("../../../../../../src/scripts/review-gate/core/gate-contract-v2.js");
  fixture.receipts.push(createReviewReceipt({ target: fixture.state.target, requirement: fixture.state.requirement,
    request: fixture.state.request, applicabilityId: receipt.applicabilityId, reviewRunId: "run-2",
    evaluatorIdentity: receipt.evaluatorIdentity, attestingRuntimeIdentity: receipt.attestingRuntimeIdentity,
    attestationMechanism: receipt.attestationMechanism, providerEventIdentity: receipt.providerEventIdentity,
    result: receipt.result, findings: receipt.findings }));
  expect(() => mapReviewRecords(fixture.input())).toThrow(/Ambiguous receipts/u);
});

it("retains partial receipt-ledger reasons while accounting for every supplied source once", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const orphan = await createLocalMappingFixture();
  const orphanState = await orphan.moveHead();
  const orphanReceipt = await orphan.conclude("clean", orphanState);
  const input = fixture.input();
  const ledger = input.gate.find(({ path }) => path.endsWith("/receipts-v2.json"))!;
  const decoded = JSON.parse(new TextDecoder().decode(ledger.bytes));
  decoded.receipts.push(orphanReceipt);
  decoded.ledgerVersion++;
  ledger.bytes = new TextEncoder().encode(JSON.stringify(decoded));
  const result = mapReviewRecords(input);
  expect(result.listing.find(({ source }) => source.endsWith("/receipts-v2.json"))).toMatchObject({
    outcome: "mapped", records: [result.records[0]!.reference], reason: expect.stringContaining(orphanReceipt.requestId),
  });
  expect(result.listing.map(({ source }) => source).sort()).toEqual(input.gate.map(({ path }) => path).sort());
  await assertReviewMapping(result);
});


it("keeps source fallback and local retry chronology within one logical pass", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude("failed");
  const { createHostedHandleFixture } = await import("../../../../../fixtures/hosted-review.js");
  const { recordHostedRequestAdmission, recordHostedRequestConclusion } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const handle = createHostedHandleFixture({ lineage: fixture.state.lineage });
  const decision = await recordHostedRequestAdmission(fixture.dependencies.operationStore, {
    repositoryId: fixture.state.repositoryId, lineage: fixture.state.lineage,
    request: { schemaVersion: 1, target: handle.target, provider: handle.provider, coverage: "complete" },
    reviewTarget: handle.admission.reviewTarget, requirement: handle.admission.requirement,
    actorIdentity: handle.admission.actorIdentity, authorizeCapacity: async () => undefined, now: fixture.dependencies.now(),
  });
  if (decision.state !== "admitted") throw new Error("Expected hosted fallback admission");
  await recordHostedRequestConclusion(fixture.dependencies.operationStore, { admission: decision.admission,
    result: { schemaVersion: 1, mode: "review-hosted-request", state: "rate-limited", nextAction: "try-next-source",
      provider: handle.provider, requestedCoverage: "complete", attemptedProviders: [handle.provider] }, now: fixture.dependencies.now() });
  const retry = await fixture.prepare();
  await fixture.conclude("clean", retry);
  const result = mapReviewRecords(fixture.input());
  const outcomes = result.records.map(({ contents }) => ReviewOutcomeSchema.parse(JSON.parse(contents[0]!)));
  expect(outcomes.map(({ outcome, source, retryGeneration }) => [outcome, source.sourceId, retryGeneration])).toEqual([
    ["terminal-failure", "delegated-agent", 0], ["rate-limited", handle.provider, 0], ["clean", "delegated-agent", 1],
  ]);
  const end = Date.parse(fixture.laneProgress()!.updatedAt);
  expect(outcomes.map(({ endedAt }) => Date.parse(endedAt))).toEqual([end - 2, end - 1, end]);
  await assertReviewMapping(result);
});


it("leaves publisher locks in record directories behind as working state", async () => {
  const input = { projectId: "repo-1", workItems: [], candidates: [], gate: [
    { path: "arc/review-gate/operations/.write.lock", bytes: new TextEncoder().encode("lock bytes") },
    { path: "arc/review-gate/outcomes/.write.lock", bytes: new TextEncoder().encode("lock bytes") },
  ] };
  const result = mapReviewRecords(input);
  expect(result.records).toEqual([]);
  expect(result.listing).toEqual(input.gate.map(({ path }) => ({ source: path, outcome: "left-behind", records: [],
    reason: expect.stringMatching(/working state|lock/iu) })));
});
