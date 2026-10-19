/** Every imported kind participates in one production-validated proposed record set. */
import { expect, it } from "vitest";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { captureConditionalNextPassAuthorization } from "../../../../../../src/scripts/review-gate/lane-progress-conditional.js";
import { ApprovedDispositionRecordSchema } from "../../../../../../src/scripts/review-gate/core/advisory-records.js";
import { mappingBoundaryFixture } from "../../../../../fixtures/review-mapping-boundary.js";
import { createLocalMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { approvedRecord } from "../../../../../fixtures/review-response-proof.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";

it("admits the complete mapped Candidate, boundary, producer, approval, and grant through the production registry", async () => {
  const { input: base, boundary } = mappingBoundaryFixture("candidate-fix-pending");
  const fixture = await createLocalMappingFixture({ imported: base,
    lineage: { kind: "candidate", candidateId: boundary.candidateId }, vehicle: { kind: "work-unit", identity: "example" } });
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const approval = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const record = ApprovedDispositionRecordSchema.parse({ ...approval, candidate: { workUnit: "example", candidateId: boundary.candidateId } });
  const dispositionSetId = record.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  await captureConditionalNextPassAuthorization(fixture.dependencies.operationStore, { lane: "standard", repositoryId: producer.repositoryId,
    headSha: producer.target.headSha, lineage: producer.admission.lineage, producerId: producer.producerId,
    dispositionSetId, authorizedBy: "andrew", exhaustedPassCount: 1, nextPass: 2, now: "2026-10-19T13:04:00Z" });
  const input = fixture.input();
  input.gate.push({ path: "arc/review-gate/evidence/disposition-candidate.json", bytes: new TextEncoder().encode(JSON.stringify(record)) });
  const result = mapReviewRecords(input);
  expect(result.records.map(({ reference }) => reference.kind).sort()).toEqual([
    "review/candidate", "review/decision", "review/evidence", "review/integration-boundary", "review/outcome",
  ]);
  await assertReviewMapping(result);
});
