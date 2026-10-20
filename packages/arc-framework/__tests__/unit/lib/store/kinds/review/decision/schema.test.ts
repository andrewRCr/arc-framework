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

it.each(["ceiling", "additional"] as const)("retains the original policy binding for a %s grant", kind => {
  const base = extraPassDecision(kind);
  if (base.choice.kind !== "extra-pass" || base.choice.precondition.kind === "approved-fix") throw new Error("Expected ordinary grant");
  for (const targetBinding of [{ kind: "call-target" },
    { kind: "policy-target", repository: "Owner/Repository", pullRequest: null },
    { kind: "policy-target", repository: "Owner/Repository", pullRequest: 41 }]) {
    const value = { ...base, subject: { ...base.subject, headSha: "a".repeat(40) },
      choice: { ...base.choice, precondition: { ...base.choice.precondition, targetBinding } } };
    expect(parseReviewDecision(JSON.stringify(value))).toEqual(value);
  }
});

it.each([undefined, null, { kind: "unknown" }, { kind: "call-target", repository: "owner/repo" },
  { kind: "policy-target", repository: "owner/repo" },
  { kind: "policy-target", repository: "owner/repo", pullRequest: 0 },
  { kind: "policy-target", repository: "invalid", pullRequest: 1 },
  { kind: "policy-target", repository: "owner/repo", pullRequest: 1, headSha: "a".repeat(40) },
])("refuses a missing or malformed ordinary target binding: %j", targetBinding => {
  const base = extraPassDecision();
  if (base.choice.kind !== "extra-pass") throw new Error("Expected an extra pass");
  expect(parseReviewDecision(JSON.stringify({ ...base,
    choice: { ...base.choice, precondition: { kind: "ceiling", targetBinding } },
  }))).toBeNull();
});
