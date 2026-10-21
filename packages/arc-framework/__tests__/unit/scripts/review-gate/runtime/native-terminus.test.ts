/** Native terminus listing failures retain their repair route and recorded provenance. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { terminusDecision } from "../../../../fixtures/review-decision.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { resolveNativeReviewTerminus } from "../../../../../src/scripts/review-gate/runtime/native-terminus.js";

it.each(["incomplete", "unavailable"] as const)("retains a %s listing remedy and resolves after repair without another write", async status => {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
  const recorded = await decisions.create({ ...terminusDecision(), decidedBy: null });
  const decisionKey = reviewDecisionKey(recorded.value);
  const reason = "Restore the selected review facts and resolve their conflicts, then retry.";
  const input = { subject: recorded.value.subject, decisionKey };
  await expect(resolveNativeReviewTerminus({ ...input, facts: { decisions: { ...decisions,
    list: async () => ({ status, reason }) } } })).rejects.toThrow(reason);
  const before = await h.store.version();
  expect(await resolveNativeReviewTerminus({ ...input, facts: { decisions } })).toEqual({
    schemaVersion: 2, semanticsVersion: "review-terminus/v2", kind: "owner-accepted", lane: "standard",
    decisionKey, acceptedBy: null, completedPasses: 2 });
  expect(await decisions.read(decisionKey)).toEqual(recorded);
  expect(await h.store.version()).toEqual(before);
});

it("keeps earlier termini superseded when the newest decision is withdrawn, then admits a fresh live decision", async () => {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
  const earlier = await decisions.create({ ...terminusDecision(), decidedAt: "2026-10-20T15:00:00Z" });
  const latest = await decisions.create({ ...earlier.value, decidedBy: "later-owner", decidedAt: "2026-10-20T16:00:00Z" });
  await decisions.create({ ...latest.value, basis: null,
    choice: { kind: "withdrawal", decisionKey: reviewDecisionKey(latest.value) } });
  const input = { facts: { decisions }, subject: latest.value.subject };
  expect(await resolveNativeReviewTerminus(input)).toBeUndefined();
  await expect(resolveNativeReviewTerminus({ ...input, decisionKey: reviewDecisionKey(earlier.value) }))
    .rejects.toThrow(/terminus reference.*superseded/i);
  const repaired = await decisions.create({ ...latest.value, decidedBy: "current-owner", decidedAt: "2026-10-20T17:00:00Z" });
  expect(await resolveNativeReviewTerminus(input)).toMatchObject({ decisionKey: reviewDecisionKey(repaired.value),
    acceptedBy: "current-owner", completedPasses: 2 });
});
