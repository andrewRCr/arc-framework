/** A native store's version conflict retries through the review gate's optimistic-write loops. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { localOutcome } from "../../../../fixtures/review-outcome.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { retryLaneOwnerConflicts } from "../../../../../src/scripts/review-gate/runtime/local-prepare-retry.js";

it("retries a native outcome write that loses its race to a concurrent writer, and settles on the stored outcome", async () => {
  const h = createReviewHarness(), candidate = candidateFixture(), primary = await h.seedMeta("example");
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId },
    vehicle: { kind: "work-unit", identity: "example" }, outcome: "clean", findings: [] }));
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
  const concurrent = await outcomes.create(outcome);
  const settled = await retryLaneOwnerConflicts(async attempt => {
    if (attempt === 0) return outcomes.create(outcome);
    const stored = await outcomes.read(reviewOutcomeKey(outcome));
    if (stored === null) throw new Error("Expected the concurrent writer's outcome");
    return stored;
  });
  expect(settled).toMatchObject({ version: concurrent.version, value: { attemptId: outcome.attemptId, outcome: "clean" } });
});
