import { describe, expect, it } from "vitest";

import {
  LocalPrepareRequestSchema,
} from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

const routingFacts = {
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
} as const;

describe("local review preparation request", () => {
  it("accepts exactly the five caller-owned routing facts", () => {
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    })).toEqual({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    });
  });

  it("preserves missing or malformed caller facts for conservative routing", () => {
    const routingFactsInput = {
      contentKind: "surprise",
      ownership: "self",
    };
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts: routingFactsInput,
    }).routingFacts).toEqual(routingFactsInput);
  });

  it.each([
    ["schemaVersion", 1],
    ["changeSetState", "known"],
    ["assurance", { workContext: "work-unit", workClass: "Light" }],
    ["activity", { selfReview: true, frontlineReview: true }],
  ] as const)("rejects caller-supplied derived routing field %s", (field, value) => {
    expect(() => LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts: { ...routingFacts, [field]: value },
    })).toThrow();
  });
});
