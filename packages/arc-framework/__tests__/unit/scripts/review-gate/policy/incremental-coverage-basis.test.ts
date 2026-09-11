import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from
  "../../../../../src/lib/kernel/index.js";
import type { ReviewResultReader } from
  "../../../../../src/scripts/review-gate/core/ports.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  resolveIncrementalCorrectionScope,
  resolveIncrementalCoverageBasis,
  type IncrementalCoverageBasisDependencies,
} from
  "../../../../../src/scripts/review-gate/policy/incremental-coverage-basis.js";

const oid = (character: string): string => character.repeat(40);
const digest = (value: string): string => canonicalDigest({ value });
const instruction = (producerId: string, findingId: string) => ({
  producerId,
  findingId,
  locus: `src/${producerId}.ts:1`,
});

function result(input: {
  id: string;
  head: string;
  coverage: "complete" | "incremental";
  kind?: "attested-local" | "hosted";
  source?: string;
  rubricDigest?: string;
  lineage?: ReviewResult["admission"]["lineage"];
  predecessor?: {
    producerId: string;
    predecessorHead?: string;
    basisHead: string;
    requiredFindings?: readonly ReturnType<typeof instruction>[];
  };
}): ReviewResult {
  const kind = input.kind ?? "hosted";
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("0"),
    diffBaseTree: oid("1"),
    headSha: input.head,
    headTree: oid("2"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: input.rubricDigest ?? digest("r"),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: kind === "attested-local"
      ? [{ sourceKind: "agent", qualifier: "standard-review/v1" }]
      : [{ sourceKind: "hosted", qualifier: input.source ?? "codex-pr" }],
    initialAdmission: kind === "attested-local" ? "checkpoint" : "automatic",
  });
  if (requirement === null) throw new Error("expected standard-review requirement");
  const common = {
    producerId: input.id,
    repositoryId: "repo-1",
    target,
    sourceIdentity: input.source ?? "codex-pr",
    originalOutcome: "clean" as const,
    findings: [],
    resultDigest: digest("f"),
    admission: {
      lineage: input.lineage ?? {
        kind: "candidate",
        candidateId: digest("c"),
      },
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: input.coverage,
      effectiveCoverage: input.coverage,
      scopeMode: "whole-target" as const,
      policyVersion: requirement.policyVersion,
      ...(input.predecessor === undefined
        ? {}
        : {
            correctionScope: {
              schemaVersion: 1 as const,
              predecessorProducerId: input.predecessor.producerId,
              predecessorHeadSha: input.predecessor.predecessorHead ?? input.predecessor.basisHead,
              basisHeadSha: input.predecessor.basisHead,
              headSha: input.head,
              requiredFindings: [...(input.predecessor.requiredFindings ?? [])],
            },
          }),
    },
    requirement,
  };
  if (input.kind === "attested-local") {
    return {
      ...common,
      kind: "attested-local",
      receiptRef: `refs/arc/review/receipts/${input.id}`,
      localSourceRef: `refs/arc/review/local/${input.id}`,
      request: {} as never,
    };
  }
  return {
    ...common,
    kind: "hosted",
    laneOperationId: `lane-${input.id}`,
    actorIdentity: "reviewer",
    hostedTarget: {
      repository: "arc-framework/example",
      pullRequest: 42,
      headSha: input.head,
    },
    hostSettlementFindingIds: [],
    noHostSettlementFindingIds: [],
    settled: false,
  };
}

function harness(results: readonly ReviewResult[]) {
  const byId = new Map(results.map((entry) => [entry.producerId, entry]));
  const readResult = vi.fn(async (producerId: string) => {
    const found = byId.get(producerId);
    if (found === undefined) throw new Error("missing-result");
    return found;
  });
  const resultReader: ReviewResultReader = { readResult };
  const readResponseEvidence = vi.fn<IncrementalCoverageBasisDependencies["readResponseEvidence"]>(async () => ({
    status: "performed" as const,
    requiredFindings: [],
  }));
  const confirmApplicability = vi.fn<IncrementalCoverageBasisDependencies["confirmApplicability"]>(
    async () => "applicable" as const,
  );
  return { resultReader, readResult, readResponseEvidence, confirmApplicability };
}

describe("incremental coverage basis", () => {
  it("accepts a cross-source incremental result rooted in an exact complete producer", async () => {
    const complete = result({ id: "complete-1", head: oid("a"), coverage: "complete", source: "codex-pr" });
    const incremental = result({
      id: "incremental-2",
      head: oid("c"),
      coverage: "incremental",
      kind: "attested-local",
      source: "delegated-agent",
      predecessor: { producerId: complete.producerId, basisHead: complete.target.headSha },
    });
    const dependencies = harness([complete]);

    expect(complete.admission.policyVersion).not.toBe(incremental.admission.policyVersion);

    await expect(resolveIncrementalCoverageBasis(incremental, dependencies)).resolves.toEqual({
      status: "adequate",
      basisProducerId: complete.producerId,
      basisHeadSha: complete.target.headSha,
      producerIds: [complete.producerId, incremental.producerId],
    });
    expect(dependencies.confirmApplicability).toHaveBeenCalledWith(complete, incremental);
  });

  it("accepts an explicitly applicable same-head predecessor", async () => {
    const complete = result({ id: "complete-1", head: oid("a"), coverage: "complete" });
    const incremental = result({
      id: "incremental-2",
      head: complete.target.headSha,
      coverage: "incremental",
      predecessor: { producerId: complete.producerId, basisHead: complete.target.headSha },
    });

    await expect(resolveIncrementalCoverageBasis(incremental, harness([complete])))
      .resolves.toMatchObject({
        status: "adequate",
        basisProducerId: complete.producerId,
      });
  });

  it("does not offer a correction scope until the predecessor applies to the intended head", async () => {
    const predecessor = result({ id: "complete-1", head: oid("a"), coverage: "complete" });
    const dependencies = harness([predecessor]);

    await expect(resolveIncrementalCorrectionScope({
      predecessor,
      currentHeadSha: oid("b"),
    }, {
      ...dependencies,
      confirmCurrentApplicability: async () => "review-required",
    })).resolves.toBeNull();
  });

  it("retains one head-bound lane owner across correction heads and rejects a foreign owner", async () => {
    const predecessorLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand",
      vehicleIdentity: "repair-review-state",
      headSha: oid("a"),
    };
    const complete = result({
      id: "complete-errand",
      head: oid("a"),
      coverage: "complete",
      lineage: predecessorLineage,
    });
    const incremental = result({
      id: "incremental-errand",
      head: oid("b"),
      coverage: "incremental",
      lineage: { ...predecessorLineage, headSha: oid("b") },
      predecessor: { producerId: complete.producerId, basisHead: complete.target.headSha },
    });
    const foreign = {
      ...incremental,
      admission: {
        ...incremental.admission,
        lineage: { ...predecessorLineage, vehicleIdentity: "other-errand", headSha: oid("b") },
      },
    } satisfies ReviewResult;

    await expect(resolveIncrementalCoverageBasis(incremental, harness([complete])))
      .resolves.toMatchObject({ status: "adequate", basisProducerId: complete.producerId });
    await expect(resolveIncrementalCoverageBasis(foreign, harness([complete])))
      .resolves.toMatchObject({ status: "inadequate", reason: "incompatible-lineage" });
  });

  it("rejects an incremental result with no explicit predecessor scope", async () => {
    const incremental = result({ id: "incremental-1", head: oid("b"), coverage: "incremental" });

    await expect(resolveIncrementalCoverageBasis(incremental, harness([]))).resolves.toMatchObject({
      status: "inadequate",
      reason: "missing-correction-scope",
    });
  });

  it("rejects missing, cyclic, incompatible, and discontinuous predecessor chains", async () => {
    const complete = result({ id: "complete", head: oid("a"), coverage: "complete" });
    const incompatible = result({
      id: "incompatible",
      head: oid("b"),
      coverage: "complete",
      rubricDigest: digest("q"),
    });
    const missing = result({
      id: "missing-current",
      head: oid("c"),
      coverage: "incremental",
      predecessor: { producerId: "absent", basisHead: complete.target.headSha },
    });
    const cycleA = result({
      id: "cycle-a",
      head: oid("d"),
      coverage: "incremental",
      predecessor: {
        producerId: "cycle-b",
        predecessorHead: oid("e"),
        basisHead: complete.target.headSha,
      },
    });
    const cycleB = result({
      id: "cycle-b",
      head: oid("e"),
      coverage: "incremental",
      predecessor: {
        producerId: "cycle-a",
        predecessorHead: oid("d"),
        basisHead: complete.target.headSha,
      },
    });
    const discontinuous = result({
      id: "discontinuous",
      head: oid("f"),
      coverage: "incremental",
      predecessor: {
        producerId: complete.producerId,
        predecessorHead: complete.target.headSha,
        basisHead: oid("9"),
      },
    });
    const wrongPredecessorHead = result({
      id: "wrong-predecessor-head",
      head: oid("8"),
      coverage: "incremental",
      predecessor: {
        producerId: complete.producerId,
        predecessorHead: oid("7"),
        basisHead: complete.target.headSha,
      },
    });
    const wrongPolicy = result({
      id: "wrong-policy",
      head: oid("7"),
      coverage: "incremental",
      predecessor: { producerId: incompatible.producerId, basisHead: incompatible.target.headSha },
    });

    await expect(resolveIncrementalCoverageBasis(missing, harness([]))).resolves.toMatchObject({
      status: "inadequate",
      reason: "predecessor-unavailable",
    });
    await expect(resolveIncrementalCoverageBasis(cycleA, harness([cycleA, cycleB]))).resolves.toMatchObject({
      status: "inadequate",
      reason: "cycle",
    });
    await expect(resolveIncrementalCoverageBasis(discontinuous, harness([complete]))).resolves.toMatchObject({
      status: "inadequate",
      reason: "basis-gap",
    });
    await expect(resolveIncrementalCoverageBasis(wrongPredecessorHead, harness([complete])))
      .resolves.toMatchObject({
        status: "inadequate",
        reason: "predecessor-target-mismatch",
      });
    await expect(resolveIncrementalCoverageBasis(wrongPolicy, harness([incompatible]))).resolves.toMatchObject({
      status: "inadequate",
      reason: "incompatible-policy",
    });
  });

  it("requires performed predecessor responses and complete material re-examination", async () => {
    const predecessor = result({ id: "findings-1", head: oid("a"), coverage: "complete" });
    const incremental = result({
      id: "incremental-2",
      head: oid("c"),
      coverage: "incremental",
      predecessor: {
        producerId: predecessor.producerId,
        basisHead: predecessor.target.headSha,
        requiredFindings: [instruction(predecessor.producerId, "F1")],
      },
    });
    const incomplete = harness([predecessor]);
    incomplete.readResponseEvidence.mockResolvedValue({
      status: "incomplete",
      requiredFindings: [instruction(predecessor.producerId, "F1")],
    });
    await expect(resolveIncrementalCoverageBasis(incremental, incomplete)).resolves.toMatchObject({
      status: "inadequate",
      reason: "response-incomplete",
    });

    const omitted = harness([predecessor]);
    omitted.readResponseEvidence.mockResolvedValue({
      status: "performed",
      requiredFindings: [
        instruction(predecessor.producerId, "F1"),
        instruction(predecessor.producerId, "F2"),
      ],
    });
    await expect(resolveIncrementalCoverageBasis(incremental, omitted)).resolves.toMatchObject({
      status: "inadequate",
      reason: "material-finding-omitted",
      findingId: "F2",
    });
  });

  it("memoizes an explicitly shared predecessor traversal", async () => {
    const complete = result({ id: "complete", head: oid("a"), coverage: "complete" });
    const middle = result({
      id: "middle",
      head: oid("b"),
      coverage: "incremental",
      predecessor: { producerId: complete.producerId, basisHead: complete.target.headSha },
    });
    const current = result({
      id: "current",
      head: oid("c"),
      coverage: "incremental",
      predecessor: {
        producerId: middle.producerId,
        predecessorHead: middle.target.headSha,
        basisHead: complete.target.headSha,
        requiredFindings: [instruction(complete.producerId, "F-root")],
      },
    });
    const dependencies = harness([complete, middle]);
    dependencies.readResponseEvidence.mockImplementation(async (predecessor) => ({
      status: "performed",
      requiredFindings: predecessor.producerId === complete.producerId
        ? [instruction(complete.producerId, "F-root")]
        : [],
    }));

    await resolveIncrementalCoverageBasis(current, dependencies);

    expect(dependencies.readResult).toHaveBeenCalledTimes(2);
    expect(dependencies.readResult).toHaveBeenNthCalledWith(1, middle.producerId);
    expect(dependencies.readResult).toHaveBeenNthCalledWith(2, complete.producerId);
    expect(dependencies.confirmApplicability).toHaveBeenNthCalledWith(1, middle, current);
    expect(dependencies.confirmApplicability).toHaveBeenNthCalledWith(2, complete, current);
  });

  it("requires the fresh scope to retain material findings from the complete root", async () => {
    const complete = result({ id: "complete", head: oid("a"), coverage: "complete" });
    const middle = result({
      id: "middle",
      head: oid("b"),
      coverage: "incremental",
      predecessor: {
        producerId: complete.producerId,
        basisHead: complete.target.headSha,
        requiredFindings: [instruction(complete.producerId, "F-root")],
      },
    });
    const current = result({
      id: "current",
      head: oid("c"),
      coverage: "incremental",
      predecessor: {
        producerId: middle.producerId,
        predecessorHead: middle.target.headSha,
        basisHead: complete.target.headSha,
      },
    });
    const dependencies = harness([complete, middle]);
    dependencies.readResponseEvidence.mockImplementation(async (predecessor) => ({
      status: "performed",
      requiredFindings: predecessor.producerId === complete.producerId
        ? [instruction(complete.producerId, "F-root")]
        : [],
    }));

    await expect(resolveIncrementalCoverageBasis(current, dependencies)).resolves.toMatchObject({
      status: "inadequate",
      reason: "material-finding-omitted",
      findingId: "F-root",
    });
  });

  it("does not collapse same-named material findings from different producers", async () => {
    const complete = result({ id: "complete", head: oid("a"), coverage: "complete" });
    const middle = result({
      id: "middle",
      head: oid("b"),
      coverage: "incremental",
      predecessor: {
        producerId: complete.producerId,
        basisHead: complete.target.headSha,
        requiredFindings: [instruction(complete.producerId, "F1")],
      },
    });
    const current = result({
      id: "current",
      head: oid("c"),
      coverage: "incremental",
      predecessor: {
        producerId: middle.producerId,
        predecessorHead: middle.target.headSha,
        basisHead: complete.target.headSha,
        requiredFindings: [instruction(complete.producerId, "F1")],
      },
    });
    const dependencies = harness([complete, middle]);
    dependencies.readResponseEvidence.mockImplementation(async (predecessor) => ({
      status: "performed",
      requiredFindings: [instruction(predecessor.producerId, "F1")],
    }));

    await expect(resolveIncrementalCoverageBasis(current, dependencies)).resolves.toMatchObject({
      status: "inadequate",
      reason: "material-finding-omitted",
      producerId: middle.producerId,
      findingId: "F1",
    });
  });

  it("rejects a material instruction whose locus differs from its producer evidence", async () => {
    const complete = result({ id: "complete", head: oid("a"), coverage: "complete" });
    const incremental = result({
      id: "incremental",
      head: oid("b"),
      coverage: "incremental",
      predecessor: {
        producerId: complete.producerId,
        basisHead: complete.target.headSha,
        requiredFindings: [{
          ...instruction(complete.producerId, "F1"),
          locus: "src/wrong.ts:1",
        }],
      },
    });
    const dependencies = harness([complete]);
    dependencies.readResponseEvidence.mockResolvedValue({
      status: "performed",
      requiredFindings: [instruction(complete.producerId, "F1")],
    });

    await expect(resolveIncrementalCoverageBasis(incremental, dependencies)).resolves.toMatchObject({
      status: "inadequate",
      reason: "material-finding-mismatch",
      producerId: complete.producerId,
      findingId: "F1",
    });
  });
});
