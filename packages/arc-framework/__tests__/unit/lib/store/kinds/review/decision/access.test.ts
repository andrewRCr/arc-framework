/** Create-only decisions settle a concurrent identical write as already recorded. */
import { expect, it } from "vitest";
import { createReviewDecisionPort } from "../../../../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../../../../src/lib/store/kinds/review/decision/key.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../../../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../../../../../helpers/store/model.js";
import { extraPassDecision } from "../../../../../../fixtures/review-decision.js";

it("returns the decision a concurrent writer recorded first rather than its version conflict", async () => {
  const h = createLifecycleHarness();
  const owner = (await h.seedMeta("demo")).reference.owner;
  const first = createReviewDecisionPort(h.store, owner), second = createReviewDecisionPort(h.store, owner);
  const value = extraPassDecision();
  // Both writers found no decision before either created one; the earlier one wins the record.
  const recorded = await first.create(value);
  const version = lifecycleSuccess(await h.store.version());
  const settled = await second.create({ ...value, decidedAt: "2026-10-19T14:00:00Z" });
  expect(settled).toEqual(recorded);
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  expect(await second.read(reviewDecisionKey(value))).toEqual(recorded);
});

it("reports the stored decision's read refusal when the record it conflicted with cannot be read", async () => {
  const h = createLifecycleHarness();
  const owner = (await h.seedMeta("demo")).reference.owner;
  const port = createReviewDecisionPort(h.store, owner);
  const recorded = await port.create(extraPassDecision());
  const stored = h.store.state.records.get(recordKey(recorded.reference));
  if (stored === undefined) throw new Error("Expected the persisted decision");
  stored.formatVersion += 1;
  await expect(port.create(extraPassDecision())).rejects.toThrow(/newer than this build supports/u);
  stored.formatVersion -= 1;
  expect(await port.create(extraPassDecision())).toEqual(recorded);
});
