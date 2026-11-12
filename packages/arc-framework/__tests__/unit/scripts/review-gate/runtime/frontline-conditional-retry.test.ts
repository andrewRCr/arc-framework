import { describe, expect, it, vi } from "vitest";

import { handleReviewFrontlineRun } from "../../../../../src/handlers/review.js";
import { FrontlineRunCommandRequestSchema } from "../../../../../src/scripts/review-gate/core/frontline-run-command-schema.js";
import { FrontlineResolveRequestSchema, resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { frontlineRetryCeilingOverride } from "../../../../../src/scripts/review-gate/core/frontline-retry-contract.js";
import type { LaneSubjectLineage } from "../../../../../src/scripts/review-gate/core/lane-admission.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  ReviewOperationStateSchema,
  type ReviewOperationState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type {
  FrontlineOutcomeStore,
  ReviewOperationStateStore,
  ReviewOperationStateSnapshotIndex,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import {
  laneProgressOperationId,
  recordLaneAttempt,
  captureConditionalNextPassAuthorization,
  settleLaneAttempt,
} from "../../../../../src/scripts/review-gate/lane-progress.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import type { ResponseHeadContinuationInput } from "../../../../../src/scripts/review-gate/core/response-head-continuation.js";
import { runFrontlineReviewCommand } from "../../../../../src/scripts/review-gate/runtime/frontline-run-command.js";

const oid = (value: string): string => value.repeat(40);
const target = (head: string, kind: "change-set" | "delivery-member" = "change-set") => createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind,
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha: oid(head),
  headTree: oid(head),
});
const source = {
  sourceId: "review-cli",
  kind: "command" as const,
  executable: "reviewer",
  argv: ["--plain"],
};
const routingFacts = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
} as const;
const defaultLineage = {
  kind: "candidate" as const,
  candidateId: canonicalDigest({ candidate: "frontline-run" }),
};
function memoryStores(): {
  operationStore: ReviewOperationStateStore & ReviewOperationStateSnapshotIndex;
  outcomeStore: FrontlineOutcomeStore;
  withOperationLock<T>(
    operationId: string,
    maxWaitMs: number,
    action: () => Promise<T>,
  ): Promise<T>;
} {
  const operations = new Map<string, { version: number; state: ReviewOperationState }>();
  const outcomes = new Map<string, {
    version: number;
    record: Parameters<FrontlineOutcomeStore["appendOutcome"]>[0];
    outcomeRef: string;
  }>();
  return {
    withOperationLock: <T>(
      _operationId: string,
      _maxWaitMs: number,
      action: () => Promise<T>,
    ) => action(),
    operationStore: {
      readOperationSnapshot: async () => ({ status: "complete" as const, records: [...operations.values()] }),
      readOperation: async (operationId) => operations.get(operationId) ?? { version: 0, state: null },
      publishOperation: async (state, expectedVersion) => {
        const current = operations.get(state.operationId);
        if ((current?.version ?? 0) !== expectedVersion) throw new Error("version-conflict");
        operations.set(state.operationId, {
          version: expectedVersion + 1,
          state: ReviewOperationStateSchema.parse(state),
        });
        return { version: expectedVersion + 1 };
      },
    },
    outcomeStore: {
      readOutcome: async (operationId) => outcomes.get(operationId) ?? {
        version: 0,
        record: null,
        outcomeRef: null,
      },
      appendOutcome: async (record, expectedVersion) => {
        const current = outcomes.get(record.operationId);
        if ((current?.version ?? 0) !== expectedVersion) throw new Error("version-conflict");
        const outcomeRef = `outcomes/${record.operationId}.json`;
        outcomes.set(record.operationId, {
          version: expectedVersion + 1,
          record,
          outcomeRef,
        });
        return { version: expectedVersion + 1, outcomeRef };
      },
    },
  };
}


async function conditionalFixture(
  invocationMode: "inherit" | "force" = "force",
  sourceTier: "invocation" | "developer" | "project" = "invocation",
  failureCount = 2,
  headContinuation = false,
  errandResponse = false,
) {
  const initialTarget = target("c");
  const reviewTarget = headContinuation || errandResponse ? target("e") : initialTarget;
  const lineageFor = (reviewTarget: { headSha: string }): LaneSubjectLineage => errandResponse ? {
    kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "5".repeat(32), headSha: reviewTarget.headSha,
  } : defaultLineage;
  const initialLineage = lineageFor(initialTarget);
  const reviewLineage = lineageFor(reviewTarget);
  const stores = memoryStores();
  const resolverDependencies = {
    operationStore: stores.operationStore,
    preferences: {
      readDeveloperSourceIds: async () => sourceTier === "developer" ? [source.sourceId] : [],
      readProjectSourceIds: async () => sourceTier === "project" ? [source.sourceId] : [],
    },
    registry: new FrontlineSourceRegistry([{
      sourceId: source.sourceId, descriptor: { kind: source.kind, executable: source.executable, argv: source.argv },
    }]),
    resolveLineage: async (reviewTarget: { headSha: string }) => lineageFor(reviewTarget),
    resolveSupersessionAncestors: async () => [],
    withLaneOperationLock: async <T>(_id: string, action: () => Promise<T>) => action(),
    confirmDispositionSetCurrent: async () => true,
    confirmResponseHeadContinuation: vi.fn(async (input: ResponseHeadContinuationInput) => headContinuation
      && input.repositoryId === initialTarget.repositoryId
      && input.fromHeadSha === initialTarget.headSha && input.toHeadSha === reviewTarget.headSha
      && input.producerId === producer?.operationId && input.dispositionSetId === dispositionSetId),
    readSettledFindingsAdvice: async () => ({
      action: "follow-up-after-fix" as const, pass: 2, maxPasses: 2, nextCommand: "frontline-resolve" as const,
    }),
    readMaxPasses: async () => 1,
    now: () => "2026-08-15T12:00:00Z",
  };
  const request = {
    schemaVersion: 1 as const, target: reviewTarget, changeSet: routingFacts,
    invocation: {
      mode: invocationMode,
      ...(sourceTier === "invocation" ? { sourceId: source.sourceId } : {}),
    },
  };
  const first = await resolveFrontlineCommand({ ...request, target: initialTarget }, resolverDependencies);
  const producer = first.payload.admission;
  if (producer === undefined) throw new Error("expected first admission");
  await recordLaneAttempt(stores.operationStore, {
    lane: "frontline", repositoryId: initialTarget.repositoryId, changeRequestId: null,
    headSha: initialTarget.headSha, lineage: initialLineage, logicalPass: 1, retryGeneration: 0,
    attemptId: producer.operationId, sourceId: source.sourceId, outcome: "findings", consumedPass: true, advancePendingAttempt: true,
    frontline: { admission: producer, effectiveCoverage: "complete" }, now: resolverDependencies.now(),
  });
  const dispositionSetId = canonicalDigest({ disposition: "fixed" });
  const authorization = await captureConditionalNextPassAuthorization(stores.operationStore, {
    lane: "frontline", repositoryId: initialTarget.repositoryId, headSha: initialTarget.headSha,
    lineage: initialLineage, producerId: producer.operationId, dispositionSetId, authorizedBy: "owner-1",
    exhaustedPassCount: 1, nextPass: 2, now: resolverDependencies.now(),
  });
  await settleLaneAttempt(stores.operationStore, {
    lane: "frontline", repositoryId: initialTarget.repositoryId, headSha: initialTarget.headSha,
    lineage: initialLineage, attemptId: producer.operationId, dispositionSetId,
    producedHeadSha: errandResponse ? reviewTarget.headSha : initialTarget.headSha, now: resolverDependencies.now(),
  });
  const policyJudgment = { ceilingOverride: {
    exhaustedPassCount: 1, nextPass: 2, conditionalPassAuthorizationId: authorization.authorizationId,
  } };
  const admitted = await resolveFrontlineCommand({ ...request, policyJudgment }, resolverDependencies);
  const execute = vi.fn(async (input: { pass: number; maxPasses: number }) => ({
    outcome: normalizeFrontlineOutcome({
      providerResult: execute.mock.calls.length <= failureCount ? { kind: "timed-out" } : { kind: "clean" },
      source, target: reviewTarget, pass: input.pass, maxPasses: input.maxPasses,
    }),
    executableIdentity: execute.mock.calls.length <= failureCount ? null : {
      digest: canonicalDigest({ executable: "reviewer" }), qualifiedVersion: "reviewer/1.0.0",
    },
  }));
  const runDependencies = {
    ...stores, execute, now: resolverDependencies.now, confirmSource: async () => source,
    prepareExecutionTarget: async () => ({ target: reviewTarget, reviewRoot: "/tmp/review", release: vi.fn() }),
  };
  const timedOut = await runFrontlineReviewCommand({ schemaVersion: 1, target: reviewTarget, resolution: admitted }, runDependencies);
  return { request, policyJudgment, admitted, timedOut, execute, runDependencies, resolverDependencies, stores, reviewTarget, initialTarget, initialLineage, reviewLineage };
}

describe("conditional frontline retries", () => {
  it.each([false, true])("continues the same above-ceiling pass with manual grant carry=%s", async (manualCarry) => {
    const f = await conditionalFixture();
    let resolution = f.admitted;
    let prior = f.timedOut;
    for (let generation = 1; generation <= 2; generation += 1) {
      const write = vi.fn();
      const setExitCode = vi.fn();
      const publicTarget = {
        kind: f.reviewTarget.kind, baseRef: f.reviewTarget.baseRef,
        diffBaseSha: f.reviewTarget.diffBaseSha, headSha: f.reviewTarget.headSha,
      };
      await handleReviewFrontlineRun("-", {
        resolveRoot: () => "/repo",
        readText: async () => JSON.stringify({
          schemaVersion: 1, target: publicTarget, resolution, retryOfOperationId: prior.payload.operationId,
        }),
        deriveRequest: async (request) => FrontlineRunCommandRequestSchema.parse({ ...request, target: f.reviewTarget }),
        run: (request) => runFrontlineReviewCommand(request, f.runDependencies), write, setExitCode,
      });
      const refusal = JSON.parse(String(write.mock.calls[0]?.[0]));
      expect(setExitCode).toHaveBeenCalledWith(1);
      expect(f.execute).toHaveBeenCalledTimes(generation);
      if (!manualCarry) expect(refusal.remedy.stdin.policyJudgment).toEqual(f.policyJudgment);
      const remedy = FrontlineResolveRequestSchema.parse({
        ...refusal.remedy.stdin, ...(manualCarry ? { policyJudgment: f.policyJudgment } : {}),
      });
      resolution = await resolveFrontlineCommand({ ...remedy, target: f.reviewTarget }, f.resolverDependencies);
      expect(resolution.payload.admission).toMatchObject({ logicalPass: 2, retryGeneration: generation, maxPasses: 2 });
      prior = await runFrontlineReviewCommand({
        schemaVersion: 1, target: f.reviewTarget, resolution, retryOfOperationId: prior.payload.operationId,
      }, f.runDependencies);
    }
    expect(prior.state).toBe("clean");
    expect(f.execute).toHaveBeenCalledTimes(3);
    await expect(f.stores.operationStore.readOperation(laneProgressOperationId({
      lane: "frontline", repositoryId: f.reviewTarget.repositoryId, headSha: f.reviewTarget.headSha, lineage: defaultLineage,
    }))).resolves.toMatchObject({ state: {
      completedPasses: 2,
      attempts: expect.arrayContaining([expect.objectContaining({
        conditionalPassAuthorizations: expect.objectContaining({ authorizations: [expect.objectContaining({
          authorizationId: f.policyJudgment.ceilingOverride.conditionalPassAuthorizationId,
          status: "consumed", admissionId: f.timedOut.payload.operationId,
        })] }),
      })]),
    } });
  });

  it.each([
    ["inherit", "invocation"], ["inherit", "developer"], ["inherit", "project"],
    ["force", "invocation"], ["force", "developer"], ["force", "project"],
  ] as const)("preserves %s invocation and %s source selection above the ceiling", async (mode, tier) => {
    const f = await conditionalFixture(mode, tier, 1);
    const write = vi.fn();
    const publicTarget = {
      kind: f.reviewTarget.kind, baseRef: f.reviewTarget.baseRef,
      diffBaseSha: f.reviewTarget.diffBaseSha, headSha: f.reviewTarget.headSha,
    };
    await handleReviewFrontlineRun("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1, target: publicTarget, resolution: f.admitted,
        retryOfOperationId: f.timedOut.payload.operationId,
      }),
      deriveRequest: async (request) => FrontlineRunCommandRequestSchema.parse({ ...request, target: f.reviewTarget }),
      run: (request) => runFrontlineReviewCommand(request, f.runDependencies), write, setExitCode: vi.fn(),
    });
    const refusal = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(refusal.remedy.stdin.invocation).toEqual(f.request.invocation);
    expect(refusal.remedy.stdin.policyJudgment).toEqual(f.policyJudgment);
    expect(f.execute).toHaveBeenCalledOnce();
    const retryResolution = await resolveFrontlineCommand({
      ...FrontlineResolveRequestSchema.parse(refusal.remedy.stdin), target: f.reviewTarget,
    }, f.resolverDependencies);
    const original = f.admitted.payload.admission;
    expect(retryResolution.payload.admission).toMatchObject({
      logicalPass: 2, retryGeneration: 1, maxPasses: 2,
      policyVersion: original?.policyVersion, frontlineReview: original?.frontlineReview,
    });
    await expect(runFrontlineReviewCommand({
      schemaVersion: 1, target: f.reviewTarget, resolution: retryResolution,
      retryOfOperationId: f.timedOut.payload.operationId,
    }, f.runDependencies)).resolves.toMatchObject({ state: "clean", nextAction: "none" });
    expect(f.execute).toHaveBeenCalledTimes(2);
    await expect(f.stores.operationStore.readOperation(laneProgressOperationId({
      lane: "frontline", repositoryId: f.reviewTarget.repositoryId, headSha: f.reviewTarget.headSha, lineage: defaultLineage,
    }))).resolves.toMatchObject({ state: { completedPasses: 2 } });
  });

  it.each([false, true])("retries a continued-head admission with temporarily unverified continuation=%s", async (unverified) => {
    const f = await conditionalFixture("inherit", "project", 1, true);
    const operationId = laneProgressOperationId({
      lane: "frontline", repositoryId: f.reviewTarget.repositoryId, headSha: f.reviewTarget.headSha, lineage: defaultLineage,
    });
    const before = await f.stores.operationStore.readOperation(operationId);
    if (before.state?.kind !== "lane-progress") throw new Error("expected lane owner");
    const grant = before.state.attempts[0]?.conditionalPassAuthorizations?.authorizations[0];
    expect(grant).toMatchObject({
      producedHeadSha: f.initialTarget.headSha, status: "consumed", admissionId: f.timedOut.payload.operationId,
    });
    expect(f.admitted.payload.admission?.target.headSha).toBe(f.reviewTarget.headSha);
    expect(f.reviewTarget.headSha).not.toBe(f.initialTarget.headSha);
    const write = vi.fn();
    await handleReviewFrontlineRun("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        target: { kind: f.reviewTarget.kind, baseRef: f.reviewTarget.baseRef,
          diffBaseSha: f.reviewTarget.diffBaseSha, headSha: f.reviewTarget.headSha },
        resolution: f.admitted, retryOfOperationId: f.timedOut.payload.operationId,
      }),
      deriveRequest: async (request) => FrontlineRunCommandRequestSchema.parse({ ...request, target: f.reviewTarget }),
      run: (request) => runFrontlineReviewCommand(request, f.runDependencies), write, setExitCode: vi.fn(),
    });
    const refusal = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(refusal.remedy.stdin.policyJudgment).toEqual(f.policyJudgment);
    expect(f.execute).toHaveBeenCalledOnce();
    const retryRequest = { ...FrontlineResolveRequestSchema.parse(refusal.remedy.stdin), target: f.reviewTarget };
    if (unverified) {
      f.resolverDependencies.confirmResponseHeadContinuation.mockResolvedValueOnce(false);
      await expect(resolveFrontlineCommand(retryRequest, f.resolverDependencies))
        .rejects.toThrow("does not match the produced head");
      expect(f.execute).toHaveBeenCalledOnce();
    }
    const fresh = await resolveFrontlineCommand(retryRequest, f.resolverDependencies);
    expect(fresh.payload.admission).toMatchObject({
      logicalPass: 2, retryGeneration: 1, target: f.reviewTarget,
      policyVersion: f.admitted.payload.admission?.policyVersion,
    });
    await expect(runFrontlineReviewCommand({
      schemaVersion: 1, target: f.reviewTarget, resolution: fresh, retryOfOperationId: f.timedOut.payload.operationId,
    }, f.runDependencies)).resolves.toMatchObject({ state: "clean" });
    expect(f.execute).toHaveBeenCalledTimes(2);
    const after = await f.stores.operationStore.readOperation(operationId);
    if (after.state?.kind !== "lane-progress") throw new Error("expected lane owner");
    expect(after.state.attempts[0]?.conditionalPassAuthorizations?.authorizations[0]).toEqual(grant);
    expect(after.state.completedPasses).toBe(2);
  });

  it("recovers an Errand grant across its response head without authorizing a different identity", async () => {
    const f = await conditionalFixture("inherit", "project", 1, false, true);
    const operationId = laneProgressOperationId({
      lane: "frontline", repositoryId: f.reviewTarget.repositoryId,
      headSha: f.reviewTarget.headSha, lineage: f.reviewLineage,
    });
    const before = await f.stores.operationStore.readOperation(operationId);
    const admission = f.admitted.payload.admission;
    if (before.state?.kind !== "lane-progress" || admission === undefined) throw new Error("expected consumed admission");
    const grant = before.state.attempts[0]?.conditionalPassAuthorizations?.authorizations[0];
    expect(grant).toMatchObject({
      lineage: f.initialLineage, producedHeadSha: f.reviewTarget.headSha,
      status: "consumed", admissionId: admission.operationId,
    });
    expect(admission.lineage).toEqual(f.reviewLineage);
    expect(admission.lineage).not.toEqual(grant?.lineage);
    const foreignLineage: LaneSubjectLineage = {
      kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "6".repeat(32), headSha: f.reviewTarget.headSha,
    };
    expect(frontlineRetryCeilingOverride(before.state, { ...admission, lineage: foreignLineage })).toBeUndefined();
    await expect(resolveFrontlineCommand({ ...f.request, policyJudgment: f.policyJudgment }, {
      ...f.resolverDependencies, resolveLineage: async () => foreignLineage,
    })).rejects.toThrow();
    expect(f.execute).toHaveBeenCalledOnce();
    const write = vi.fn();
    const setExitCode = vi.fn();
    await handleReviewFrontlineRun("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        target: { kind: f.reviewTarget.kind, baseRef: f.reviewTarget.baseRef,
          diffBaseSha: f.reviewTarget.diffBaseSha, headSha: f.reviewTarget.headSha },
        resolution: f.admitted, retryOfOperationId: f.timedOut.payload.operationId,
      }),
      deriveRequest: async (request) => FrontlineRunCommandRequestSchema.parse({ ...request, target: f.reviewTarget }),
      run: (request) => runFrontlineReviewCommand(request, f.runDependencies), write, setExitCode,
    });
    const refusal = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(refusal.remedy.stdin.policyJudgment).toEqual(f.policyJudgment);
    expect(f.execute).toHaveBeenCalledOnce();
    const fresh = await resolveFrontlineCommand({
      ...FrontlineResolveRequestSchema.parse(refusal.remedy.stdin), target: f.reviewTarget,
    }, f.resolverDependencies);
    expect(fresh.payload.admission).toMatchObject({
      target: admission.target, lineage: admission.lineage, policyVersion: admission.policyVersion,
      logicalPass: 2, retryGeneration: 1, maxPasses: 2,
    });
    await expect(runFrontlineReviewCommand({
      schemaVersion: 1, target: f.reviewTarget, resolution: fresh, retryOfOperationId: f.timedOut.payload.operationId,
    }, f.runDependencies)).resolves.toMatchObject({ state: "clean" });
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.resolverDependencies.confirmResponseHeadContinuation).not.toHaveBeenCalled();
    const after = await f.stores.operationStore.readOperation(operationId);
    if (after.state?.kind !== "lane-progress") throw new Error("expected lane owner");
    expect(after.state.attempts[0]?.conditionalPassAuthorizations?.authorizations[0]).toEqual(grant);
    expect(after.state.completedPasses).toBe(2);
  });

  it.each(["policy", "source", "target", "authorization", "pass"] as const)("refuses a consumed grant with a different %s", async (kind) => {
    const f = await conditionalFixture();
    const otherSource = { ...source, sourceId: "other-cli" };
    const registry = new FrontlineSourceRegistry([source, otherSource].map(s => ({
      sourceId: s.sourceId, descriptor: { kind: s.kind, executable: s.executable, argv: s.argv },
    })));
    const request = {
      ...f.request, policyJudgment: f.policyJudgment,
      ...(kind === "policy" ? { changeSet: { ...routingFacts, reviewRisk: "sensitive" } } : {}),
      ...(kind === "source" ? { invocation: { mode: "force", sourceId: otherSource.sourceId } } : {}),
      ...(kind === "target" ? { target: target("e") } : {}),
      ...(kind === "authorization" ? { policyJudgment: { ceilingOverride: {
        ...f.policyJudgment.ceilingOverride, conditionalPassAuthorizationId: canonicalDigest({ foreign: "grant" }),
      } } } : {}),
      ...(kind === "pass" ? { policyJudgment: { ceilingOverride: {
        ...f.policyJudgment.ceilingOverride, exhaustedPassCount: 2, nextPass: 3,
      } } } : {}),
    };
    await expect(resolveFrontlineCommand(request, { ...f.resolverDependencies, registry })).rejects.toThrow();
    expect(f.execute).toHaveBeenCalledOnce();
    await expect(resolveFrontlineCommand({ ...f.request, policyJudgment: f.policyJudgment }, f.resolverDependencies))
      .resolves.toMatchObject({ state: "ready", payload: { admission: { logicalPass: 2, retryGeneration: 1 } } });
    expect(f.execute).toHaveBeenCalledOnce();
  });
});
