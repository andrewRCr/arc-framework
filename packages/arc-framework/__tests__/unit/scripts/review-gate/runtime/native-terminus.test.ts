/** Native terminus listing failures retain their repair route and recorded provenance. */
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { projectPublicationBoundary, recoverAttestedOwnerTerminusBoundary } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
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


it.each(["withdrawal", "original-successor", "current-successor"] as const)("keeps a carried terminus subject to %s and repairs with current authority", async condition => {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
  const original = await decisions.create(terminusDecision()), key = reviewDecisionKey(original.value);
  if (original.value.subject.lineage.kind !== "candidate") throw new Error("Expected Candidate terminus");
  const current = { ...original.value.subject, lineage: original.value.subject.lineage, subjectDigest: canonicalDigest({ laterSubject: true }) };
  const published = projectPublicationBoundary({ workUnit: "example", branch: "feat/example",
    candidateId: current.lineage.candidateId, candidateSubjectDigest: original.value.subject.subjectDigest,
    reservation: null, changeRequest: null, terminus: key, readinessBinding: null }, 2);
  const boundary = recoverAttestedOwnerTerminusBoundary({ stored: published, workUnit: "example",
    candidateId: current.lineage.candidateId, candidateSubjectDigest: current.subjectDigest, repairCurrent: true });
  if (boundary?.schemaVersion !== 2) throw new Error("Expected recovered native boundary");
  const input = { facts: { decisions }, subject: current, decisionKey: key, carriedBoundary: boundary };
  expect(await resolveNativeReviewTerminus({ facts: { decisions }, subject: current })).toBeUndefined();
  expect(await resolveNativeReviewTerminus(input)).toMatchObject({ decisionKey: key, acceptedBy: "andrew", completedPasses: 2 });
  if (condition === "withdrawal") await decisions.create({ ...original.value, basis: null,
    choice: { kind: "withdrawal", decisionKey: key } });
  else await decisions.create({ ...original.value, subject: condition === "current-successor" ? current : original.value.subject,
    decidedBy: "later-owner", decidedAt: "2026-10-20T16:00:00Z" });
  await expect(resolveNativeReviewTerminus(input)).rejects.toThrow(/terminus reference.*retry/i);
  const repaired = await decisions.create({ ...original.value, subject: current,
    decidedBy: "current-owner", decidedAt: "2026-10-20T17:00:00Z" });
  const repairedKey = reviewDecisionKey(repaired.value), before = await h.store.version();
  expect(await resolveNativeReviewTerminus({ ...input, decisionKey: repairedKey,
    carriedBoundary: { ...boundary, terminus: repairedKey } })).toMatchObject({ decisionKey: repairedKey,
    acceptedBy: "current-owner", completedPasses: 2 });
  expect(await h.store.version()).toEqual(before);
});
