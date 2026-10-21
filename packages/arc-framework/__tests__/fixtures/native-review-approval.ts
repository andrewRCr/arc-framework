/** Real native review producers and approval inputs for response publication tests. */
import type { LaneSubjectLineage } from "../../src/scripts/review-gate/core/lane-admission.js";
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { localOutcome, frontlineOutcome, hostedOutcome } from "./review-outcome.js";
import { createHostedHandleFixture } from "./hosted-review.js";
import { reviewEvidenceFixture } from "./review-evidence.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";

export async function createNativeReviewApprovalFixture(kind: "local" | "frontline" | "hosted", disposition: "defer" | "fix" = "defer", lineage?: LaneSubjectLineage, frontlineMaxPasses = 2) {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const findings = [{ findingId: "finding-1", severity: "major" as const, locus: "src/example.ts:1",
    evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }];
  const outcome = ReviewOutcomeSchema.parse(kind === "local" ? localOutcome({ target, lineage, outcome: "findings", findings,
    vehicle: { kind: "work-unit", identity: "example" } }) : kind === "frontline" ? frontlineOutcome({ target, findings, lineage, maxPasses: frontlineMaxPasses })
    : hostedOutcome({ repositoryId: projectId, lineage, outcome: "findings", findings: [{ findingId: "finding-1", severity: "major",
      origin: "review-thread", threadId: "thread-1", commentId: "comment-1", settlement: "reply-and-resolve",
      sourceOrdinal: 1, locus: "src/example.ts:1", url: "https://example.invalid/thread-1" }, {
      findingId: "finding-2", severity: "minor", origin: "review-body", reviewId: "review-1", fingerprint: "body-1",
      settlement: "not-applicable", sourceOrdinal: 2, locus: "src/example.ts:2", url: "https://example.invalid/review-1", body: "A finding." }] }));
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner), evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  await outcomes.create(outcome);
  const approved = reviewEvidenceFixture(outcome, disposition);
  const record = composeReviewDispositionRecord(outcome, [approved], primary.reference.owner);
  return { h, primary, outcome, approved, input: { record, outcomes, evidence, readProjectId: h.projectId,
    now: () => "2026-10-20T12:01:00Z" } };
}
