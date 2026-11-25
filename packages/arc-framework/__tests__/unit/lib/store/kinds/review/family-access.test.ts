import { describe, expect, it } from "vitest";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../../src/lib/store/kinds/review/evidence/access.js";
import { createReviewDecisionPort } from "../../../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewOutcomeKey } from "../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { reviewDecisionKey } from "../../../../../../src/lib/store/kinds/review/decision/key.js";
import { ReviewDecisionSchema } from "../../../../../../src/lib/store/kinds/review/decision/schema.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { performedEvidenceFixture, reviewEvidenceFixture } from "../../../../../fixtures/review-evidence.js";

describe("portable review fact writes", () => {
  it("joins outcome, evidence, and decision puts in the caller's atomic batch", async () => {
    const harness = createLifecycleHarness();
    const meta = await harness.seedMeta("example");
    const outcomes = createReviewOutcomePort(harness.store, meta.reference.owner);
    const evidence = createReviewEvidencePort(harness.store, meta.reference.owner);
    const decisions = createReviewDecisionPort(harness.store, meta.reference.owner);
    const { outcome } = performedEvidenceFixture();
    const approved = reviewEvidenceFixture(outcome, "defer");
    const decision = ReviewDecisionSchema.parse({ schemaVersion: 1,
      subject: { lineage: outcome.lineage, headSha: null, subjectDigest: null }, lane: "frontline",
      choice: { kind: "lane-skip" }, decidedBy: null, decidedAt: null, basis: null });
    lifecycleSuccess(await harness.store.batch({ writes: [outcomes.prepareCreate(outcome),
      evidence.prepareCreate(approved), decisions.prepareCreate(decision)],
    provenance: { verb: "review", lifecycleAction: "edit" } }));
    expect((await outcomes.read(reviewOutcomeKey(outcome)))?.value).toEqual(outcome);
    expect((await evidence.read(approved.dispositionSet.dispositionSetId))?.value).toEqual(approved);
    expect((await decisions.read(reviewDecisionKey(decision)))?.value).toEqual(decision);
  });

  it("advances evidence at its opaque version while preserving the original approval", async () => {
    const harness = createLifecycleHarness();
    const meta = await harness.seedMeta("example");
    const outcomes = createReviewOutcomePort(harness.store, meta.reference.owner);
    const evidence = createReviewEvidencePort(harness.store, meta.reference.owner);
    const { outcome, value } = performedEvidenceFixture();
    await outcomes.create(outcome);
    const prior = await evidence.create({ ...value, performance: undefined });
    const next = await evidence.advance(value, prior.version);
    expect(next.version).not.toBe(prior.version);
    expect((await evidence.read(value.dispositionSet.dispositionSetId))?.value).toEqual(value);
    expect(next.value.approval).toEqual(prior.value.approval);
  });
});
