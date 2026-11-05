/** A repair inventories every complete approved branch before selecting authority. */
import { expect, it } from "vitest";
import { ReviewEvidenceRootSelectionSchema } from "../../../../../../src/lib/store/kinds/review/evidence-root-selection/schema.js";
import { OwnerIdentitySchema } from "../../../../../../src/lib/store/identity.js";
import { reviewEvidenceFixture } from "../../../../../fixtures/review-evidence.js";
import { ReviewOutcomeSchema } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { localOutcome } from "../../../../../fixtures/review-outcome.js";
import { reviewEvidenceBranches } from "../../../../../../src/lib/store/kinds/review/evidence-root-selection/lineage.js";
import { selectReviewEvidenceBranch } from "../../../../../../src/lib/store/kinds/review/evidence-root-selection/selection.js";
import { createDispositionSet, approveDispositionSet } from "../../../../../../src/scripts/review-gate/core/dispositions.js";
import { ReviewEvidenceSchema } from "../../../../../../src/lib/store/kinds/review/evidence/schema.js";

const outcome = ReviewOutcomeSchema.parse(localOutcome({ outcome: "findings", findings: [{ findingId: "finding-1", severity: "major",
  locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));

it("partitions independent valid approvals without fabricating succession", () => {
  const fix = reviewEvidenceFixture(outcome, "fix"), defer = reviewEvidenceFixture(outcome, "defer");
  const branches = reviewEvidenceBranches(outcome, [fix, defer]);
  expect(branches).toHaveLength(2);
  expect(branches).toEqual(expect.arrayContaining([[fix], [defer]]));
  expect(branches.flat()).toHaveLength(2);
});

it("uses an exact attributed root choice while preserving the other approved branch", () => {
  const fix = reviewEvidenceFixture(outcome, "fix"), defer = reviewEvidenceFixture(outcome, "defer");
  const evidence = [fix, defer];
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "123e4567-e89b-42d3-a456-426614174000" });
  const selection = { schemaVersion: 1 as const, producerId: outcome.attemptId, ...fix.result,
    roots: evidence.map(value => value.dispositionSet.dispositionSetId).sort(), selectedRoot: fix.dispositionSet.dispositionSetId,
    decidedBy: "andrew", decidedAt: "2026-11-03T10:00:00Z", reason: "Continue the fix." };
  expect(selectReviewEvidenceBranch(owner, outcome, evidence, selection)).toEqual([fix]);
  expect(evidence).toEqual([fix, defer]);
});

it("refuses a stale inventory, changed binding, or any excluded settlement", () => {
  const fix = reviewEvidenceFixture(outcome, "fix"), defer = reviewEvidenceFixture(outcome, "defer");
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "123e4567-e89b-42d3-a456-426614174000" });
  const selection = { schemaVersion: 1 as const, producerId: outcome.attemptId, ...fix.result,
    roots: [fix, defer].map(value => value.dispositionSet.dispositionSetId).sort(), selectedRoot: fix.dispositionSet.dispositionSetId,
    decidedBy: "andrew", decidedAt: "2026-11-03T10:00:00Z", reason: "Continue the fix." };
  const cases = [
    { evidence: [fix], selection, rule: "inventory" },
    { evidence: [fix, defer], selection: { ...selection, resultDigest: "sha256:" + "0".repeat(64) }, rule: "binding" },
    { evidence: [fix, { ...defer, settlement: { findingActions: [], evidence: [] } }], selection, rule: "policy" },
  ];
  for (const entry of cases) {
    try { selectReviewEvidenceBranch(owner, outcome, entry.evidence, ReviewEvidenceRootSelectionSchema.parse(entry.selection)); throw new Error("expected refusal"); }
    catch (error) { expect(error).toMatchObject({ refusal: { code: "record-malformed",
      rule: `review.evidence-root-selection.${entry.rule}` } }); }
  }
});

it("protects performed work at a successor while permitting selection of that complete branch", () => {
  const fix = reviewEvidenceFixture(outcome, "fix"), defer = reviewEvidenceFixture(outcome, "defer");
  const { dispositionSetId: ignored, ...identity } = defer.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...identity, proposedBy: "successor-proposer" });
  const child = ReviewEvidenceSchema.parse({ ...defer, dispositionSet, approval: approveDispositionSet({ dispositionSet,
    approvedBy: "andrew", approvedAt: "2026-11-03T10:01:00Z" }), predecessorDispositionSetId: defer.dispositionSet.dispositionSetId,
    performance: { schemaVersion: 1, producerId: outcome.attemptId, dispositionSetId: dispositionSet.dispositionSetId,
      originatingHeadSha: outcome.target.headSha, producedHeadSha: outcome.target.headSha, performedAt: "2026-11-03T10:02:00Z" } });
  const parent = ReviewEvidenceSchema.parse({ ...defer, successorDispositionSetId: dispositionSet.dispositionSetId });
  const evidence = [fix, parent, child];
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "123e4567-e89b-42d3-a456-426614174000" });
  const selection = ReviewEvidenceRootSelectionSchema.parse({ schemaVersion: 1, producerId: outcome.attemptId, ...fix.result,
    roots: [fix, parent].map(value => value.dispositionSet.dispositionSetId).sort(), selectedRoot: fix.dispositionSet.dispositionSetId,
    decidedBy: "andrew", decidedAt: "2026-11-03T10:03:00Z", reason: "Continue this explicit branch." });
  expect(() => selectReviewEvidenceBranch(owner, outcome, evidence, selection)).toThrow("excludes performed or settled work");
  expect(selectReviewEvidenceBranch(owner, outcome, evidence, { ...selection, selectedRoot: parent.dispositionSet.dispositionSetId }))
    .toEqual([parent, child]);
});
