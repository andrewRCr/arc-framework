import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import {
  createLocalReviewSourcePayload,
  publishLocalReviewPreparation,
} from "../../../../../src/scripts/review-gate/core/local-prepare.js";
import {
  IncrementalReviewScopeSchema,
  type IncrementalReviewScope,
} from "../../../../../src/scripts/review-gate/core/incremental-review-scope.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { projectLocalReviewGuidance } from
  "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";

const digest = (value: string) => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

type CorrectionScopeInput = Omit<IncrementalReviewScope, "headSha">;

function fixture(correction?: CorrectionScopeInput) {
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
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("rubric"),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("expected local requirement");
  const correctionScope = correction === undefined
    ? undefined
    : IncrementalReviewScopeSchema.parse({ ...correction, headSha: target.headSha });
  const source = createLocalReviewSource({
    schemaVersion: 1,
    semanticsVersion: "git-object-range/v1",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    objectFormat: "sha1",
    diffBaseSha: target.diffBaseSha,
    diffBaseTree: target.diffBaseTree,
    headSha: target.headSha,
    headTree: target.headTree,
    reachabilityRef: "refs/arc/review/local/pin",
    materializationRef: "/tmp/review-root",
    ...(correctionScope === undefined ? {} : {
      correctionScope,
      predecessorReachabilityRef: "refs/arc/review/local/predecessor-pin",
      basisReachabilityRef: "refs/arc/review/local/basis-pin",
    }),
  });
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority: {
      vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
    laneSourceId: "delegated-agent",
    scopeMode: "chunked",
    lineage: { kind: "candidate" as const, candidateId: "sha256:7777777777777777777777777777777777777777777777777777777777777777" },
    logicalPass: 1,
    retryGeneration: 0,
    coverageAdmission: correctionScope === undefined
      ? { requestedCoverage: "complete" }
      : { requestedCoverage: "incremental", correctionScope },
    policyBindingDigest: digest("binding"),
    requestMechanism: "local-attestation",
  });
  return { target, source, admission };
}

describe("local prepare publication ordering", () => {
  it("publishes the immutable descriptor and operation before creating the pin", async () => {
    const records = fixture();
    const order: string[] = [];
    const appendSource = vi.fn(async () => {
      order.push("source");
      return { sourceRef: "sources/source.json" };
    });
    const publishOperation = vi.fn(async () => {
      order.push("operation");
      return { version: 1 };
    });
    const materialize = vi.fn(async () => {
      order.push("materialization");
      return { reviewRoot: records.source.materializationRef };
    });

    await expect(publishLocalReviewPreparation(records.admission, records.source, {
      sourceStore: { readSource: vi.fn(), appendSource },
      operationStore: { readOperation: vi.fn(), publishOperation },
      materialize,
      now: () => "2026-07-23T17:00:00Z",
      cleanupTtlMs: 60_000,
      guidance: projectLocalReviewGuidance(),
    })).resolves.toMatchObject({
      persistedVersion: 1,
      sourceRef: "sources/source.json",
      reviewRoot: records.source.materializationRef,
      state: { scopeMode: "chunked" },
    });
    expect(order).toEqual(["source", "operation", "materialization"]);
  });

  it("leaves a recoverable published operation when materialization fails", async () => {
    const records = fixture();
    const publishOperation = vi.fn(async () => ({ version: 1 }));
    await expect(publishLocalReviewPreparation(records.admission, records.source, {
      sourceStore: {
        readSource: vi.fn(),
        appendSource: vi.fn(async () => ({ sourceRef: "sources/source.json" })),
      },
      operationStore: { readOperation: vi.fn(), publishOperation },
      materialize: async () => {
        throw new Error("pin creation interrupted");
      },
      now: () => "2026-07-23T17:00:00Z",
      cleanupTtlMs: 60_000,
      guidance: projectLocalReviewGuidance(),
    })).rejects.toThrow(/pin creation interrupted/u);
    expect(publishOperation).toHaveBeenCalledOnce();
  });

  it("delivers immutable source coordinates without a caller-worktree path", () => {
    const records = fixture();
    const payload = createLocalReviewSourcePayload(records.admission, {
      persistedVersion: 1,
      state: { coverageAdmission: records.admission.coverageAdmission } as never,
      sourceRef: "sources/source.json",
      sourceDigest: records.source.sourceDigest,
      reviewRoot: records.source.materializationRef,
    });

    expect(payload).toEqual({
      reviewRoot: records.source.materializationRef,
      diffBaseSha: records.target.diffBaseSha,
      headSha: records.target.headSha,
      sourceRef: "sources/source.json",
      sourceDigest: records.source.sourceDigest,
    });
    expect(payload).not.toHaveProperty("cwd");
    expect(payload).not.toHaveProperty("worktreePath");
  });
});

describe("local prepare incremental reviewer instructions", () => {
  const predecessorHeadSha = objectId("e");
  const basisHeadSha = objectId("f");

  async function preparedInstructions(requiredFindings: CorrectionScopeInput["requiredFindings"]) {
    const records = fixture({
      schemaVersion: 1,
      predecessorProducerId: "local-predecessor",
      predecessorHeadSha,
      basisHeadSha,
      requiredFindings,
    });
    const preparation = await publishLocalReviewPreparation(records.admission, records.source, {
      sourceStore: {
        readSource: vi.fn(),
        appendSource: vi.fn(async () => ({ sourceRef: "sources/source.json" })),
      },
      operationStore: { readOperation: vi.fn(), publishOperation: vi.fn(async () => ({ version: 1 })) },
      materialize: async () => ({ reviewRoot: records.source.materializationRef }),
      now: () => "2026-07-23T17:00:00Z",
      cleanupTtlMs: 60_000,
      guidance: projectLocalReviewGuidance(),
    });
    return { instructions: preparation.state.reviewerInstructions, headSha: records.target.headSha };
  }

  it("defines the pass's requested change set as the predecessor-to-head range", async () => {
    const { instructions, headSha } = await preparedInstructions([]);

    expect(instructions).toContain(`The requested change set for this pass is ${predecessorHeadSha}..${headSha}`);
    expect(instructions).toContain(`from ${basisHeadSha} to ${predecessorHeadSha}`);
    expect(instructions).toMatch(/do not re-review them/u);
    expect(instructions).not.toContain(`${basisHeadSha}..`);
    expect(instructions).toContain("No earlier material finding requires re-examination.");
  });

  it("keeps every carried material finding in scope at its original locus", async () => {
    const { instructions } = await preparedInstructions([
      { producerId: "local-complete", findingId: "finding-1", locus: "src/a.ts:10" },
      { producerId: "local-predecessor", findingId: "finding-2", locus: "src/b.ts:20" },
    ]);

    expect(instructions).toContain("local-complete / finding-1 at src/a.ts:10");
    expect(instructions).toContain("local-predecessor / finding-2 at src/b.ts:20");
    expect(instructions).toMatch(/original loci, including loci outside the changed lines/u);
  });
});
