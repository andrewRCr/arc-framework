import { describe, expect, it } from "vitest";
import { createReviewOutcomePort } from "../../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { createLifecycleHarness } from "../../../../../../helpers/store/lifecycle-harness.js";
import { localOutcome, frontlineOutcome } from "../../../../../../fixtures/review-outcome.js";
import { canonicalDigest } from "../../../../../../../src/lib/kernel/index.js";

describe("work-item outcome access", () => {
  it("creates and reads the exact ended attempt through the supplied store", async () => {
    const harness = createLifecycleHarness();
    const meta = await harness.seedMeta("example");
    const port = createReviewOutcomePort(harness.store, meta.reference.owner);
    const outcome = ReviewOutcomeSchema.parse(localOutcome());
    const created = await port.create(outcome);
    expect(created.value).toEqual(outcome);
    expect(await port.read(reviewOutcomeKey(outcome))).toEqual(created);
    const stored = await harness.store.read({ reference: created.reference });
    expect(stored.status).toBe("ok");
    if (stored.status === "ok") expect(JSON.parse(stored.result.content)).toEqual(outcome);
  });

  it("lists only the bound work item's outcomes", async () => {
    const harness = createLifecycleHarness();
    const meta = await harness.seedMeta("example");
    const other = await harness.seedMeta("other");
    const port = createReviewOutcomePort(harness.store, meta.reference.owner);
    const outcome = ReviewOutcomeSchema.parse(localOutcome());
    await port.create(outcome);
    await createReviewOutcomePort(harness.store, other.reference.owner).create(outcome);
    await port.create(ReviewOutcomeSchema.parse(localOutcome({
      lineage: { kind: "candidate", candidateId: canonicalDigest({ candidate: "other" }) },
    })));
    await port.create(ReviewOutcomeSchema.parse(frontlineOutcome()));
    const all = await port.list();
    expect(all.status).toBe("complete");
    if (all.status === "complete") expect(all.records).toHaveLength(3);
  });

  it.each(["missed", "diagnostic"] as const)("reports an incomplete %s outcome selection", async (kind) => {
    const harness = createLifecycleHarness();
    const meta = await harness.seedMeta("example");
    const port = createReviewOutcomePort(harness.store, meta.reference.owner);
    await port.create(ReviewOutcomeSchema.parse(localOutcome()));
    const nativeList = harness.store.list.bind(harness.store);
    harness.store.list = async (input) => {
      const result = await nativeList(input);
      return result.status !== "ok" || result.result.status !== "complete" ? result : { status: "ok", result: {
        ...result.result, missed: kind === "missed", diagnostics: kind === "diagnostic" ? [{
          kind: "unreadable", key: "missing-attempt", condition: "Attempt bytes unavailable.",
          remedy: { text: "Restore the attempt." },
        }] : [],
      } };
    };
    expect(await port.list()).toEqual({ status: "incomplete",
      reason: expect.stringContaining("incomplete") });
  });

  it("retains an unavailable listing's remedy and succeeds after repair", async () => {
    const harness = createLifecycleHarness();
    const meta = await harness.seedMeta("example");
    const port = createReviewOutcomePort(harness.store, meta.reference.owner);
    const outcome = ReviewOutcomeSchema.parse(localOutcome());
    await port.create(outcome);
    harness.store.state.corrupt = true;
    expect(await port.list()).toEqual({ status: "unavailable",
      reason: expect.stringMatching(/structurally corrupt.*Rebuild the namespace index/u),
      refusal: expect.objectContaining({ code: "namespace-corrupt", class: "terminal" }) });
    harness.store.state.corrupt = false;
    const listing = await port.list();
    expect(listing.status).toBe("complete");
    if (listing.status === "complete") expect(listing.records.map(r => r.value)).toEqual([outcome]);
  });
});
