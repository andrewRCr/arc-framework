/** Recovery guidance for review-policy refusals. */

import { describe, expect, it } from "vitest";

import { CanonicalDigestSchema } from "../../../../../src/lib/kernel/index.js";
import {
  ReviewDriverAdmissionError,
  assertStandardReviewExecutionAdmission,
} from "../../../../../src/scripts/review-gate/policy/review-execution-admission.js";
import {
  ReviewPolicyCommandRequestSchema,
  resolveReviewPolicy,
} from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import {
  HostedErrandCorrectionError,
  HostedReviewAdmissionError,
  StaleLaneAttemptsError,
  hostedRequestAdmissionRemedy,
  localPrepareAdmissionRemedy,
  staleLaneAttemptsRemedy,
} from "../../../../../src/scripts/review-gate/runtime/review-policy-remedy.js";

const target = { repository: "arc-framework/example", pullRequest: 42, headSha: "a".repeat(40) };
const statusTarget = { repository: target.repository, headRef: "chore/example", headSha: target.headSha };
const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`),
  retrigger: "full-final" as const,
  count: 1 as const,
};
const policyRequest = ReviewPolicyCommandRequestSchema.parse({
  schemaVersion: 1,
  target,
  lane: "standard",
  frontlineActive: false,
  standardReview,
  completedPasses: 2,
  attempts: [],
});
const lane = {
  target,
  frontlineActive: false,
  standardReview,
  attempts: [],
  sources: ["codex-pr", "delegated-agent"],
  maxPasses: 2,
  expectedSourceId: "codex-pr",
  expectedNextAction: "hosted-request",
} as const;

function refusal(admit: () => unknown): ReviewDriverAdmissionError {
  try {
    admit();
  } catch (error) {
    if (error instanceof ReviewDriverAdmissionError) return error;
    throw error;
  }
  throw new Error("expected the driver to refuse admission");
}

const approvalRequired = refusal(() => assertStandardReviewExecutionAdmission({ ...lane, completedPasses: 2 }));
const invalidOverride = refusal(() => assertStandardReviewExecutionAdmission({
  ...lane,
  completedPasses: 3,
  judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } },
}));
const passComplete = new ReviewDriverAdmissionError("refused", resolveReviewPolicy({
  ...policyRequest,
  completedPasses: 1,
  attempts: [{ sourceId: "codex-pr", outcome: "clean", reviewOperationId: "hosted/attempt-1" }],
  sources: ["codex-pr"],
  maxPasses: 2,
  verifiedTerminalSignal: {
    reviewOperationId: "hosted/attempt-1",
    confirmedFindingCount: 0,
    maxConfirmedSeverity: null,
    materialFix: false,
    coverageAdequate: true,
  },
}));

describe("driver admission refusals", () => {
  it("carry the driver's answer and no request where the guard composed none", () => {
    expect(approvalRequired).toMatchObject({
      code: "invalid-input",
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      reason: null,
      request: null,
    });
    expect(approvalRequired.message).toContain("driver admission (approval-required/obtain-ceiling-override)");
    expect(invalidOverride).toMatchObject({ state: "invalid-override", nextAction: "stop" });
    expect(invalidOverride.reason).toEqual(expect.any(String));
    expect(passComplete).toMatchObject({ state: "pass-complete", nextAction: "none" });
  });

  it("type a source the driver does not select next as the same refusal", () => {
    expect(refusal(() => assertStandardReviewExecutionAdmission({
      ...lane,
      completedPasses: 0,
      expectedSourceId: "delegated-agent",
    }))).toMatchObject({ state: "ready", nextAction: "hosted-request", message: /not driver-admissible/u });
  });
});

describe("hostedRequestAdmissionRemedy", () => {
  it("names the open change request's review status for each driver answer", () => {
    const argv = ["arc", "review", "status", "--target", JSON.stringify(statusTarget)];
    expect(hostedRequestAdmissionRemedy(new HostedReviewAdmissionError(passComplete, statusTarget))).toEqual({
      invariant: expect.stringContaining("currently admits"),
      text: expect.stringMatching(/lane is complete .* carried as `--additional-pass`\. .*`arc review status/u),
      argv,
    });
    expect(hostedRequestAdmissionRemedy(new HostedReviewAdmissionError(approvalRequired, statusTarget)))
      .toMatchObject({ text: expect.stringMatching(/one-pass override, carried as `--ceiling-override`/u), argv });
    expect(hostedRequestAdmissionRemedy(new HostedReviewAdmissionError(invalidOverride, statusTarget))?.text)
      .toContain(`The supplied override is invalid (${invalidOverride.reason ?? ""}); correct or drop it`);
  });

  it("names nothing for an admission refusal not bound to a change request", () => {
    expect(hostedRequestAdmissionRemedy(approvalRequired)).toBeUndefined();
    expect(hostedRequestAdmissionRemedy(new Error(approvalRequired.message))).toBeUndefined();
  });

  it("sends an Errand correction mismatch to the review status that offers the admissible request", () => {
    const mismatch = new HostedErrandCorrectionError("codex-pr has no native incremental review", statusTarget);

    expect(mismatch).toMatchObject({
      code: "invalid-input",
      message: expect.stringContaining("codex-pr has no native incremental review"),
    });
    expect(hostedRequestAdmissionRemedy(mismatch)).toEqual({
      invariant: expect.stringContaining("only the correction its lane offers at that head"),
      text: expect.stringMatching(/submit its offered request unchanged: `arc review status --target /u),
      argv: ["arc", "review", "status", "--target", JSON.stringify(statusTarget)],
    });
  });
});

describe("localPrepareAdmissionRemedy", () => {
  it("re-resolves the exact policy request the driver evaluated", () => {
    const evaluated = new ReviewDriverAdmissionError("refused", resolveReviewPolicy({
      ...policyRequest,
      sources: ["delegated-agent"],
      maxPasses: 2,
    }), policyRequest);

    expect(localPrepareAdmissionRemedy(evaluated)).toEqual({
      invariant: expect.stringContaining("currently admits"),
      text: expect.stringMatching(
        /carried as `ceilingOverride`\. For its exact consequence, re-resolve the lane with the carried stdin request/u,
      ),
      argv: ["arc", "review", "resolve", "-"],
      stdin: policyRequest,
    });
  });

  it("names nothing when the refusing guard composed no request", () => {
    expect(localPrepareAdmissionRemedy(approvalRequired)).toBeUndefined();
  });
});

describe("staleLaneAttemptsRemedy", () => {
  const request = {
    ...policyRequest,
    completedPasses: 1,
    attempts: [{ sourceId: "codex-pr", outcome: "findings", reviewOperationId: "hosted/attempt-1" }],
  };
  const stale = new StaleLaneAttemptsError({ attemptHeadSha: "c".repeat(40), targetHeadSha: target.headSha });

  it("replays the submitted request without its attempts and with its completed-pass count", () => {
    expect(stale).toMatchObject({ code: "invalid-input", message: expect.stringContaining("c".repeat(40)) });
    expect(staleLaneAttemptsRemedy(stale, request)).toEqual({
      invariant: expect.stringContaining("exact head they reviewed"),
      text: expect.stringMatching(/keep the completed-pass count, and re-resolve the lane with the carried stdin/u),
      argv: ["arc", "review", "resolve", "-"],
      stdin: { ...request, attempts: [] },
    });
  });

  it("names nothing for another failure or a request that is not an object", () => {
    expect(staleLaneAttemptsRemedy(new Error(stale.message), request)).toBeUndefined();
    expect(staleLaneAttemptsRemedy(stale, [request])).toBeUndefined();
  });
});
