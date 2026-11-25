/** Version-two envelopes retain transient policy routing while stored boundaries omit it. */
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { createKernelRegistry } from "../../../../../src/lib/kernel/index.js";
import { registerReviewDomainSchemas } from "../../../../../src/scripts/review-gate/core/register-review-schemas.js";
import { expect, it } from "vitest";
import { boundaryContinuation, boundaryV1Fixture, boundaryV2Fixture } from "../../../../fixtures/review-boundary.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { prePublicationBoundary, PrePublicationReviewEnvelopeSchema } from "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";

const policy = resolveReviewPolicy({ schemaVersion: 1, target: { repository: "owner/repo", pullRequest: null, headSha: "a".repeat(40) },
  lane: "frontline", frontlineActive: true, standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1", rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 },
  sources: ["coderabbit-cli"], completedPasses: 0, maxPasses: 2, attempts: [], invocation: { mode: "skip" } });
const self = boundaryV2Fixture(), resume = { ...self, nextAction: boundaryContinuation.nextAction };
const fix = boundaryV2Fixture("candidate-fix-pending"), convergence = boundaryV2Fixture("candidate-convergence-verification-pending");
const ready = boundaryV2Fixture("candidate-publish-ready");
const cases = [
  { name: "self review", boundary: self, policy: null },
  { name: "review resume", boundary: resume, policy: null },
  { name: "policy resume", boundary: resume, policy },
  { name: "pending fix", boundary: fix, policy: null },
  { name: "fix policy", boundary: fix, policy },
  { name: "convergence", boundary: convergence, policy: null },
  { name: "readiness", boundary: ready, policy: null },
];

it.each(cases)("parses the native $name envelope with its policy", ({ boundary, policy }) => {
  const envelope = { ...boundary, mode: "pre-publication-review", target: null, policy };
  expect(PrePublicationReviewEnvelopeSchema.parse(envelope)).toEqual(envelope);
});

it.each([{ name: "self review", boundary: self }, { name: "convergence", boundary: convergence }, { name: "readiness", boundary: ready }])("refuses policy on native $name", ({ boundary }) => {
  expect(PrePublicationReviewEnvelopeSchema.safeParse({ ...boundary, mode: "pre-publication-review", target: null, policy }).success).toBe(false);
});

it.each([{ name: "resume", boundary: resume }, { name: "fix", boundary: fix }])("keeps native $name policy closed", ({ boundary }) => {
  expect(PrePublicationReviewEnvelopeSchema.safeParse({ ...boundary, mode: "pre-publication-review", target: null,
    policy: { ...policy, state: "invented-state" } }).success).toBe(false);
});

it.each(cases)("persists the native $name boundary without its transient routing fields", ({ boundary, policy }) => {
  const envelope = PrePublicationReviewEnvelopeSchema.parse({ ...boundary, mode: "pre-publication-review", target: null, policy });
  expect(prePublicationBoundary(envelope)).toEqual({ ...boundary, mode: "pre-publication-review" });
});

it("retains policy in a version-one persisted boundary", () => {
  const boundary = { ...boundaryV1Fixture("candidate-fix-pending"), mode: "pre-publication-review" };
  const envelope = PrePublicationReviewEnvelopeSchema.parse({ ...boundary, target: null });
  expect(prePublicationBoundary(envelope)).toEqual(boundary);
});

it("publishes the same native policy contracts through JSON schema", () => {
  const bundle = registerReviewDomainSchemas(createKernelRegistry()).toJSONSchema({ io: "output" });
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  for (const schema of Object.values(bundle.schemas)) ajv.addSchema(schema as AnySchema);
  const projected = ajv.getSchema("urn:arc:schema:review-pre-publication-envelope");
  if (projected === undefined) throw new Error("Expected published pre-publication contract");
  for (const { boundary, policy } of cases) {
    expect(projected({ ...boundary, mode: "pre-publication-review", target: null, policy })).toBe(true);
  }
  for (const boundary of [self, convergence, ready]) {
    expect(projected({ ...boundary, mode: "pre-publication-review", target: null, policy })).toBe(false);
  }
  for (const boundary of [resume, fix]) {
    expect(projected({ ...boundary, mode: "pre-publication-review", target: null,
      policy: { ...policy, state: "invented-state" } })).toBe(false);
  }
});
