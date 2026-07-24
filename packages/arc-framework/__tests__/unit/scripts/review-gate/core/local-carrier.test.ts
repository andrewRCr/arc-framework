import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalChangeSetCarrier } from "../../../../../src/scripts/review-gate/core/local-carrier.js";

const objectId = (character: string): string => character.repeat(40);

function fixture() {
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
  return {
    target,
    requirementId: canonicalDigest({ requirement: "analysis" }),
    snapshot: {
      state: "exact" as const,
      repositoryId: target.repositoryId,
      baseRef: target.baseRef,
      diffBaseSha: target.diffBaseSha,
      diffBaseTree: target.diffBaseTree,
      headSha: target.headSha,
      headTree: target.headTree,
    },
    authorIdentity: "author-1",
    evaluatorIdentity: "evaluator-1",
    attestation: {
      evaluatorIdentity: "evaluator-1",
      runtimeIdentity: "local-attestor-1",
      mechanism: "local-runtime",
    },
    generation: 0,
    requestMechanism: "automatic",
  };
}

describe("local change-set carrier", () => {
  it("binds an exact local target, separated actors, and a null change-request identity", () => {
    const records = fixture();

    expect(createLocalChangeSetCarrier(records)).toMatchObject({
      target: records.target,
      request: {
        repositoryId: records.target.repositoryId,
        targetId: records.target.targetId,
        requirementId: records.requirementId,
        carrier: { kind: "local-change-set", adapterId: "local", changeRequestId: null },
        authorIdentity: "author-1",
        evaluatorIdentity: "evaluator-1",
      },
      attestation: records.attestation,
    });
  });

  it("rejects author self-review", () => {
    const records = fixture();
    expect(() => createLocalChangeSetCarrier({
      ...records,
      evaluatorIdentity: records.authorIdentity,
      attestation: { ...records.attestation, evaluatorIdentity: records.authorIdentity },
    })).toThrow(/author and evaluator/iu);
  });

  it.each(["diffBaseTree", "headTree"] as const)("rejects a local %s outside the exact target", (field) => {
    const records = fixture();
    expect(() => createLocalChangeSetCarrier({
      ...records,
      snapshot: { ...records.snapshot, [field]: objectId("e") },
    })).toThrow(/snapshot.*target/iu);
  });

  it.each(["uncommitted", "unborn"] as const)("rejects unsupported %s local state", (state) => {
    const records = fixture();
    expect(() => createLocalChangeSetCarrier({
      ...records,
      snapshot: { ...records.snapshot, state },
    })).toThrow(/unsupported local review state/iu);
  });

  it("rejects evaluator and attestor binding mismatches", () => {
    const records = fixture();
    expect(() => createLocalChangeSetCarrier({
      ...records,
      attestation: { ...records.attestation, evaluatorIdentity: "evaluator-2" },
    })).toThrow(/attestation evaluator/iu);
    expect(() => createLocalChangeSetCarrier({
      ...records,
      attestation: { ...records.attestation, runtimeIdentity: records.evaluatorIdentity },
    })).toThrow(/runtime.*distinct/iu);
  });
});
