import { parseReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/parser.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { hostedOutcome, frontlineOutcome, localOutcome } from "../../../../../../fixtures/review-outcome.js";
import { describe, expect, it } from "vitest";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";

/** The messages of every rule a candidate outcome breaks, so a case shows its own rule refused it. */
function refusalMessages(input: unknown): string[] {
  const result = ReviewOutcomeSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map(({ message }) => message);
}




describe("immutable review outcome", () => {
  it("parses a hosted outcome sealed through its producer constructor", () => {
    const outcome = hostedOutcome();
    expect(ReviewOutcomeSchema.safeParse(outcome).success).toBe(true);
  });
});

describe("hosted outcome binding", () => {
  it.each([
    ["another admission pass", (value: ReturnType<typeof hostedOutcome>) => { value.logicalPass = 2; }, "hosted lane attempt does not match its durable admission"],
    ["another source", (value: ReturnType<typeof hostedOutcome>) => { Object.assign(value.source, { sourceId: "delegated-agent" }); }, "hosted attempt source must be a hosted provider"],
    ["another owner", (value: ReturnType<typeof hostedOutcome>) => { value.lineage = { kind: "candidate", candidateId: `sha256:${"a".repeat(64)}` }; }, "hosted attempt must remain inside its lane owner"],
    ["another attempt", (value: ReturnType<typeof hostedOutcome>) => { value.attemptId = "another-attempt"; }, "acknowledged hosted attempt identity must derive from its handle"],
    ["another generation", (value: ReturnType<typeof hostedOutcome>) => { value.retryGeneration = 1; }, "hosted attempts must use generation zero"],
    ["no sealed result", (value: ReturnType<typeof hostedOutcome>) => { delete value.hosted.sealedResult; }, "hosted terminal authority must exactly match one sealed producer result"],
    ["a changed sealed digest", (value: ReturnType<typeof hostedOutcome>) => {
      if (value.hosted.sealedResult !== undefined) value.hosted.sealedResult.hostedResultId = `sha256:${"0".repeat(64)}`;
    }, "hosted result identity does not match its canonical producer content"],
    ["a spurious request failure", (value: ReturnType<typeof hostedOutcome>) => { value.hosted.requestFailureReason = "failed"; }, "hosted terminal request failure must retain exactly one reason"],
    ["weakened effective coverage", (value: ReturnType<typeof hostedOutcome>) => { value.effectiveCoverage = "incremental"; }, "hosted outcome must match its complete source binding"],
  ])("refuses %s", (_label, mutate, rule) => {
    const value = hostedOutcome();
    mutate(value);
    expect(refusalMessages(value)).toContain(rule);
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
  ["two bindings", () => ({ ...localOutcome(), frontline: frontlineOutcome().frontline }), "outcome requires exactly one source binding"],
  ["no binding", () => { const value = localOutcome(); return { ...value, local: undefined }; }, "outcome requires exactly one source binding"],
  ["frontline lane without frontline admission", () => ({ ...localOutcome(), lane: "frontline" }), "frontline lane requires its admitted frontline producer"],
  ["findings on a local clean result", () => ({ ...localOutcome(), findings: [{ findingId: "f-1", severity: "major", locus: "src/a.ts:1", evidenceUrlOrId: "finding:f-1", sourceOrdinal: 1 }] }), "only findings outcomes carry a nonempty finding set"],
  ["findings on a frontline clean result", () => ({ ...frontlineOutcome(), findings: [{ findingId: "f-1", severity: "major", locus: "src/a.ts:1", evidenceUrlOrId: "finding:f-1", sourceOrdinal: 1 }] }), "only findings outcomes carry a nonempty finding set"],
  ["a local outcome at another lineage head", () => ({ ...localOutcome(), lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "claim-1", headSha: "a".repeat(40) } }), "outcome target must remain at its head-bound lineage head"],
  ["a frontline outcome at another lineage head", () => ({ ...frontlineOutcome(), lineage: { ...frontlineOutcome().lineage, headSha: "a".repeat(40) } }), "outcome target must remain at its head-bound lineage head"],
])("refuses %s", (_label, create, rule) => {
  expect(refusalMessages(create())).toContain(rule);
});

it.each([
  ["a frontline verdict carrying a failure reason", () => ({ ...frontlineOutcome(), frontline: { ...frontlineOutcome().frontline, reason: { class: "execution-timeout" } } }), "frontline reason must match its recorded lane outcome"],
  ["a frontline failure without its reason", () => ({ ...frontlineOutcome(), outcome: "timed-out", effectiveCoverage: null }), "frontline reason must match its recorded lane outcome"],
  ["a launched frontline verdict without executable identity", () => ({ ...frontlineOutcome(), frontline: { ...frontlineOutcome().frontline, executableIdentity: null } }), "frontline executable identity must match whether its producer launched"],
  ["a local attempt identity containing a path separator", () => { const value = localOutcome(); return { ...value, attemptId: "local/attempt", local: { ...value.local, operationId: "local/attempt" } }; }, "non-hosted outcome identity must be one path segment"],
])("refuses %s", (_label, create, rule) => {
  expect(refusalMessages(create())).toContain(rule);
});

it("reports multiple bindings explicitly", () => {
  const value = { ...localOutcome(), frontline: frontlineOutcome().frontline };
  const result = ReviewOutcomeSchema.safeParse(value);
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ message: "outcome requires exactly one source binding" }),
  ]));
});
