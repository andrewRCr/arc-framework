import { describe, expect, it } from "vitest";

import {
  parseCapabilitySet,
  parseNormalizedChangeRequest,
  parseReviewPolicy,
  parseReviewRequirement,
} from "../../../../../src/scripts/review-gate/core/contracts.js";

const changeRequest = {
  schemaVersion: 1,
  repositoryId: "repo-1",
  changeRequestId: "change-7",
  hostRef: "opaque-change-7",
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: "b".repeat(40),
  headSha: "c".repeat(40),
  changeSetId: "d".repeat(64),
};

const requirement = {
  schemaVersion: 1,
  id: "independent-analysis",
  kind: "independent-analysis",
  obligation: "required",
  acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
  count: 1,
  initialAdmission: "automatic",
  policyVersion: "e".repeat(64),
  rubricVersion: "independent-analysis/v1",
  changeSetId: changeRequest.changeSetId,
  headSha: changeRequest.headSha,
};

describe("normalized review contracts", () => {
  it("round-trips an exact change request and capability set", () => {
    expect(parseNormalizedChangeRequest(JSON.parse(JSON.stringify(changeRequest)))).toEqual(changeRequest);
    expect(parseCapabilitySet({
      schemaVersion: 1,
      actorIdentity: "actor-4",
      permissions: ["read", "write", "maintain"],
    })).toEqual({
      schemaVersion: 1,
      actorIdentity: "actor-4",
      permissions: ["read", "write", "maintain"],
    });
  });

  it("round-trips policy requirements without losing qualifiers or admission", () => {
    const template = {
      id: requirement.id,
      kind: requirement.kind,
      obligation: requirement.obligation,
      acceptableSources: requirement.acceptableSources,
      count: requirement.count,
      initialAdmission: requirement.initialAdmission,
      rubricVersion: requirement.rubricVersion,
    };
    expect(parseReviewRequirement(requirement)).toEqual(requirement);
    expect(parseReviewPolicy({
      schemaVersion: 1,
      semanticsVersion: "review-policy/v1",
      requirements: [template],
    })).toEqual({
      schemaVersion: 1,
      semanticsVersion: "review-policy/v1",
      requirements: [template],
    });
  });

  it.each([
    ["unknown requirement kind", { ...requirement, kind: "rubber-stamp" }],
    ["zero count", { ...requirement, count: 0 }],
    ["unknown qualifier shape", { ...requirement, acceptableSources: [{ sourceKind: "agent", qualifier: "" }] }],
    ["wrong policy digest", { ...requirement, policyVersion: "not-a-digest" }],
    ["wrong change binding", { ...requirement, changeSetId: "short" }],
  ])("rejects %s", (_name, input) => {
    expect(() => parseReviewRequirement(input)).toThrow();
  });

  it("does not admit work-unit or cardinality fields into a change request", () => {
    expect(() => parseNormalizedChangeRequest({ ...changeRequest, workUnitId: "wu", pullRequestCount: 2 })).toThrow();
  });
});
