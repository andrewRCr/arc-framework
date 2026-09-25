import { describe, expect, it, vi } from "vitest";





import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";










import { LocalPrepareRequestSchema, prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";


const objectId = (character: string): string => character.repeat(40);
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

  it("admits source-neutral complete or exact incremental coverage", () => {
    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: "local-predecessor",
      predecessorHeadSha: objectId("a"),
      basisHeadSha: objectId("9"),
      headSha: objectId("c"),
      requiredFindings: [],
    };
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      coverageAdmission: { requestedCoverage: "complete" },
    })).toMatchObject({ coverageAdmission: { requestedCoverage: "complete" } });
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      coverageAdmission: { requestedCoverage: "incremental", correctionScope },
    })).toMatchObject({
      coverageAdmission: { requestedCoverage: "incremental", correctionScope },
    });
    expect(() => LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      coverageAdmission: { requestedCoverage: "incremental" },
    })).toThrow(/correction scope/u);
    expect(() => LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      coverageAdmission: { requestedCoverage: "complete", correctionScope },
    })).toThrow(/correction scope/u);
  });

  it("refuses a member selector without the exact delivery admission", () => {
    const memberHeadObjectId = objectId("e");
    expect(() => LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      memberHeadObjectId,
    })).toThrow(/delivery admission/u);
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    }).memberHeadObjectId).toBeUndefined();
    expect(() => LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      memberHeadObjectId: "not-an-object-id",
    })).toThrow();
  });

  it("rejects an unadmitted member selector before authority resolution", async () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });
    // Refusing at resolution isolates the hand-off: nothing downstream has to be stubbed.
    const resolveAuthority = vi.fn(async () => {
      throw new Error("delivery-member-unbound");
    });
    const dependencies = {
      sweep: async () => undefined,
      laneSourceId: "delegated-agent",
      resolveRepositoryId: async () => target.repositoryId,
      deriveTarget: async () => target,
      resolveAuthority,
    } as unknown as Parameters<typeof prepareLocalReview>[1];
    const request = { schemaVersion: 1 as const, evaluatorIdentity: "evaluator-1", routingFacts };

    await expect(prepareLocalReview(
      { ...request, memberHeadObjectId: objectId("e") },
      dependencies,
    )).rejects.toThrow(/delivery admission/u);
    expect(resolveAuthority).not.toHaveBeenCalled();

    resolveAuthority.mockClear();
    await expect(prepareLocalReview(request, dependencies)).rejects.toThrow(/delivery-member-unbound/u);
    expect(resolveAuthority).toHaveBeenCalledWith("evaluator-1", undefined);
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
