import { parseReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/parser.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { hostedOutcome, frontlineOutcome, localOutcome } from "../../../../../../fixtures/review-outcome.js";
import { describe, expect, it } from "vitest";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";




describe("immutable review outcome", () => {
  it("parses a hosted outcome sealed through its producer constructor", () => {
    const outcome = hostedOutcome();
    expect(ReviewOutcomeSchema.safeParse(outcome).success).toBe(true);
  });
});

describe("hosted outcome binding", () => {
  it.each([
    ["another admission pass", (value: ReturnType<typeof hostedOutcome>) => { value.logicalPass = 2; }],
    ["another source", (value: ReturnType<typeof hostedOutcome>) => { Object.assign(value.source, { sourceId: "delegated-agent" }); }],
    ["another owner", (value: ReturnType<typeof hostedOutcome>) => { value.lineage = { kind: "candidate", candidateId: `sha256:${"a".repeat(64)}` }; }],
    ["another attempt", (value: ReturnType<typeof hostedOutcome>) => { value.attemptId = "another-attempt"; }],
    ["another generation", (value: ReturnType<typeof hostedOutcome>) => { value.retryGeneration = 1; }],
    ["no sealed result", (value: ReturnType<typeof hostedOutcome>) => { delete value.hosted.sealedResult; }],
    ["a changed sealed digest", (value: ReturnType<typeof hostedOutcome>) => {
      if (value.hosted.sealedResult !== undefined) value.hosted.sealedResult.hostedResultId = `sha256:${"0".repeat(64)}`;
    }],
    ["a spurious request failure", (value: ReturnType<typeof hostedOutcome>) => { value.hosted.requestFailureReason = "failed"; }],
    ["weakened effective coverage", (value: ReturnType<typeof hostedOutcome>) => { value.effectiveCoverage = "incremental"; }],
  ])("refuses %s", (_label, mutate) => {
    const value = hostedOutcome();
    mutate(value);
    expect(ReviewOutcomeSchema.safeParse(value).success).toBe(false);
  });
});



it("parses a frontline outcome with recorded digests and a portable source", () => {
  const value = frontlineOutcome();
  const parsed = ReviewOutcomeSchema.safeParse(value);
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data).toEqual(value);
});



it("parses a local outcome retaining its complete receipt and admission", () => {
  const value = localOutcome();
  expect(ReviewOutcomeSchema.safeParse(value).success).toBe(true);
});
it("parses JSON and computes stable single-segment outcome keys", () => {
  for (const candidate of [hostedOutcome(), frontlineOutcome(), localOutcome()]) {
    const outcome = ReviewOutcomeSchema.parse(candidate);
    expect(parseReviewOutcome(JSON.stringify(candidate))).toEqual(outcome);
    const key = reviewOutcomeKey(outcome);
    expect(key).not.toContain("/");
    expect(key).toBe(outcome.hosted === undefined ? outcome.attemptId
      : outcome.hosted.admission.admissionId.replace(/^hosted-admission\//u, "hosted-admission-"));
  }
  expect(parseReviewOutcome("not json")).toBeNull();
  expect(parseReviewOutcome("{}")).toBeNull();
});

it.each([
  ["two bindings", () => ({ ...localOutcome(), frontline: frontlineOutcome().frontline })],
  ["no binding", () => { const value = localOutcome(); return { ...value, local: undefined }; }],
  ["frontline lane without frontline admission", () => ({ ...localOutcome(), lane: "frontline" })],
  ["findings on a local clean result", () => ({ ...localOutcome(), findings: [{ findingId: "f-1", severity: "major", locus: "src/a.ts:1", evidenceUrlOrId: "finding:f-1", sourceOrdinal: 1 }] })],
  ["findings on a frontline clean result", () => ({ ...frontlineOutcome(), findings: [{ findingId: "f-1", severity: "major", locus: "src/a.ts:1", evidenceUrlOrId: "finding:f-1", sourceOrdinal: 1 }] })],
  ["a local outcome at another lineage head", () => ({ ...localOutcome(), lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "claim-1", headSha: "a".repeat(40) } })],
  ["a frontline outcome at another lineage head", () => ({ ...frontlineOutcome(), lineage: { ...frontlineOutcome().lineage, headSha: "a".repeat(40) } })],
])("refuses %s", (_label, create) => {
  expect(ReviewOutcomeSchema.safeParse(create()).success).toBe(false);
});

it.each([
  ["a frontline verdict carrying a failure reason", () => ({ ...frontlineOutcome(), frontline: { ...frontlineOutcome().frontline, reason: { class: "execution-timeout" } } })],
  ["a frontline failure without its reason", () => ({ ...frontlineOutcome(), outcome: "timed-out", effectiveCoverage: null })],
  ["a launched frontline verdict without executable identity", () => ({ ...frontlineOutcome(), frontline: { ...frontlineOutcome().frontline, executableIdentity: null } })],
  ["a local attempt identity containing a path separator", () => { const value = localOutcome(); return { ...value, attemptId: "local/attempt", local: { ...value.local, operationId: "local/attempt" } }; }],
])("refuses %s", (_label, create) => {
  expect(ReviewOutcomeSchema.safeParse(create()).success).toBe(false);
});

it("reports multiple bindings explicitly", () => {
  const value = { ...localOutcome(), frontline: frontlineOutcome().frontline };
  const result = ReviewOutcomeSchema.safeParse(value);
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ message: "outcome requires exactly one source binding" }),
  ]));
});
