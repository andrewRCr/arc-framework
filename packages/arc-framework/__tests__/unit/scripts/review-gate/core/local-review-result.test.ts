import { describe, expect, it } from "vitest";
import { assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  LocalReviewEvaluatorResultSchema,
  NormalizedLocalReviewResultSchema,
  normalizeLocalReviewResult,
  type LocalReviewResultBindings,
} from "../../../../../src/scripts/review-gate/core/local-review-result.js";

const digest = (value: string) => canonicalDigest({ value });
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

  it("accepts compatibility bindings that exactly match runtime-owned values", () => {
    expect(normalizeLocalReviewResult({
      ...evaluatorResult,
      ...bindings,
    }, bindings)).toEqual({
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

  it("requires the repository binding on normalized results", () => {
    const withoutRepository = {
      ...evaluatorResult,
      ...bindings,
      repositoryId: undefined,
    };

    assertSchemaRefuses(NormalizedLocalReviewResultSchema, withoutRepository);
  });

  it("assigns capture ordinals without treating opaque evidence references as labels", () => {
    const findings = [
      {
        findingId: "finding-1",
        severity: "major",
        locus: "src/one.ts:1",
        evidenceUrlOrId: "opaque:one",
      },
      {
        findingId: "finding-2",
        severity: "minor",
        locus: "src/two.ts:2",
        evidenceUrlOrId: "opaque:two",
      },
    ];

    expect(normalizeLocalReviewResult({
      ...evaluatorResult,
      result: "findings",
      findings,
    }, bindings).findings).toEqual([
      { ...findings[0], sourceOrdinal: 1 },
      { ...findings[1], sourceOrdinal: 2 },
    ]);
  });

  it("keeps runtime navigation fields out of evaluator-owned input", () => {
    const finding = {
      findingId: "finding-1",
      severity: "major",
      locus: "src/one.ts:1",
      evidenceUrlOrId: "opaque:one",
    };
    assertSchemaRefuses(LocalReviewEvaluatorResultSchema, {
      ...evaluatorResult,
      result: "findings",
      findings: [{ ...finding, sourceOrdinal: 1 }],
    });
    assertSchemaRefuses(LocalReviewEvaluatorResultSchema, {
      ...evaluatorResult,
      result: "findings",
      findings: [{ ...finding, sourceLabel: "Invented label" }],
    });
  });
});
