/** Facts derive from durable looks and approved responses without prescribing another pass. */
import { expect, it } from "vitest";
import { approvedRecord } from "../../../../fixtures/review-response-proof.js";
import { ApprovedDispositionRecordSchema, currentApprovedDispositionNode } from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import { approveDispositionState, createDispositionSet, proposeDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { recordLaneResponsePerformance } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { deriveReviewNextPassContext } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { scriptRawGitExec } from "../../../../helpers/git-exec-fake.js";
import { createLocalDeltaFixture, linearReviewRangeProof } from "../../../../fixtures/local-review-delta.js";
import type { LaneProgressState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { deriveNextPassFacts, NextPassFactsSchema } from "../../../../../src/scripts/review-gate/policy/next-pass-facts.js";
import { projectProvisionalPassAssessment } from "../../../../../src/scripts/review-gate/runtime/provisional-pass-assessment.js";
import { readProposedResponseReport } from "../../../../../src/scripts/review-gate/runtime/response-report.js";

async function laneWithDelta(outcome: "clean" | "findings" = "clean") {
  const fixture = await createLocalDeltaFixture("Light");
  const delta = await fixture.moveHead();
  await fixture.conclude(delta, outcome);
  const progress = (): LaneProgressState[] => [...fixture.operations.values()].map(({ state }) => state)
    .filter((state): state is LaneProgressState => state.kind === "lane-progress");
  return { ...fixture, delta, progress };
}

it("counts complete looks and the fix checks since the last one from lane progress", async () => {
  const fixture = await laneWithDelta();
  const facts = await deriveNextPassFacts({ progress: fixture.progress(), dispositions: [],
    nextPassContext: { completePasses: 1, convergence: "converged", responseDue: false, incremental: null },
    target: fixture.currentTarget(), ceiling: 4,
    exec: async () => { throw new Error("Git statistics unavailable"); } });
  expect(NextPassFactsSchema.parse(facts)).toMatchObject({ completePasses: 1, ceiling: 4,
    fixChecksSinceLastComplete: [{ producerId: fixture.delta.operationId, logicalPass: 2,
      coverage: "fix-check", outcome: "clean" }] });
});

it("labels clean and findings looks and marks the proposed material count provisional", async () => {
  const fixture = await laneWithDelta("findings");
  const producer = await fixture.resultReader.readResult(fixture.delta.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const { dispositionSetId, ...fields } = currentApprovedDispositionNode(record).approvedDisposition.dispositionSet;
  void dispositionSetId;
  const proposed = proposeDispositionSet(createDispositionSet({ ...fields,
    findings: fields.findings.map(finding => ({ ...finding, sourceVerification: "verified" as const,
      verifiedSeverity: "minor" as const, disposition: "defer" as const })) }));
  const facts = await deriveNextPassFacts({ progress: fixture.progress(), dispositions: [record], proposed,
    nextPassContext: { completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null },
    target: fixture.currentTarget(), ceiling: 4, exec: async () => { throw new Error("Git unavailable"); } });
  expect(facts.materialTrend).toMatchObject([
    { producerId: fixture.original.operationId, coverage: "complete", outcome: "clean", materialCount: 0, provisional: false },
    { producerId: producer.producerId, coverage: "fix-check", outcome: "findings", materialCount: 1, provisional: false },
    { producerId: producer.producerId, coverage: "fix-check", outcome: "findings", materialCount: 0, provisional: true },
  ]);
});

it.each([true, false])("reports the proven chain and its range against the target: admitted=%s", async admitted => {
  const fixture = await laneWithDelta();
  const root = await fixture.resultReader.readResult(fixture.original.operationId);
  if (root.kind === "frontline") throw new Error("expected standard review");
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = root.requirement;
  const nextPassContext = await deriveReviewNextPassContext({ completePasses: 1, completedPasses: root.admission.logicalPass, predecessor: root, currentTarget: fixture.currentTarget(),
    currentLineage: root.admission.lineage, standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    resultReader: fixture.resultReader, dispositionStore: { readDispositionRecord: async () => null,
      appendDispositionRecord: async () => { throw new Error("Read-only context"); } }, readResponsePerformance: async () => null,
    rangeProof: linearReviewRangeProof(root.target.headSha, fixture.currentTarget().headSha),
    deltaAdmission: { sources: admitted ? ["delegated-agent"] : [], surface: "ordinary" } });
  const targetRange = `${root.target.diffBaseSha}..${fixture.currentTarget().headSha}`;
  const fixRange = `${root.target.headSha}..${fixture.currentTarget().headSha}`;
  const exec = scriptRawGitExec([
    { match: { predicate: args => args.includes("--numstat") && args.includes(targetRange) },
      responses: [{ stdout: Buffer.from("10\t2\tsrc/example.ts\0") }] },
    { match: { predicate: args => args.includes("--numstat") && args.includes(fixRange) },
      responses: [{ stdout: Buffer.from("1\t1\tsrc/example.ts\0") }] },
  ]).exec;
  const facts = await deriveNextPassFacts({ progress: fixture.progress(), dispositions: [], nextPassContext,
    target: fixture.currentTarget(), ceiling: 4, exec });
  expect(facts).toMatchObject({ chainProven: admitted,
    rangeSize: { target: { kind: "known", metrics: { files: 1, lines: 12 } },
      fix: admitted ? { kind: "known", metrics: { files: 1, lines: 2 } } : null } });
});

it.each([
  { status: "M", path: "src/example.ts", outside: false, added: false },
  { status: "M", path: "src/other.ts", outside: true, added: false },
  { status: "A", path: "src/other.ts", outside: true, added: true },
  { status: "unavailable", path: "src/other.ts", outside: null, added: null },
])("reports each performed round's observable design signals: $status $path", async scenario => {
  const fixture = await laneWithDelta("findings");
  const producer = await fixture.resultReader.readResult(fixture.delta.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const producedHeadSha = "f".repeat(40);
  await recordLaneResponsePerformance(fixture.dependencies.operationStore, { lane: "standard",
    repositoryId: producer.repositoryId, headSha: producer.target.headSha, lineage: producer.admission.lineage,
    attemptId: producer.producerId, dispositionSetId: record.currentDispositionSetId, producedHeadSha,
    now: "2026-10-18T00:00:00Z" });
  const oldMode = scenario.status === "A" ? "000000" : "100644";
  const oldObject = (scenario.status === "A" ? "0" : "1").repeat(40);
  const exec = scriptRawGitExec([{ match: { prefix: ["diff", "--raw"] }, responses: [
    scenario.status === "unavailable" ? { failure: { exitCode: 1 } }
      : { stdout: Buffer.from(`:${oldMode} 100644 ${oldObject} ${"2".repeat(40)} ${scenario.status}\0${scenario.path}\0`) },
  ] }]).exec;
  const facts = await deriveNextPassFacts({ progress: fixture.progress(), dispositions: [record],
    nextPassContext: { completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null },
    target: fixture.currentTarget(), ceiling: 4, exec });
  expect(facts.fixRounds).toMatchObject([{ producerId: producer.producerId, dispositionSetId: record.currentDispositionSetId,
    originatingHeadSha: producer.target.headSha, producedHeadSha,
    outsideCitedLoci: scenario.outside, addedFiles: scenario.added }]);
  expect(facts.rangeSize.target).toMatchObject({ kind: "unknown" });
});

it("joins each historical response round to its own approved set", async () => {
  const fixture = await laneWithDelta("findings");
  const producer = await fixture.resultReader.readResult(fixture.delta.operationId);
  const first = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const original = { ...currentApprovedDispositionNode(first),
    advisoryFixTags: [{ findingId: "finding-1", tag: "local-correction" as const }] };
  const { dispositionSetId, ...fields } = original.approvedDisposition.dispositionSet;
  const successor = approveDispositionState({ proposed: proposeDispositionSet(createDispositionSet({ ...fields,
    findings: fields.findings.map(finding => ({ ...finding, sourceVerification: "verified" as const,
      verifiedSeverity: "major" as const, disposition: "defer" as const })) })),
    approvedBy: "andrew", approvedAt: "2026-10-18T01:00:00Z" });
  const successorId = successor.dispositionSet.dispositionSetId;
  const record = ApprovedDispositionRecordSchema.parse({ ...first, currentDispositionSetId: successorId,
    approvedDispositionLineage: [{ ...original, successorDispositionSetId: successorId },
      { ...original, approvedDisposition: successor, advisoryFixTags: [], predecessorDispositionSetId: dispositionSetId }] });
  const response = { lane: "standard" as const, repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.admission.lineage, attemptId: producer.producerId, producedHeadSha: "f".repeat(40),
    now: "2026-10-18T02:00:00Z" };
  await recordLaneResponsePerformance(fixture.dependencies.operationStore, { ...response, dispositionSetId });
  await recordLaneResponsePerformance(fixture.dependencies.operationStore,
    { ...response, dispositionSetId: successorId, predecessorDispositionSetId: dispositionSetId });
  const exec = scriptRawGitExec([{ match: { prefix: ["diff", "--raw"] }, responses: [{ stdout: Buffer.from(
    `:100644 100644 ${"1".repeat(40)} ${"2".repeat(40)} M\0src/example.ts\0`) }] }]).exec;
  const facts = await deriveNextPassFacts({ progress: fixture.progress(), dispositions: [record],
    nextPassContext: { completePasses: 1, convergence: "converged", responseDue: false, incremental: null },
    target: fixture.currentTarget(), ceiling: 4, exec });
  expect(facts.fixRounds).toMatchObject([
    { dispositionSetId, outsideCitedLoci: false, addedFiles: false },
    { dispositionSetId: successorId, outsideCitedLoci: true, addedFiles: false },
  ]);
  const proposal = proposeDispositionSet(currentApprovedDispositionNode(record).approvedDisposition.dispositionSet);
  const standardFacts = { facts, chainAdequate: true, delegatedAgentSelectable: true };
  const assessment = projectProvisionalPassAssessment({ proposal, result: producer, lane: "standard",
    admittedLogicalPass: producer.admission.logicalPass, configuredMaxPasses: 4, standardFacts });
  const report = await readProposedResponseReport({ proposal, producerFindings: producer.findings,
    assessment, standardFacts, hosted: false, readRecord: async id => id === producer.producerId ? record : null,
    report: { tags: [], fails: [{ findingId: "finding-1", fails: "Correctness and failure behavior" }],
      successorRecommendation: "Stop after the approved response.", origin: [],
      reading: { kind: "converging", rationale: "The latest response defers the remaining finding." } },
  });
  expect(report.dispositionReportText).toContain("Round 1 observed signals: paths outside cited loci no, "
    + "added files no; stored forecast tags (advisory): 0 new design, 1 local correction.");
  expect(report.dispositionReportText).toContain("Round 2 observed signals: paths outside cited loci yes, "
    + "added files no; stored forecast tags (advisory): 0 new design, 0 local correction.");
});

it("resets fix-check rounds when a later complete look concludes", async () => {
  const fixture = await createLocalDeltaFixture("Light", 4);
  const delta = await fixture.moveHead(); await fixture.conclude(delta, "clean");
  const complete = await fixture.moveHead("f", { requestedCoverage: "complete" });
  await fixture.conclude(complete, "clean");
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const facts = await deriveNextPassFacts({ progress: [owner], dispositions: [],
    nextPassContext: { completePasses: 2, convergence: "converged", responseDue: false, incremental: null },
    target: fixture.currentTarget(), ceiling: 4, exec: async () => { throw new Error("Git unavailable"); } });
  expect(facts).toMatchObject({ completePasses: 2, fixChecksSinceLastComplete: [] });
});

it.each(["critical", "unsupported"] as const)("counts the verified grade rather than the reported one: %s", async grade => {
  const fixture = await laneWithDelta("findings");
  const producer = await fixture.resultReader.readResult(fixture.delta.operationId);
  const record = approvedRecord(producer, [grade === "unsupported"
    ? { sourceVerification: "not-supported", verifiedSeverity: null, disposition: "reject" }
    : { sourceVerification: "verified", verifiedSeverity: "critical", disposition: "fix" }]);
  const facts = await deriveNextPassFacts({ progress: fixture.progress(), dispositions: [record],
    nextPassContext: { completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null },
    target: fixture.currentTarget(), ceiling: 4, exec: async () => { throw new Error("Git unavailable"); } });
  expect(facts.materialTrend.at(-1)).toMatchObject({ producerId: producer.producerId,
    materialCount: grade === "critical" ? 1 : 0, provisional: false });
});
