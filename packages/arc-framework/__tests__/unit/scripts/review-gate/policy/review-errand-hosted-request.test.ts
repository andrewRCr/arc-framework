import { withReviewNextPassContext } from "../../../../fixtures/review-next-pass.js";
import { describe, expect, it } from "vitest";
import { assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

import { CanonicalDigestSchema } from "../../../../../src/lib/kernel/index.js";

import { HostedRequestEnvelopeSchema } from "../../../../../src/scripts/review-gate/hosted/request.js";
import {
  ReviewPolicyCommandRequestSchema,
  resolveReviewPolicy,
} from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

const target = {
  repository: "arc-framework/example",
  pullRequest: 42,
  headSha: "a".repeat(40),
};

const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`),
  retrigger: "full-final" as const,
  count: 1 as const,
};

describe("an Errand's first standard pass", () => {
  it("resolves to a submit-ready hosted request", () => {
    const opening = { schemaVersion: 1, target, lane: "standard" as const, standardReview,
      sources: ["coderabbit-pr", "codex-pr"], completedPasses: 0, maxPasses: 2, errandVehicle: true };
    const expected = (provider: string) => ({ schemaVersion: 1, target, provider, coverage: "complete",
      vehicle: { kind: "errand", standardReview } });
    const forced = resolveReviewPolicy(withReviewNextPassContext({ ...opening, attempts: [],
      invocation: { mode: "force", sourceId: "codex-pr" } }));
    expect(forced).toMatchObject({ state: "ready", nextAction: "hosted-request", action: expected("codex-pr") });
    expect(HostedRequestEnvelopeSchema.parse((forced as { action?: unknown }).action)).toEqual(expected("codex-pr"));
    // A source that was safely unavailable leaves the first pass to the next source, still complete.
    expect(resolveReviewPolicy(withReviewNextPassContext({ ...opening,
      attempts: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }] })))
      .toMatchObject({ state: "ready", payload: { sourceId: "codex-pr", pass: 1 }, action: expected("codex-pr") });
    assertSchemaRefuses(ReviewPolicyCommandRequestSchema, {
      schemaVersion: 1, target, lane: "standard", standardReview, completedPasses: 0, attempts: [],
      errandVehicle: true,
    });
  });

  it.each([
    { case: "a later pass", completedPasses: 1, errandVehicle: true, sources: ["codex-pr"] },
    { case: "a subject that is not an Errand", completedPasses: 0, errandVehicle: undefined, sources: ["codex-pr"] },
    { case: "a local source", completedPasses: 0, errandVehicle: true, sources: ["delegated-agent"] },
  ])("leaves the hosted request to its owner for $case", ({ completedPasses, errandVehicle, sources }) => {
    const resolved = resolveReviewPolicy(withReviewNextPassContext({ schemaVersion: 1, target, lane: "standard", standardReview,
      sources, completedPasses, maxPasses: 2, attempts: [],
      ...(errandVehicle === undefined ? {} : { errandVehicle }) }));
    expect(resolved).toMatchObject({ state: "ready", payload: { pass: completedPasses + 1 } });
    expect(resolved).not.toHaveProperty("action");
  });
});
