import { describe, expect, it } from "vitest";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeIsSettled } from "../../../../../../../src/lib/store/kinds/review/outcome/settlement.js";
import { localOutcome, frontlineOutcome, hostedOutcome } from "../../../../../../fixtures/review-outcome.js";
import { HostedSettlementEvidenceSchema } from "../../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { outcomeEvidence } from "../../../../../../fixtures/review-outcome-evidence.js";

const finding = { findingId: "finding-1", severity: "major" as const, locus: "src/example.ts:1",
  evidenceUrlOrId: "finding:1", sourceOrdinal: 1 };

describe("stored outcome settlement", () => {
  it.each(["local", "frontline"])("settles %s findings when the exact current response is approved without a fix", (kind) => {
    const outcome = ReviewOutcomeSchema.parse(kind === "local" ? localOutcome({ outcome: "findings", findings: [finding] })
      : frontlineOutcome({ findings: [finding] }));
    expect(reviewOutcomeIsSettled(outcome, [outcomeEvidence(outcome)])).toBe(true);
  });
  it.each(["local", "frontline"])("keeps %s fixes unsettled until matching performance exists", (kind) => {
    const outcome = ReviewOutcomeSchema.parse(kind === "local" ? localOutcome({ outcome: "findings", findings: [finding] })
      : frontlineOutcome({ findings: [finding] }));
    const evidence = outcomeEvidence(outcome, "fix");
    expect(reviewOutcomeIsSettled(outcome, [evidence])).toBe(false);
    const performance = { schemaVersion: 1 as const, producerId: outcome.attemptId,
      dispositionSetId: evidence.dispositionSet.dispositionSetId, originatingHeadSha: outcome.target.headSha,
      producedHeadSha: "e".repeat(40), performedAt: "2026-10-19T13:01:00Z" };
    expect(reviewOutcomeIsSettled(outcome, [{ ...evidence, performance }])).toBe(true);
  });
  it.each(["defer", "fix"] as const)("settles a hosted %s only after every sealed finding is covered", (disposition) => {
    const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ outcome: "findings", findings: [1, 2].map((ordinal) => ({
      findingId: `finding-${ordinal}`, sourceOrdinal: ordinal, severity: "major", origin: "review-body",
      reviewId: "review-1", fingerprint: `finding-${ordinal}`, settlement: "not-applicable", locus: `src/main.ts:${ordinal}`,
      url: "https://example.invalid/review", body: "The review-body finding is retained without a host reply.",
    })) }));
    const evidence = outcomeEvidence(outcome, disposition);
    const performance = { schemaVersion: 1 as const, producerId: outcome.attemptId,
      dispositionSetId: evidence.dispositionSet.dispositionSetId, originatingHeadSha: outcome.target.headSha,
      producedHeadSha: "e".repeat(40), performedAt: "2026-10-19T13:01:00Z" };
    const entries = outcome.findings.map(({ findingId }) => HostedSettlementEvidenceSchema.parse({
      findingId, dispositionSetId: evidence.dispositionSet.dispositionSetId, disposition, channelAction: "record-only",
      performedAt: "2026-10-19T13:02:00Z", carriedFromDispositionSetId: null,
    }));
    expect(reviewOutcomeIsSettled(outcome, [{ ...evidence, performance }])).toBe(false);
    expect(reviewOutcomeIsSettled(outcome, [{ ...evidence, performance, settlement: { evidence: entries.slice(0, 1) } }]))
      .toBe(false);
    expect(reviewOutcomeIsSettled(outcome, [{ ...evidence, performance, settlement: { evidence: entries } }])).toBe(true);
    if (disposition === "fix") {
      expect(reviewOutcomeIsSettled(outcome, [{ ...evidence, settlement: { evidence: entries } }])).toBe(false);
    }
  });
  it("requires the exact current producer response and approval", () => {
    const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ findings: [finding] }));
    const evidence = outcomeEvidence(outcome);
    const other = `sha256:${"f".repeat(64)}` as const;
    for (const changed of [
      { ...evidence, result: { ...evidence.result, outcomeKey: "another-outcome" } },
      { ...evidence, result: { ...evidence.result, resultDigest: other } },
      { ...evidence, successorDispositionSetId: other },
      { ...evidence, approval: { ...evidence.approval, dispositionSetId: other } },
      { ...evidence, approval: { ...evidence.approval, approvedBy: evidence.dispositionSet.proposedBy } },
    ]) expect(reviewOutcomeIsSettled(outcome, [changed])).toBe(false);
  });

  it.each(["clean", "stale-target", "terminal-failure"])("never calls a %s outcome settled", (status) => {
    const outcome = ReviewOutcomeSchema.parse(status === "clean" ? localOutcome()
      : { ...localOutcome({ outcome: "terminal-failure" }), outcome: status });
    expect(reviewOutcomeIsSettled(outcome, [])).toBe(false);
  });
  it("requires fix performance to name the same producer, set, and originating head", () => {
    const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ findings: [finding] }));
    const evidence = outcomeEvidence(outcome, "fix");
    const performance = { schemaVersion: 1 as const, producerId: outcome.attemptId,
      dispositionSetId: evidence.dispositionSet.dispositionSetId, originatingHeadSha: outcome.target.headSha,
      producedHeadSha: "e".repeat(40), performedAt: "2026-10-19T13:01:00Z" };
    for (const changed of [{ ...performance, producerId: "another-producer" },
      { ...performance, dispositionSetId: `sha256:${"f".repeat(64)}` as const },
      { ...performance, originatingHeadSha: "f".repeat(40) }]) {
      expect(reviewOutcomeIsSettled(outcome, [{ ...evidence, performance: changed }])).toBe(false);
    }
  });
});
