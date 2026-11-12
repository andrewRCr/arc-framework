/** Repairable forced-source validation through the review command boundary. */

import { expect, it } from "vitest";

import { handleReviewResolve } from "../../../src/handlers/review.js";
import { SpineRemedySchema } from "../../../src/scripts/integration/spine-refusal.js";
import { ReviewCommandErrorEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { ReviewPolicyCommandRequestSchema, ReviewResolveEnvelopeSchema, resolveReviewPolicy,
  type ReviewPolicyCommandRequest } from "../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../../src/scripts/review-gate/policy/standard-review.js";
import { withReviewNextPassContext } from "../../fixtures/review-next-pass.js";

const request = ReviewPolicyCommandRequestSchema.parse({
  schemaVersion: 1,
  target: { repository: "owner/repo", pullRequest: 42, headSha: "a".repeat(40) },
  lane: "standard",
  frontlineActive: true,
  standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
    rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version, rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    retrigger: "full-final", count: 1 },
  completedPasses: 0,
  attempts: [],
});

async function resolveCommand(input: ReviewPolicyCommandRequest, maxPasses = 3): Promise<{ exitCode: number; result: unknown }> {
  const output: string[] = [];
  let exitCode = 0;
  await handleReviewResolve("-", {
    resolveRoot: () => "/repo",
    readText: async () => JSON.stringify(input),
    resolve: async (parsed) => resolveReviewPolicy(withReviewNextPassContext({ ...parsed,
      sources: ["codex-pr", "delegated-agent"], maxPasses })),
    write: (text) => { output.push(text); },
    setExitCode: (code) => { exitCode = code; },
  });
  expect(output).toHaveLength(1);
  return { exitCode, result: JSON.parse(output[0] ?? "null") as unknown };
}

it.each([
  { label: "unconfigured", input: { ...request, invocation: { mode: "force", sourceId: "coderabbit-pr" } },
    condition: /configured standard-review source/u, repair: "configure", pass: 1 },
  { label: "before recorded progress", input: { ...request, completedPasses: 1,
    attempts: [{ sourceId: "delegated-agent", outcome: "rate-limited" }],
    invocation: { mode: "force", sourceId: "codex-pr" } },
    condition: /precede recorded source progress/u, repair: "current logical pass", pass: 2 },
])("reports an $label forced source as invalid input, then resolves the repaired request", async (example) => {
  const input = ReviewPolicyCommandRequestSchema.parse(example.input);
  const first = await resolveCommand(input);
  const refused = ReviewCommandErrorEnvelopeSchema.parse(first.result);
  expect(first.exitCode).toBe(1);
  expect(refused.error).toMatchObject({ code: "invalid-input", message: expect.stringMatching(example.condition) });
  expect(refused.error.message).not.toMatch(/^\[/u);
  if (!("remedy" in refused)) throw new Error("Forced-source refusal must carry a remedy");
  const remedy = SpineRemedySchema.parse(refused.remedy);
  expect(remedy).toMatchObject({ argv: ["arc", "review", "resolve", "-"],
    text: expect.stringContaining(example.repair), stdin: input });

  const retry = ReviewPolicyCommandRequestSchema.parse(remedy.stdin);
  const repaired = ReviewPolicyCommandRequestSchema.parse({ ...retry,
    invocation: { mode: "force", sourceId: "codex-pr" }, attempts: [] });
  expect(repaired.target).toEqual(input.target);
  expect(repaired.completedPasses).toBe(input.completedPasses);
  const second = await resolveCommand(repaired);
  expect(second.exitCode).toBe(0);
  expect(ReviewResolveEnvelopeSchema.parse(second.result)).toMatchObject({ state: "ready", nextAction: "hosted-request",
    payload: { sourceId: "codex-pr", pass: example.pass } });
});

it("keeps unrelated bound-policy schema failures classified as internal failures", async () => {
  const result = await resolveCommand(request, 0);
  expect(result.exitCode).toBe(1);
  expect(ReviewCommandErrorEnvelopeSchema.parse(result.result)).toMatchObject({ error: { code: "unexpected-failure" } });
});
