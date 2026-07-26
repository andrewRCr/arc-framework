import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
  resolveLocalReviewPolicyBinding,
  validateLocalReviewPolicySelection,
} from "../../../../../src/scripts/review-gate/policy/local-review-policy.js";
import { projectLocalReviewGuidance } from "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../../../../src/scripts/review-gate/policy/standard-review.js";

const registered = [{ sourceKind: "agent", qualifier: "standard-review/v1" }] as const;

describe("local review policy and guidance", () => {
  it("digests the exact delivered guidance without changing baseline rubric identity", () => {
    const baseline = projectLocalReviewGuidance();
    const augmented = projectLocalReviewGuidance({
      rubricId: "project-review/v1",
      dimensions: [{
        id: "repository-contract",
        title: "Repository contract",
        instruction: "Check repository-specific invariants.",
      }],
    });

    expect(baseline.projection).toMatchObject({
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    });
    expect(augmented.projection).toMatchObject({
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    });
    expect(augmented.guidanceDigest).not.toBe(baseline.guidanceDigest);
    expect(augmented.reviewerInstructions).toContain("Repository contract");
  });

  it("uses the opt-in package default and permits stricter narrowing", () => {
    expect(resolveLocalReviewPolicyBinding(null, registered)).toEqual({
      status: "resolved",
      binding: DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
      diagnostics: [],
    });

    const strict = resolveLocalReviewPolicyBinding(() => ({
      schemaVersion: 1,
      semanticsVersion: "local-review-policy/v1",
      acceptableSources: [...registered],
      initialAdmission: "checkpoint",
      requestMechanism: "local-attestation",
      acceptedRuntimeKinds: ["arc-cli"],
    }), registered);
    expect(strict).toMatchObject({ status: "resolved" });
    if (strict.status !== "resolved") throw new Error("strict binding unexpectedly unavailable");
    expect(() => validateLocalReviewPolicySelection(strict.binding, {
      source: registered[0],
      runtimeKind: "arc-cli",
    })).not.toThrow();
    expect(() => validateLocalReviewPolicySelection(strict.binding, {
      source: registered[0],
      runtimeKind: "other-runtime",
    })).toThrow(/runtime/u);
  });

  it("returns unavailable for a malformed or unregistered present adapter but never downgrades", () => {
    expect(resolveLocalReviewPolicyBinding(() => ({ malformed: true }), registered))
      .toMatchObject({ status: "unavailable" });
    expect(resolveLocalReviewPolicyBinding(() => ({
      schemaVersion: 1,
      semanticsVersion: "local-review-policy/v1",
      acceptableSources: [{ sourceKind: "agent", qualifier: "unregistered/v1" }],
      initialAdmission: "checkpoint",
      requestMechanism: "local-attestation",
      acceptedRuntimeKinds: ["arc-cli"],
    }), registered)).toMatchObject({
      status: "unavailable",
      diagnostics: ["local-policy.unregistered-source"],
    });
  });
});
