import { describe, expect, it, vi } from "vitest";

import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { ApprovedDispositionRecordSchema } from
  "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import { bindReviewSourceReference } from
  "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import {
  readIncrementalPredecessorResponseEvidence,
  resolveEvidenceBoundReviewPolicy,
  resolveEvidenceBoundReviewPolicyContinuation,
} from
  "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { DeliveryLocalReviewAdmissionSchema } from
  "../../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";

const objectId = (character: string): string => character.repeat(40);
const digest = (value: string): string => canonicalDigest({ value });

const policyTarget = {
  repository: "arc-framework/example",
  pullRequest: 42,
  headSha: objectId("c"),
};

const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  retrigger: "full-final" as const,
  count: 1 as const,
};

function cleanHostedResult(): ReviewResult {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: policyTarget.headSha,
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: standardReview,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  return {
    kind: "hosted",
    producerId: "hosted/attempt-1",
    repositoryId: target.repositoryId,
    target,
    sourceIdentity: "codex-pr",
    originalOutcome: "clean",
    findings: [],
    resultDigest: digest("result"),
    admission: {
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: "example",
        headSha: target.headSha,
      },
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: "whole-target",
      policyVersion: requirement.policyVersion,
    },
    laneOperationId: "lane-progress-standard",
    actorIdentity: "reviewer-1",
    hostedTarget: policyTarget,
    requirement,
    hostSettlementFindingIds: [],
    noHostSettlementFindingIds: [],
    settled: false,
  };
}

function approvedRecord(
  result: ReviewResult,
  judgments: readonly ({
    sourceVerification: "verified";
    verifiedSeverity: "critical" | "major" | "minor";
    disposition: "fix" | "defer" | "reject";
  } | {
    sourceVerification: "not-supported";
    verifiedSeverity: null;
    disposition: "reject";
  })[],
) {
  if (result.kind !== "hosted") throw new Error("expected hosted result");
  const set = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: result.target.targetId,
    producerId: result.producerId,
    resultDigest: result.resultDigest,
    policyVersion: result.admission.policyVersion,
    rubricVersion: result.requirement.rubricVersion,
    rubricDigest: result.requirement.rubricDigest,
    proposedBy: "arc-cli/0.1.0",
    proposedVerification: "full",
    findings: judgments.map((judgment, index) => {
      const finding = result.findings[index];
      if (finding === undefined) throw new Error("missing producer finding");
      const common = {
        findingId: finding.findingId,
        sourceIdentity: result.sourceIdentity,
        locus: finding.locus,
        verificationRefs: [`source:${finding.locus}`],
        reportedSeverity: finding.severity,
        rationale: "The source check established this disposition.",
        recommendation: "Record the approved response.",
        openQuestions: [],
      };
      return judgment.sourceVerification === "verified"
        ? { ...common, ...judgment }
        : { ...common, ...judgment };
    }),
  });
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(set),
    approvedBy: "andrew",
    approvedAt: "2026-09-09T20:00:00Z",
  });
  return ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: result.repositoryId,
    operationId: result.producerId,
    candidate: null,
    errand: null,
    deliveryMember: null,
    source: {
      kind: "hosted",
      attemptRef: bindReviewSourceReference({
        kind: "hosted",
        operationId: result.laneOperationId,
        durableRef: result.producerId,
      }),
      hostedResultId: result.resultDigest,
    },
    currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
    approvedDispositionLineage: [{
      approvedDisposition,
      responsePolicyRequest: responsePolicyRequestFixture({
        headSha: result.target.headSha,
        sourceId: result.sourceIdentity,
        reviewOperationId: result.producerId,
      }),
      fixAuthorization: null,
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
      predecessorDispositionSetId: null,
      successorDispositionSetId: null,
    }],
  });
}

function findingsHostedResult(
  severities: readonly ("critical" | "major" | "minor")[],
): ReviewResult {
  const clean = cleanHostedResult();
  return {
    ...clean,
    originalOutcome: "findings",
    findings: severities.map((severity, index) => ({
      findingId: `finding-${index + 1}`,
      severity,
      locus: `src/example.ts:${index + 1}`,
      evidenceUrlOrId: `hosted:finding-${index + 1}`,
      sourceOrdinal: index + 1,
    })),
    resultDigest: digest(`result-${severities.join("-")}`),
  };
}

function chunkedLocalAggregateResult(): ReviewResult {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: policyTarget.headSha,
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: standardReview,
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  const request = createReviewRequest(target, {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requirementId: requirement.requirementId,
    carrier: { kind: "local-change-set", adapterId: "delegated-agent", changeRequestId: null },
    authorIdentity: "andrew",
    evaluatorIdentity: "codex",
    lineageId: digest("lineage"),
    logicalPass: 1,
    generation: 0,
    requestMechanism: "subagent",
  });
  const deliveryAdmission = DeliveryLocalReviewAdmissionSchema.parse({
    schemaVersion: 1,
    sourceId: "delegated-agent",
    statusTarget: {
      repository: policyTarget.repository,
      headRef: "feature/example",
      headSha: policyTarget.headSha,
    },
    target: policyTarget,
    vehicle: {
      kind: "delivery-member",
      planId: "123e4567-e89b-12d3-a456-426614174000",
      deliverableId: digest("deliverable"),
      workUnitId: "example",
      head: policyTarget.headSha,
    },
    pass: 1,
    scopeSelection: { mode: "chunked", target: policyTarget },
  });
  const findings = ["major", "minor"].map((severity, index) => ({
    findingId: `aggregate-finding-${index + 1}`,
    severity: severity as "major" | "minor",
    locus: `src/chunk-${index + 1}.ts:1`,
    evidenceUrlOrId: `local:chunk-${index + 1}`,
    sourceOrdinal: index + 1,
  }));
  return {
    kind: "attested-local",
    producerId: "local/aggregate-1",
    repositoryId: target.repositoryId,
    target,
    sourceIdentity: "delegated-agent",
    originalOutcome: "findings",
    findings,
    resultDigest: digest("local-aggregate-result"),
    admission: {
      lineage: {
        kind: "delivery-member",
        planId: deliveryAdmission.vehicle.planId,
        deliverableId: deliveryAdmission.vehicle.deliverableId,
        workUnitId: deliveryAdmission.vehicle.workUnitId,
      },
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: "chunked",
      policyVersion: requirement.policyVersion,
    },
    receiptRef: "receipts/local-aggregate-1.json",
    localSourceRef: "sources/local-aggregate-1.json",
    requirement,
    request,
    deliveryAdmission,
  };
}

function approvedLocalRecord(result: Extract<ReviewResult, { kind: "attested-local" }>) {
  const set = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: result.target.targetId,
    producerId: result.producerId,
    resultDigest: result.resultDigest,
    policyVersion: result.admission.policyVersion,
    rubricVersion: result.requirement.rubricVersion,
    rubricDigest: result.requirement.rubricDigest,
    proposedBy: "arc-cli/0.1.0",
    proposedVerification: "full",
    findings: result.findings.map((finding) => ({
      findingId: finding.findingId,
      sourceIdentity: result.sourceIdentity,
      locus: finding.locus,
      verificationRefs: [`source:${finding.locus}`],
      reportedSeverity: finding.severity,
      sourceVerification: "verified" as const,
      verifiedSeverity: finding.severity,
      rationale: "The complete aggregate established this disposition.",
      recommendation: "Record the approved response.",
      disposition: "fix" as const,
      openQuestions: [],
    })),
  });
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(set),
    approvedBy: "andrew",
    approvedAt: "2026-09-09T20:00:00Z",
  });
  return ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: result.repositoryId,
    operationId: result.producerId,
    candidate: null,
    errand: null,
    deliveryMember: null,
    source: {
      kind: "attested-local",
      receiptRef: bindReviewSourceReference({
        kind: "attested-local",
        operationId: result.producerId,
        durableRef: result.receiptRef,
      }),
      localSourceRef: result.localSourceRef,
    },
    currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
    approvedDispositionLineage: [{
      approvedDisposition,
      responsePolicyRequest: responsePolicyRequestFixture({
        headSha: result.target.headSha,
        sourceId: result.sourceIdentity,
        reviewOperationId: result.producerId,
      }),
      fixAuthorization: null,
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
      predecessorDispositionSetId: null,
      successorDispositionSetId: null,
    }],
  });
}

function dependencies(
  result: ReviewResult,
  disposition = null as ReturnType<typeof approvedRecord> | null,
  currentTarget: ReviewResult["target"] = result.target,
) {
  const resultReader: ReviewResultReader = {
    readResult: vi.fn(async () => result),
  };
  const dispositionStore: ApprovedDispositionRecordStore = {
    readDispositionRecord: vi.fn(async () => disposition),
    appendDispositionRecord: vi.fn(async () => {
      throw new Error("not used");
    }),
  };
  return {
    resultReader,
    dispositionStore,
    confirmTarget: vi.fn(async () => currentTarget),
  };
}

describe("evidence-bound review policy", () => {
  function cleanRequest(result: ReviewResult) {
    return {
      schemaVersion: 1 as const,
      target: policyTarget,
      lane: "standard" as const,
      standardReview,
      completedPasses: 1,
      attempts: [{
        sourceId: "codex-pr",
        outcome: "clean" as const,
        reviewOperationId: result.producerId,
      }],
    };
  }

  function findingsRequest(result: ReviewResult) {
    return {
      ...cleanRequest(result),
      attempts: [{
        sourceId: "codex-pr",
        outcome: "findings" as const,
        reviewOperationId: result.producerId,
      }],
    };
  }

  it("qualifies material re-examination instructions with immutable producer evidence", async () => {
    const result = findingsHostedResult(["major", "minor"]);
    const record = approvedRecord(result, [
      { sourceVerification: "verified", verifiedSeverity: "major", disposition: "reject" },
      { sourceVerification: "verified", verifiedSeverity: "minor", disposition: "reject" },
    ]);
    const store = dependencies(result, record).dispositionStore;

    await expect(readIncrementalPredecessorResponseEvidence(result, store)).resolves.toEqual({
      status: "performed",
      requiredFindings: [{
        producerId: result.producerId,
        findingId: "finding-1",
        locus: "src/example.ts:1",
      }],
    });
  });

  it("admits clean convergence only from the exact immutable producer", async () => {
    const result = cleanHostedResult();
    await expect(resolveEvidenceBoundReviewPolicy(cleanRequest(result), {
      ...dependencies(result),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).resolves.toMatchObject({
      state: "pass-complete",
      nextAction: "none",
      payload: {
        verifiedTerminalSignal: {
          reviewOperationId: result.producerId,
          confirmedFindingCount: 0,
          maxConfirmedSeverity: null,
          coverageAdequate: true,
        },
      },
    });
  });

  it("starts a fresh logical pass only after a material response is durably performed", async () => {
    const result = findingsHostedResult(["major"]);
    const record = approvedRecord(result, [{
      sourceVerification: "verified",
      verifiedSeverity: "major",
      disposition: "fix",
    }]);
    const request = findingsRequest(result);
    const evidence = {
      ...dependencies(result, record),
      sources: ["codex-pr"],
      maxPasses: 2,
    };

    await expect(resolveEvidenceBoundReviewPolicyContinuation(request, {
      terminalResponsePerformed: false,
    }, evidence)).resolves.toMatchObject({
      state: "findings",
      nextAction: "respond",
    });
    await expect(resolveEvidenceBoundReviewPolicyContinuation(request, {
      terminalResponsePerformed: true,
    }, evidence)).resolves.toMatchObject({
      state: "ready",
      nextAction: "hosted-request",
      payload: { pass: 2, sourceId: "codex-pr" },
    });
  });

  it("applies a ceiling override only after the terminal response opens the fresh pass", async () => {
    const result = findingsHostedResult(["major"]);
    const record = approvedRecord(result, [{
      sourceVerification: "verified",
      verifiedSeverity: "major",
      disposition: "fix",
    }]);
    await expect(resolveEvidenceBoundReviewPolicyContinuation({
      ...findingsRequest(result),
      ceilingOverride: {
        target: policyTarget,
        lane: "standard",
        exhaustedPassCount: 1,
        nextPass: 2,
      },
    }, {
      terminalResponsePerformed: true,
    }, {
      ...dependencies(result, record),
      sources: ["codex-pr"],
      maxPasses: 1,
    })).resolves.toMatchObject({
      state: "ready",
      nextAction: "hosted-request",
      payload: { pass: 2, sourceId: "codex-pr", ceilingOverrideApplied: true },
    });
  });

  it.each([
    {
      name: "current target",
      arrange: (result: ReviewResult) => {
        const { targetId: _targetId, ...targetInput } = result.target;
        void _targetId;
        return {
          request: cleanRequest(result),
          result,
          currentTarget: createReviewTarget({
            ...targetInput,
            headSha: objectId("e"),
            headTree: objectId("f"),
          }),
        };
      },
      message: /current exact target/u,
    },
    {
      name: "source",
      arrange: (result: ReviewResult) => ({
        request: cleanRequest(result),
        result: { ...result, sourceIdentity: "coderabbit-pr" },
        currentTarget: result.target,
      }),
      message: /producer source/u,
    },
    {
      name: "logical pass",
      arrange: (result: ReviewResult) => ({
        request: cleanRequest(result),
        result: { ...result, admission: { ...result.admission, logicalPass: 2 } },
        currentTarget: result.target,
      }),
      message: /logical pass/u,
    },
    {
      name: "original outcome",
      arrange: (result: ReviewResult) => ({
        request: {
          ...cleanRequest(result),
          attempts: [{
            sourceId: "codex-pr",
            outcome: "findings" as const,
            reviewOperationId: result.producerId,
          }],
        },
        result,
        currentTarget: result.target,
      }),
      message: /producer outcome/u,
    },
    {
      name: "policy",
      arrange: (result: ReviewResult) => ({
        request: cleanRequest(result),
        result: {
          ...result,
          admission: { ...result.admission, policyVersion: digest("other-policy") },
        },
        currentTarget: result.target,
      }),
      message: /policy or rubric/u,
    },
    {
      name: "rubric",
      arrange: (result: ReviewResult) => ({
        request: {
          ...cleanRequest(result),
          standardReview: { ...standardReview, rubricDigest: digest("other-rubric") },
        },
        result,
        currentTarget: result.target,
      }),
      message: /policy or rubric/u,
    },
    {
      name: "scope",
      arrange: (result: ReviewResult) => ({
        request: {
          ...cleanRequest(result),
          scopeSelection: { mode: "chunked" as const, target: policyTarget },
        },
        result,
        currentTarget: result.target,
      }),
      message: /producer scope/u,
    },
  ])("rejects a terminal producer with the wrong $name binding", async ({ arrange, message }) => {
    const records = arrange(cleanHostedResult());
    await expect(resolveEvidenceBoundReviewPolicy(records.request, {
      ...dependencies(records.result, null, records.currentTarget),
      sources: ["codex-pr", "coderabbit-pr"],
      maxPasses: 2,
    })).rejects.toThrow(message);
  });

  it.each(["missing-result", "ambiguous-result"])(
    "refuses a %s producer read",
    async (reason) => {
      const result = cleanHostedResult();
      const deps = dependencies(result);
      deps.resultReader.readResult = vi.fn(async () => {
        throw new Error(reason);
      });
      await expect(resolveEvidenceBoundReviewPolicy(cleanRequest(result), {
        ...deps,
        sources: ["codex-pr"],
        maxPasses: 2,
      })).rejects.toThrow(reason);
    },
  );

  it.each([
    {
      name: "all findings refuted",
      severity: "critical" as const,
      judgment: {
        sourceVerification: "not-supported" as const,
        verifiedSeverity: null,
        disposition: "reject" as const,
      },
      count: 0,
      maximum: null,
    },
    {
      name: "only confirmed minors",
      severity: "major" as const,
      judgment: {
        sourceVerification: "verified" as const,
        verifiedSeverity: "minor" as const,
        disposition: "fix" as const,
      },
      count: 1,
      maximum: "minor" as const,
    },
  ])("converges after $name", async ({ severity, judgment, count, maximum }) => {
    const result = findingsHostedResult([severity]);
    const record = approvedRecord(result, [judgment]);
    await expect(resolveEvidenceBoundReviewPolicy(findingsRequest(result), {
      ...dependencies(result, record),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).resolves.toMatchObject({
      state: "pass-complete",
      nextAction: "none",
      payload: {
        verifiedTerminalSignal: {
          confirmedFindingCount: count,
          maxConfirmedSeverity: maximum,
        },
      },
    });
  });

  it.each(["fix", "defer", "reject"] as const)(
    "retains confirmed material signal after an approved %s disposition",
    async (disposition) => {
      const result = findingsHostedResult(["major"]);
      const record = approvedRecord(result, [{
        sourceVerification: "verified",
        verifiedSeverity: "major",
        disposition,
      }]);
      await expect(resolveEvidenceBoundReviewPolicy(findingsRequest(result), {
        ...dependencies(result, record),
        sources: ["codex-pr"],
        maxPasses: 2,
      })).resolves.toMatchObject({
        state: "findings",
        nextAction: "respond",
        payload: {
          postResponseAction: "resolve-next-pass",
          verifiedTerminalSignal: {
            confirmedFindingCount: 1,
            maxConfirmedSeverity: "major",
          },
        },
      });
    },
  );

  it("computes the maximum only across source-verified findings", async () => {
    const result = findingsHostedResult(["critical", "major", "minor"]);
    const record = approvedRecord(result, [
      {
        sourceVerification: "not-supported",
        verifiedSeverity: null,
        disposition: "reject",
      },
      {
        sourceVerification: "verified",
        verifiedSeverity: "major",
        disposition: "defer",
      },
      {
        sourceVerification: "verified",
        verifiedSeverity: "minor",
        disposition: "fix",
      },
    ]);
    await expect(resolveEvidenceBoundReviewPolicy(findingsRequest(result), {
      ...dependencies(result, record),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).resolves.toMatchObject({
      state: "findings",
      payload: {
        verifiedTerminalSignal: {
          confirmedFindingCount: 2,
          maxConfirmedSeverity: "major",
        },
      },
    });
  });

  it("admits one complete manual chunk aggregate with its full approved finding set", async () => {
    const result = chunkedLocalAggregateResult();
    if (result.kind !== "attested-local") throw new Error("expected local result");
    const record = approvedLocalRecord(result);
    await expect(resolveEvidenceBoundReviewPolicy({
      schemaVersion: 1,
      target: policyTarget,
      lane: "standard",
      standardReview,
      completedPasses: 1,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "findings",
        reviewOperationId: result.producerId,
        chunkSeriesComplete: true,
      }],
      scopeSelection: { mode: "chunked", target: policyTarget },
    }, {
      ...dependencies(result, record),
      sources: ["delegated-agent"],
      maxPasses: 2,
    })).resolves.toMatchObject({
      state: "findings",
      nextAction: "respond",
      payload: {
        verifiedTerminalSignal: {
          reviewOperationId: result.producerId,
          confirmedFindingCount: 2,
          maxConfirmedSeverity: "major",
          coverageAdequate: true,
        },
      },
    });
  });

  it("selects coverage while preserving a findings response plan for unbased incremental evidence", async () => {
    const original = findingsHostedResult(["critical"]);
    if (original.kind !== "hosted") throw new Error("expected hosted result");
    const requirement = createReviewRequirement({
      target: original.target,
      projection: { ...standardReview, retrigger: "incremental" },
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("expected requirement");
    const result: ReviewResult = {
      ...original,
      requirement,
      admission: {
        ...original.admission,
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
        policyVersion: requirement.policyVersion,
      },
    };
    const record = approvedRecord(result, [{
      sourceVerification: "verified",
      verifiedSeverity: "critical",
      disposition: "fix",
    }]);
    await expect(resolveEvidenceBoundReviewPolicy({
      ...findingsRequest(result),
      standardReview: { ...standardReview, retrigger: "incremental" },
    }, {
      ...dependencies(result, record),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).resolves.toMatchObject({
      state: "coverage-required",
      nextAction: "select-coverage",
      payload: {
        consumedPass: true,
        responseRequired: true,
        verifiedTerminalSignal: {
          maxConfirmedSeverity: "critical",
          coverageAdequate: false,
        },
      },
    });
  });

  it("derives adequate incremental coverage from an explicit applicable complete predecessor", async () => {
    const predecessor = cleanHostedResult();
    const current = cleanHostedResult();
    if (current.kind !== "hosted") throw new Error("expected hosted result");
    const incrementalTarget = createReviewTarget({
      schemaVersion: current.target.schemaVersion,
      semanticsVersion: current.target.semanticsVersion,
      kind: current.target.kind,
      repositoryId: current.target.repositoryId,
      baseRef: current.target.baseRef,
      diffBaseSha: current.target.diffBaseSha,
      diffBaseTree: current.target.diffBaseTree,
      headSha: objectId("e"),
      headTree: objectId("f"),
    });
    const incrementalRequirement = createReviewRequirement({
      target: incrementalTarget,
      projection: standardReview,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    if (incrementalRequirement === null) throw new Error("expected requirement");
    const incremental: ReviewResult = {
      ...current,
      producerId: "hosted/attempt-2",
      target: incrementalTarget,
      hostedTarget: { ...current.hostedTarget, headSha: objectId("e") },
      requirement: incrementalRequirement,
      admission: {
        ...current.admission,
        logicalPass: 2,
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
        correctionScope: {
          schemaVersion: 1,
          predecessorProducerId: predecessor.producerId,
          basisHeadSha: predecessor.target.headSha,
          predecessorHeadSha: predecessor.target.headSha,
          headSha: incrementalTarget.headSha,
          requiredFindings: [],
        },
      },
    };
    const evidence = dependencies(incremental);
    evidence.resultReader.readResult = vi.fn(async (producerId: string) => (
      producerId === predecessor.producerId ? predecessor : incremental
    ));

    await expect(resolveEvidenceBoundReviewPolicy({
      ...cleanRequest(incremental),
      target: { ...policyTarget, headSha: incremental.target.headSha },
      completedPasses: 2,
    }, {
      ...evidence,
      confirmTarget: vi.fn(async () => incremental.target),
      confirmIncrementalApplicability: vi.fn(async () => "applicable" as const),
      sources: ["codex-pr"],
      maxPasses: 3,
    })).resolves.toMatchObject({
      state: "pass-complete",
      payload: { verifiedTerminalSignal: { coverageAdequate: true } },
    });
  });

  it("recognizes an exact same-head predecessor without external applicability evidence", async () => {
    const predecessor = cleanHostedResult();
    const incremental: ReviewResult = {
      ...predecessor,
      producerId: "hosted/attempt-same-head",
      admission: {
        ...predecessor.admission,
        logicalPass: 2,
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
        correctionScope: {
          schemaVersion: 1,
          predecessorProducerId: predecessor.producerId,
          predecessorHeadSha: predecessor.target.headSha,
          basisHeadSha: predecessor.target.headSha,
          headSha: predecessor.target.headSha,
          requiredFindings: [],
        },
      },
    };
    const evidence = dependencies(incremental);
    evidence.resultReader.readResult = vi.fn(async (producerId: string) => (
      producerId === predecessor.producerId ? predecessor : incremental
    ));

    await expect(resolveEvidenceBoundReviewPolicy({
      ...cleanRequest(incremental),
      completedPasses: 2,
    }, {
      ...evidence,
      sources: ["codex-pr"],
      maxPasses: 3,
    })).resolves.toMatchObject({
      state: "pass-complete",
      payload: { verifiedTerminalSignal: { coverageAdequate: true } },
    });
  });

  it("refuses missing, unbound, or incomplete approved finding sets", async () => {
    const result = findingsHostedResult(["major", "minor"]);
    await expect(resolveEvidenceBoundReviewPolicy(findingsRequest(result), {
      ...dependencies(result),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).rejects.toThrow(/no approved disposition record/u);

    const incomplete = approvedRecord(result, [{
      sourceVerification: "verified",
      verifiedSeverity: "major",
      disposition: "fix",
    }]);
    await expect(resolveEvidenceBoundReviewPolicy(findingsRequest(result), {
      ...dependencies(result, incomplete),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).rejects.toThrow(/do not match the immutable producer result/u);

    const unrelatedResult = findingsHostedResult(["major"]);
    const unrelated = approvedRecord(unrelatedResult, [{
      sourceVerification: "verified",
      verifiedSeverity: "major",
      disposition: "fix",
    }]);
    await expect(resolveEvidenceBoundReviewPolicy(findingsRequest(result), {
      ...dependencies(result, unrelated),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).rejects.toThrow();
  });

  it("rejects caller-authored summaries and multi-producer terminal assertions", async () => {
    const result = findingsHostedResult(["major"]);
    const request = findingsRequest(result);
    await expect(resolveEvidenceBoundReviewPolicy({
      ...request,
      confirmedFindingCount: 0,
      maxConfirmedSeverity: null,
    }, {
      ...dependencies(result),
      sources: ["codex-pr"],
      maxPasses: 2,
    })).rejects.toThrow(/unrecognized key/iu);
    await expect(resolveEvidenceBoundReviewPolicy({
      ...request,
      attempts: [
        {
          sourceId: "coderabbit-pr",
          outcome: "findings",
          reviewOperationId: "hosted/attempt-other",
        },
        ...request.attempts,
      ],
    }, {
      ...dependencies(result, approvedRecord(result, [{
        sourceVerification: "verified",
        verifiedSeverity: "major",
        disposition: "fix",
      }])),
      sources: ["coderabbit-pr", "codex-pr"],
      maxPasses: 2,
    })).rejects.toThrow(/no source may be attempted after a non-fall-through outcome/u);
  });
});
