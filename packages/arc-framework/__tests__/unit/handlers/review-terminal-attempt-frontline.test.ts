import { describe, expect, it } from "vitest";
import { createCleanFrontlineFixture } from "../../fixtures/frontline-review.js";
import { responsePolicyRequestFixture } from "../../fixtures/review-response-policy.js";
import { handleReviewResolve } from "../../../src/handlers/review.js";
import { ReviewCommandErrorEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { resolveEvidenceBoundReviewPolicy } from "../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { ReviewPolicyCommandRequestSchema } from "../../../src/scripts/review-gate/policy/review-policy-driver.js";

function requestFixture() {
  const { admission } = createCleanFrontlineFixture();
  const request = responsePolicyRequestFixture({ headSha: admission.target.headSha,
    sourceId: "codex-pr", reviewOperationId: admission.operationId });
  return { ...request, frontlineActive: true, attempts: request.attempts.map(attempt => ({ ...attempt, outcome: "clean" })) };
}

async function resolve(submitted: unknown, standardMaxPasses = 2, frontlineMaxPasses = 2) {
  const { reader, admission } = createCleanFrontlineFixture();
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewResolve("-", {
    resolveRoot: () => "/trusted-repository", readText: async () => JSON.stringify(submitted),
    resolve: parsed => resolveEvidenceBoundReviewPolicy(parsed, {
      sources: parsed.lane === "frontline" ? ["coderabbit-cli"] : ["codex-pr"],
      maxPasses: parsed.lane === "frontline" ? frontlineMaxPasses : standardMaxPasses,
      resultReader: reader, confirmTarget: async () => admission.target,
      dispositionStore: { readDispositionRecord: async () => null,
        appendDispositionRecord: async () => { throw new Error("not used"); } },
    }),
    write: text => output.push(text), setExitCode: code => exitCodes.push(code),
  });
  return { result: JSON.parse(output.join("")) as unknown, exitCodes };
}

function correction(result: unknown) {
  const error = ReviewCommandErrorEnvelopeSchema.parse(result);
  expect(error.error.code).toBe("invalid-input");
  if (!("remedy" in error) || error.remedy === undefined) throw new Error("expected a corrected-input remedy");
  expect(error.remedy.argv).toEqual(["arc", "review", "resolve", "-"]);
  return ReviewPolicyCommandRequestSchema.parse(error.remedy.stdin);
}

describe("frontline terminal input corrections", () => {
  it.each(["ceilingOverride", "additionalPassAuthorization"] as const)(
    "removes wrong-lane %s without transferring its authority", async field => {
      const request = requestFixture();
      const grant = field === "ceilingOverride"
        ? { target: request.target, lane: "standard", exhaustedPassCount: 0, nextPass: 1 }
        : { target: request.target, lane: "standard", precedingProducerId: createCleanFrontlineFixture().admission.operationId,
            completedPasses: 1, nextPass: 2 };
      const refusal = await resolve({ ...request, [field]: grant });
      expect(refusal.exitCodes).toEqual([1]);
      const corrected = correction(refusal.result);
      expect(corrected).not.toHaveProperty(field);
      expect(corrected).toMatchObject({ lane: "frontline", completedPasses: 1,
        attempts: [{ ...request.attempts[0], sourceId: "coderabbit-cli" }] });
      await expect(resolve(corrected)).resolves.toMatchObject({ exitCodes: [],
        result: { state: "pass-complete", nextAction: "none", payload: { completedPasses: 1 } } });
    },
  );

  it("corrects the lane before comparing different configured pass ceilings", async () => {
    const refusal = await resolve(requestFixture(), 3);
    expect(refusal.exitCodes).toEqual([1]);
    const corrected = correction(refusal.result);
    expect(corrected.lane).toBe("frontline");
    await expect(resolve(corrected, 3)).resolves.toMatchObject({ exitCodes: [],
      result: { state: "pass-complete", nextAction: "none", payload: { completedPasses: 1 } } });
    // Once aligned, an actual mismatch with the frontline configuration remains a producer failure.
    await expect(resolve(corrected, 3, 3)).resolves.toMatchObject({ exitCodes: [1],
      result: { error: { code: "unexpected-failure" } } });
  });
});
