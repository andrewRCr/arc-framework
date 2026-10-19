import { describe, expect, it } from "vitest";
import { parseReviewDecision, decodeReviewDecision } from "../../../../../../../src/lib/store/kinds/review/decision/parser.js";
import { terminusDecision, extraPassDecision, approvedFixDecision } from "../../../../../../fixtures/review-decision.js";
import { hostedOutcome } from "../../../../../../fixtures/review-outcome.js";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";

describe("review decision envelopes", () => {
  const base = terminusDecision();
  it.each([base, extraPassDecision(), extraPassDecision("additional"),
    approvedFixDecision(ReviewOutcomeSchema.parse(hostedOutcome())),
    { ...base, lane: "frontline", choice: { kind: "lane-skip" }, basis: null },
    { ...base, choice: { kind: "withdrawal", decisionKey: `sha256:${"d".repeat(64)}` }, basis: null },
    { ...base, subject: { ...base.subject, headSha: null, subjectDigest: null }, decidedBy: null, decidedAt: null },
  ])("parses a complete choice: $choice.kind", (value) => {
    expect(parseReviewDecision(JSON.stringify(value))).toEqual(value);
  });
  it.each([
    { ...base, basis: null },
    { ...extraPassDecision(), basis: { passCount: 2 } },
    { ...base, subject: { ...base.subject, headSha: "c".repeat(40) } },
    { ...base, lane: "frontline" },
    { ...base, lane: "standard", choice: { kind: "lane-skip" }, basis: null },
    { ...extraPassDecision("additional"), lane: "frontline" },
  ])("refuses a choice with a contradictory basis, lane, or Candidate terminus head", (value) => {
    expect(parseReviewDecision(JSON.stringify(value))).toBeNull();
  });

  const approvedFix = approvedFixDecision(ReviewOutcomeSchema.parse(hostedOutcome()));
  it.each([
    { ...approvedFix, decidedBy: null },
    { ...approvedFix, subject: { ...approvedFix.subject, headSha: "e".repeat(40) } },
    { ...approvedFix, subject: { ...approvedFix.subject, subjectDigest: `sha256:${"a".repeat(64)}` } },
    { ...approvedFix, choice: { ...approvedFix.choice, passCount: 2 } },
  ])("refuses an approved-fix envelope that differs from its original authorization", (value) => {
    expect(parseReviewDecision(JSON.stringify(value))).toBeNull();
  });
  it.each([
    { ...extraPassDecision(), choice: { kind: "extra-pass", passCount: 2 } },
    { ...extraPassDecision(), choice: { kind: "extra-pass", passCount: 2, precondition: { kind: "additional" } } },
    { ...approvedFix, choice: { kind: "extra-pass", passCount: 1, precondition: { kind: "approved-fix" } } },
    { ...base, choice: { kind: "withdrawal" }, basis: null },
    { ...base, basis: { count: 2 } },
    { ...base, decidedAt: "yesterday" }, { ...base, decidedBy: "" },
    { ...extraPassDecision(), choice: { kind: "extra-pass", passCount: Number.MAX_SAFE_INTEGER,
      precondition: { kind: "ceiling" } } },
    { ...base, status: "bound" },
  ])("refuses an incomplete or malformed immutable decision", (value) => {
    expect(parseReviewDecision(JSON.stringify(value))).toBeNull();
  });

  it("refuses malformed JSON with an issue-bearing diagnostic", () => {
    expect(parseReviewDecision("{")).toBeNull();
    expect(decodeReviewDecision("{")).toEqual({ success: false, error: expect.stringMatching(/^JSON:/u) });
  });
});
