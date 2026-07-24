import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  normalizeLocalReviewResult,
  type LocalReviewResultBindings,
} from "../../../../../src/scripts/review-gate/core/local-review-result.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

const bindings: LocalReviewResultBindings = {
  repositoryId: "repo-1",
  targetId: digest("target"),
  headSha: objectId("a"),
  headTree: objectId("b"),
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  sourceDigest: digest("source"),
  guidanceDigest: digest("guidance"),
};

const evaluatorResult = {
  status: "complete" as const,
  result: "clean" as const,
  evaluatorIdentity: "evaluator-1",
  reviewRunId: "run-1",
  applicabilityId: null,
  findings: [],
};

function differentBinding(binding: keyof LocalReviewResultBindings): string {
  if (binding === "headSha" || binding === "headTree") return objectId("f");
  if (binding.endsWith("Digest") || binding === "targetId") return digest(`different-${binding}`);
  return "different";
}

describe("local review result normalization", () => {
  it("injects every runtime-owned binding when evaluator output omits them", () => {
    expect(normalizeLocalReviewResult(evaluatorResult, bindings)).toEqual({
      ...evaluatorResult,
      ...bindings,
    });
  });

  it.each(Object.keys(bindings) as (keyof LocalReviewResultBindings)[])(
    "rejects a mismatched compatibility binding for %s",
    (binding) => {
      expect(() => normalizeLocalReviewResult({
        ...evaluatorResult,
        [binding]: differentBinding(binding),
      }, bindings)).toThrow(`local review result ${binding} does not match`);
    },
  );
});
