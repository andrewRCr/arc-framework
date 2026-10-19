/** Historical response headers remain addressable by their original approved set. */
import { expect, it } from "vitest";
import { createLocalMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { approvedRecord } from "../../../../../fixtures/review-response-proof.js";
import { recordLaneResponsePerformance } from "../../../../../../src/scripts/review-gate/lane-progress.js";
import { mapReviewEvidencePerformance } from "../../../../../../src/lib/store/kinds/review/mapping-evidence-performance.js";
import { indexReviewMappingSources } from "../../../../../../src/lib/store/kinds/review/mapping-sources.js";
import { collectReviewMappingSources } from "../../../../../../src/lib/store/kinds/review/mapping-listing.js";
import { ReviewEvidencePerformanceSchema } from "../../../../../../src/lib/store/kinds/review/evidence/schema.js";

it("joins a superseded header from the native lane history by its exact set identity", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const first = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const next = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "reject" }]);
  const node = first.approvedDispositionLineage[0]!;
  const firstId = node.approvedDisposition.dispositionSet.dispositionSetId;
  const nextId = next.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const context = { lane: "standard" as const, repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.admission.lineage, attemptId: producer.producerId, producedHeadSha: producer.target.headSha };
  await recordLaneResponsePerformance(fixture.dependencies.operationStore, { ...context, dispositionSetId: firstId,
    now: "2026-10-19T13:01:00Z" });
  const updated = await recordLaneResponsePerformance(fixture.dependencies.operationStore, { ...context, dispositionSetId: nextId,
    predecessorDispositionSetId: firstId, now: "2026-10-19T13:02:00Z" });
  expect(updated.attempts[0]!.responsePerformance?.dispositionSetId).toBe(nextId);
  const input = fixture.input();
  const sources = indexReviewMappingSources(collectReviewMappingSources(input), input.projectId);
  const performance = mapReviewEvidencePerformance(node, sources);
  expect(performance).toEqual(updated.attempts[0]!.responsePerformanceHistory![0]);
  expect(ReviewEvidencePerformanceSchema.parse(performance)).toMatchObject({ dispositionSetId: firstId,
    performedAt: "2026-10-19T13:01:00Z" });
});
