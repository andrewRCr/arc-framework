import { describe, expect, it, vi } from "vitest";

import { handleReviewFrontlineRun } from "../../../../../src/handlers/review.js";
import { FrontlineRunCommandRequestSchema } from "../../../../../src/scripts/review-gate/core/frontline-run-command-schema.js";
import { FrontlineResolveRequestSchema, resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
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


async function conditionalFixture() {
  const reviewTarget = target("c");
  const stores = memoryStores();
  const resolverDependencies = {
    operationStore: stores.operationStore,
    preferences: { readDeveloperSourceIds: async () => [], readProjectSourceIds: async () => [] },
    registry: new FrontlineSourceRegistry([{
      sourceId: source.sourceId, descriptor: { kind: source.kind, executable: source.executable, argv: source.argv },
    }]),
    resolveLineage: async () => defaultLineage,
    resolveSupersessionAncestors: async () => [],
    withLaneOperationLock: async <T>(_id: string, action: () => Promise<T>) => action(),
    confirmDispositionSetCurrent: async () => true,
    readSettledFindingsAdvice: async () => ({
      action: "follow-up-after-fix" as const, pass: 2, maxPasses: 2, nextCommand: "frontline-resolve" as const,
    }),
    readMaxPasses: async () => 1,
    now: () => "2026-08-15T12:00:00Z",
  };
  const request = {
    schemaVersion: 1 as const, target: reviewTarget, changeSet: routingFacts,
    invocation: { mode: "force" as const, sourceId: source.sourceId },
  };
  const first = await resolveFrontlineCommand(request, resolverDependencies);
  const producer = first.payload.admission;
  if (producer === undefined) throw new Error("expected first admission");
  await recordLaneAttempt(stores.operationStore, {
    lane: "frontline", repositoryId: reviewTarget.repositoryId, changeRequestId: null,
    headSha: reviewTarget.headSha, lineage: defaultLineage, logicalPass: 1, retryGeneration: 0,
    attemptId: producer.operationId, sourceId: source.sourceId, outcome: "findings", consumedPass: true, advancePendingAttempt: true,
    frontline: { admission: producer, effectiveCoverage: "complete" }, now: resolverDependencies.now(),
  });
  const dispositionSetId = canonicalDigest({ disposition: "fixed" });
  const authorization = await captureConditionalNextPassAuthorization(stores.operationStore, {
    lane: "frontline", repositoryId: reviewTarget.repositoryId, headSha: reviewTarget.headSha,
    lineage: defaultLineage, producerId: producer.operationId, dispositionSetId, authorizedBy: "owner-1",
    exhaustedPassCount: 1, nextPass: 2, now: resolverDependencies.now(),
  });
  await settleLaneAttempt(stores.operationStore, {
    lane: "frontline", repositoryId: reviewTarget.repositoryId, headSha: reviewTarget.headSha,
    lineage: defaultLineage, attemptId: producer.operationId, dispositionSetId,
    producedHeadSha: reviewTarget.headSha, now: resolverDependencies.now(),
  });
  const policyJudgment = { ceilingOverride: {
    exhaustedPassCount: 1, nextPass: 2, conditionalPassAuthorizationId: authorization.authorizationId,
  } };
  const admitted = await resolveFrontlineCommand({ ...request, policyJudgment }, resolverDependencies);
  const execute = vi.fn(async (input: { pass: number; maxPasses: number }) => ({
    outcome: normalizeFrontlineOutcome({
      providerResult: execute.mock.calls.length <= 2 ? { kind: "timed-out" } : { kind: "clean" },
      source, target: reviewTarget, pass: input.pass, maxPasses: input.maxPasses,
    }),
    executableIdentity: execute.mock.calls.length <= 2 ? null : {
      digest: canonicalDigest({ executable: "reviewer" }), qualifiedVersion: "reviewer/1.0.0",
    },
  }));
  const runDependencies = {
    ...stores, execute, now: resolverDependencies.now, confirmSource: async () => source,
    prepareExecutionTarget: async () => ({ target: reviewTarget, reviewRoot: "/tmp/review", release: vi.fn() }),
  };
  const timedOut = await runFrontlineReviewCommand({ schemaVersion: 1, target: reviewTarget, resolution: admitted }, runDependencies);
  return { request, policyJudgment, admitted, timedOut, execute, runDependencies, resolverDependencies, stores, reviewTarget };
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
