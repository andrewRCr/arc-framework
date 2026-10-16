import { describe, expect, it, vi } from "vitest";

import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import { handleReviewFrontlineRun } from "../../../../../src/handlers/review.js";
import { FrontlineRunCommandRequestSchema } from "../../../../../src/scripts/review-gate/core/frontline-run-command-schema.js";
import { FrontlineResolveRequestSchema, resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";

import { canonicalDigest, CanonicalDigestSchema } from "../../../../../src/lib/kernel/index.js";
import { createFrontlineAdmission } from
  "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  ReviewOperationStateSchema,
  type ReviewOperationState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type {
  FrontlineOutcomeStore,
  ReviewOperationStateStore,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import {
  laneProgressOperationId,
  recordLaneAttempt,
} from "../../../../../src/scripts/review-gate/lane-progress.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { reduceReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
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
const targetWithBase = (diffBase: string, head: string) => createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid(diffBase),
  diffBaseTree: oid(diffBase),
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
const routing = {
  facts: routingFacts,
  decision: reduceReviewRouting(routingFacts),
};
const frontlineReview = {
  schemaVersion: 1 as const,
  semanticsVersion: "frontline-review/v1" as const,
  action: "attempt" as const,
  reasons: ["routine-code"],
  source,
  maxPasses: 2 as const,
  promptText: "Review the aggregate candidate.",
};

function admissionFor(reviewTarget = target("c"), logicalPass = 2, retryGeneration = 0) {
  return createFrontlineAdmission({
    lineage: defaultLineage,
    target: reviewTarget,
    routing,
    frontlineReview,
    logicalPass,
    retryGeneration,
    maxPasses: 2,
  });
}

function readyResolution(admission = admissionFor()) {
  return {
  schemaVersion: 1,
  mode: "review-frontline-resolve",
  diagnostics: [],
  state: "ready",
  nextAction: "run-frontline",
  payload: {
    routing: {
      facts: admission.routing.facts,
      decision: admission.routing.decision,
    },
    frontlineReview: admission.frontlineReview,
    pass: admission.logicalPass,
    maxPasses: admission.maxPasses,
    admission,
  },
  } as const;
}
const resolution = readyResolution();

function memoryStores(): {
  operationStore: ReviewOperationStateStore;
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

async function admittedRun(reviewTarget = target("c")) {
  const stores = memoryStores();
  const admission = admissionFor(reviewTarget);
  await recordLaneAttempt(stores.operationStore, {
    lane: "frontline",
    repositoryId: reviewTarget.repositoryId,
    changeRequestId: null,
    headSha: reviewTarget.headSha,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
    attemptId: admission.operationId,
    sourceId: source.sourceId,
    outcome: "pending",
    consumedPass: false,
    frontline: { admission, effectiveCoverage: null },
    now: "2026-09-08T13:00:00Z",
  });
  return { stores, resolution: readyResolution(admission) };
}

describe("frontline run command", () => {
  it.each(["stale-target", "missing-admission"] as const)("distinguishes a %s before execution", async (reason) => {
    const { stores, resolution } = await admittedRun();
    const runTarget = reason === "stale-target" ? target("e") : target("c");
    if (reason === "missing-admission") {
      const ownerId = laneProgressOperationId({ lane: "frontline", repositoryId: runTarget.repositoryId,
        headSha: runTarget.headSha, lineage: defaultLineage });
      const current = await stores.operationStore.readOperation(ownerId);
      if (current.state?.kind !== "lane-progress") throw new Error("expected owner");
      await stores.operationStore.publishOperation({ ...current.state, attempts: [] }, current.version);
    }
    await expect(runFrontlineReviewCommand({ schemaVersion: 1, target: runTarget, resolution }, {
      ...stores,
      confirmSource: async () => source,
      prepareExecutionTarget: async () => { throw new Error("unexpected materialization"); },
      execute: async () => { throw new Error("unexpected provider execution"); },
      now: () => "2026-09-08T13:01:00Z",
    })).rejects.toMatchObject({ code: "invalid-input", reason });
  });

  it("refuses an admission withdrawn while run waits for its operation lock", async () => {
    const { stores, resolution } = await admittedRun();
    const request = { schemaVersion: 1, target: target("c"), resolution } as const;
    await expect(runFrontlineReviewCommand(request, {
      ...stores,
      withOperationLock: async (_id, _wait, action) => {
        const ownerId = laneProgressOperationId({ lane: "frontline", repositoryId: target("c").repositoryId,
          headSha: target("c").headSha, lineage: defaultLineage });
        const current = await stores.operationStore.readOperation(ownerId);
        if (current.state?.kind !== "lane-progress") throw new Error("expected owner");
        await stores.operationStore.publishOperation({ ...current.state, attempts: [] }, current.version);
        return action();
      },
      confirmSource: async () => source,
      prepareExecutionTarget: async () => { throw new Error("unexpected materialization"); },
      execute: async () => { throw new Error("unexpected provider execution"); },
      now: () => "2026-09-08T13:01:00Z",
    })).rejects.toMatchObject({ code: "invalid-input", reason: "missing-admission" });
    expect(await stores.operationStore.readOperation(resolution.payload.admission.operationId))
      .toEqual({ version: 0, state: null });
  });

  it("rejects a schema-valid ready envelope that is not the durable lineage admission", async () => {
    const stores = memoryStores();
    const admittedLineage = {
      kind: "candidate" as const,
      candidateId: CanonicalDigestSchema.parse(`sha256:${"1".repeat(64)}`),
    };
    const admitted = createFrontlineAdmission({
      lineage: admittedLineage,
      target: target("c"),
      routing: resolution.payload.routing,
      frontlineReview: resolution.payload.frontlineReview,
      logicalPass: 1,
      retryGeneration: 0,
      maxPasses: 2,
    });
    await recordLaneAttempt(stores.operationStore, {
      lane: "frontline",
      repositoryId: target("c").repositoryId,
      changeRequestId: null,
      headSha: target("c").headSha,
      lineage: admittedLineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: admitted.operationId,
      sourceId: source.sourceId,
      outcome: "pending",
      consumedPass: false,
      frontline: { admission: admitted, effectiveCoverage: null },
      now: "2026-09-08T13:00:00Z",
    });
    const forged = createFrontlineAdmission({
      ...admitted,
      lineage: {
        kind: "candidate",
        candidateId: `sha256:${"2".repeat(64)}`,
      },
    });

    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: target("c"),
      resolution: {
        ...resolution,
        payload: {
          routing: forged.routing,
          frontlineReview: forged.frontlineReview,
          pass: forged.logicalPass,
          maxPasses: forged.maxPasses,
          admission: forged,
        },
      },
    }, {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => {
        throw new Error("effect-called");
      },
      execute: async () => {
        throw new Error("effect-called");
      },
      ...stores,
      now: () => "2026-09-08T13:01:00Z",
    })).rejects.toThrow("frontline ready admission is unavailable");
  });

  it("publishes pending before materializing the checkout", async () => {
    const reviewTarget = target("c");
    const { stores, resolution } = await admittedRun(reviewTarget);
    const events: string[] = [];
    const publishOperation = stores.operationStore.publishOperation;
    stores.operationStore.publishOperation = async (state, expectedVersion) => {
      events.push(`publish:${state.kind === "frontline-run" ? state.outcome : state.kind}`);
      return publishOperation(state, expectedVersion);
    };

    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: reviewTarget,
      resolution,
    }, {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => {
        events.push("materialize");
        throw new Error("materialization interrupted");
      },
      execute: vi.fn(),
      ...stores,
      now: () => "2026-07-23T19:00:00Z",
    })).rejects.toThrow("materialization interrupted");

    expect(events).toEqual(["publish:pending", "materialize"]);
  });

  it.each([
    {
      ...resolution,
      payload: {
        ...resolution.payload,
        frontlineReview: { ...resolution.payload.frontlineReview, maxPasses: 1 as const },
        pass: 2 as const,
        maxPasses: 1 as const,
      },
    },
    {
      ...resolution,
      payload: {
        ...resolution.payload,
        pass: 1 as const,
        maxPasses: 1 as const,
      },
    },
  ])("rejects an impossible pass binding before any effect", async (invalidResolution) => {
    const confirmSource = vi.fn();
    const prepareExecutionTarget = vi.fn();
    const execute = vi.fn();
    const withOperationLock = vi.fn();
    const readOperation = vi.fn();
    const publishOperation = vi.fn();
    const readOutcome = vi.fn();
    const appendOutcome = vi.fn();

    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: target("c"),
      resolution: invalidResolution,
    }, {
      confirmSource,
      prepareExecutionTarget,
      execute,
      withOperationLock,
      operationStore: { readOperation, publishOperation },
      outcomeStore: { readOutcome, appendOutcome },
      now: () => "2026-07-23T19:00:00Z",
    })).rejects.toThrow();

    expect(confirmSource).not.toHaveBeenCalled();
    expect(prepareExecutionTarget).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(withOperationLock).not.toHaveBeenCalled();
    expect(readOperation).not.toHaveBeenCalled();
    expect(publishOperation).not.toHaveBeenCalled();
    expect(readOutcome).not.toHaveBeenCalled();
    expect(appendOutcome).not.toHaveBeenCalled();
  });

  it("persists stale-target when the exact-head checkout re-derives a different head", async () => {
    const { stores, resolution } = await admittedRun();
    const execute = vi.fn();
    const release = vi.fn();
    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: target("c"),
      resolution,
    }, {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => ({
        target: target("d"),
        reviewRoot: "/tmp/review",
        release,
      }),
      execute,
      ...stores,
      now: () => "2026-07-23T19:00:00Z",
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        persistedVersion: 2,
        target: target("c"),
        outcomeRef: expect.stringMatching(/^arc-review-source:v1:frontline:/u),
        reason: {
          class: "head-mismatch",
          expectedHeadSha: oid("c"),
          observedHeadSha: oid("d"),
        },
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("persists stale-target when the exact-head checkout re-derives a different diff base", async () => {
    const attemptedTarget = targetWithBase("a", "c");
    const currentTarget = targetWithBase("e", "c");
    const { stores, resolution } = await admittedRun(attemptedTarget);
    const execute = vi.fn();
    const release = vi.fn();

    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: attemptedTarget,
      resolution,
    }, {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => ({
        target: currentTarget,
        reviewRoot: "/tmp/review",
        release,
      }),
      execute,
      ...stores,
      now: () => "2026-07-23T19:00:00Z",
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        persistedVersion: 2,
        target: attemptedTarget,
        reason: {
          class: "target-mismatch",
          attemptedTargetId: attemptedTarget.targetId,
          currentTargetId: currentTarget.targetId,
        },
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    await expect(stores.operationStore.readOperation(laneProgressOperationId({
      lane: "frontline",
      repositoryId: attemptedTarget.repositoryId,
      headSha: attemptedTarget.headSha,
      lineage: resolution.payload.admission.lineage,
    }))).resolves.toMatchObject({
      state: { kind: "lane-progress", attempts: [{ outcome: "stale-target" }] },
    });
  });

  it("persists source-unbound when the ready source registration no longer resolves", async () => {
    const { stores, resolution } = await admittedRun();
    const execute = vi.fn();
    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: target("c"),
      resolution,
    }, {
      confirmSource: async () => null,
      prepareExecutionTarget: async () => ({
        target: target("c"),
        reviewRoot: "/tmp/review",
        release: vi.fn(),
      }),
      execute,
      ...stores,
      now: () => "2026-07-23T19:00:00Z",
    })).resolves.toMatchObject({
      state: "unavailable",
      nextAction: "operator-repair",
      payload: {
        persistedVersion: 2,
        target: target("c"),
        reason: { class: "source-unbound" },
      },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["capability-unsupported", "unavailable", { kind: "capability-unsupported" }, null],
    ["authorization-rejected", "failed", { kind: "authorization-rejected" }, null],
    ["invalid-output", "failed", { kind: "malformed" }, {
      digest: canonicalDigest({ executable: "reviewer" }),
      qualifiedVersion: "reviewer/1.0.0",
    }],
  ] as const)(
    "persists %s as a truthful operator-repair terminal",
    async (reasonClass, state, providerResult, executableIdentity) => {
      const reviewTarget = target("c");
      const { stores, resolution } = await admittedRun(reviewTarget);
      await expect(runFrontlineReviewCommand({
        schemaVersion: 1,
        target: reviewTarget,
        resolution,
      }, {
        confirmSource: async () => source,
        prepareExecutionTarget: async () => ({
          target: reviewTarget,
          reviewRoot: "/tmp/review",
          release: vi.fn(),
        }),
        execute: async (input) => ({
          outcome: normalizeFrontlineOutcome({
            providerResult,
            source,
            target: reviewTarget,
            pass: input.pass,
            maxPasses: input.maxPasses,
          }),
          executableIdentity,
        }),
        ...stores,
        now: () => "2026-07-23T19:00:00Z",
      })).resolves.toMatchObject({
        state,
        nextAction: "operator-repair",
        payload: {
          persistedVersion: 2,
          target: reviewTarget,
          reason: { class: reasonClass },
        },
      });
    },
  );

  it("takes pass only from the ready resolution and emits durable terminal coordinates", async () => {
    const reviewTarget = target("c");
    const execute = vi.fn(async (input: {
      pass: number;
      maxPasses: number;
    }) => ({
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "clean" },
        source,
        target: reviewTarget,
        pass: input.pass,
        maxPasses: input.maxPasses,
      }),
      executableIdentity: {
        digest: canonicalDigest({ executable: "reviewer" }),
        qualifiedVersion: "reviewer/1.0.0",
      },
    }));
    const { stores, resolution } = await admittedRun(reviewTarget);

    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: reviewTarget,
      resolution,
    }, {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => ({
        target: reviewTarget,
        reviewRoot: "/tmp/review",
        release: vi.fn(),
      }),
      execute,
      ...stores,
      now: () => "2026-07-23T19:00:00Z",
    })).resolves.toMatchObject({
      state: "clean",
      nextAction: "none",
      payload: {
        persistedVersion: 2,
        target: reviewTarget,
        outcomeRef: expect.stringMatching(/^arc-review-source:v1:frontline:/u),
        outcomeDigest: expect.stringMatching(/^sha256:/u),
      },
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      pass: 2,
      maxPasses: 2,
      reviewRoot: "/tmp/review",
      remainingMs: expect.any(Number),
      signal: expect.any(AbortSignal),
    }));
  });

  it.each(["change-set", "delivery-member"] as const)("recovers a stale %s retry through a fresh resolver admission", async (kind) => {
    const reviewTarget = target("c", kind);
    const memberLineage = {
      kind: "delivery-member" as const, planId: "11111111-1111-4111-8111-111111111111",
      deliverableId: canonicalDigest({ member: "one" }), workUnitId: SlugSchema.parse("example"),
    };
    const lineage = kind === "delivery-member" ? memberLineage : defaultLineage;
    const vehicle = kind === "delivery-member" ? { ...memberLineage, head: reviewTarget.headSha } : undefined;
    const stores = memoryStores();
    const resolverDependencies = {
      operationStore: stores.operationStore,
      preferences: { readDeveloperSourceIds: async () => [], readProjectSourceIds: async () => [] },
      registry: new FrontlineSourceRegistry([{
        sourceId: source.sourceId, descriptor: { kind: source.kind, executable: source.executable, argv: source.argv },
      }]),
      resolveLineage: async () => lineage,
      resolveSupersessionAncestors: async () => [],
      withLaneOperationLock: async <T>(_id: string, action: () => Promise<T>) => action(),
      confirmDispositionSetCurrent: async () => true,
      readSettledFindingsAdvice: async () => ({ action: "stop" as const, reason: "no-approved-material-fix" }),
      readMaxPasses: async () => 2,
      now: () => "2026-08-15T12:00:00Z",
    };
    const firstResolution = await resolveFrontlineCommand({
      schemaVersion: 1, target: reviewTarget, changeSet: routingFacts,
      invocation: { mode: "force", sourceId: source.sourceId },
      ...(vehicle === undefined ? {} : { vehicle }),
    }, resolverDependencies);
    const execute = vi.fn(async (input: { pass: number; maxPasses: number }) => {
      const timedOut = execute.mock.calls.length === 1;
      return {
        outcome: normalizeFrontlineOutcome({
          providerResult: timedOut ? { kind: "timed-out" } : { kind: "clean" },
          source,
          target: reviewTarget,
          pass: input.pass,
          maxPasses: input.maxPasses,
        }),
        executableIdentity: timedOut
          ? null
          : {
              digest: canonicalDigest({ executable: "reviewer" }),
              qualifiedVersion: "reviewer/1.0.0",
            },
      };
    });
    const dependencies = {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => ({
        target: reviewTarget,
        reviewRoot: "/tmp/review",
        release: vi.fn(),
      }),
      execute,
      ...stores,
      now: () => "2026-08-15T12:00:00Z",
    };

    const timedOut = await runFrontlineReviewCommand({
      schemaVersion: 1,
      target: reviewTarget,
      resolution: firstResolution,
    }, dependencies);
    const publicTarget = {
      kind: reviewTarget.kind, baseRef: reviewTarget.baseRef,
      diffBaseSha: reviewTarget.diffBaseSha, headSha: reviewTarget.headSha,
    };
    const write = vi.fn();
    const setExitCode = vi.fn();
    await handleReviewFrontlineRun("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1, target: publicTarget, resolution: firstResolution,
        retryOfOperationId: timedOut.payload.operationId,
      }),
      deriveRequest: async (request) => FrontlineRunCommandRequestSchema.parse({ ...request, target: reviewTarget }),
      run: (request) => runFrontlineReviewCommand(request, dependencies),
      write, setExitCode,
    });
    expect(write).toHaveBeenCalledOnce();
    const refusal = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(refusal).toMatchObject({
      mode: "review-frontline-run",
      error: { code: "invalid-input", message: expect.stringContaining("fresh") },
      remedy: {
        argv: ["arc", "review", "frontline", "resolve", "-"],
        stdin: {
          schemaVersion: 1, target: publicTarget, changeSet: routingFacts,
          invocation: { mode: "force", sourceId: source.sourceId },
        },
      },
    });
    expect(refusal.remedy.stdin.vehicle).toEqual(vehicle);
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(execute).toHaveBeenCalledTimes(1);
    const resolveRequest = FrontlineResolveRequestSchema.parse(refusal.remedy.stdin);
    const retryResolution = await resolveFrontlineCommand({ ...resolveRequest, target: reviewTarget }, resolverDependencies);
    const retryAdmission = retryResolution.payload.admission;
    if (retryAdmission === undefined) throw new Error("expected fresh admission");
    expect(retryAdmission).toMatchObject({ logicalPass: 1 });
    expect(retryAdmission.retryGeneration).toBeGreaterThan(
      firstResolution.payload.admission?.retryGeneration ?? -1,
    );
    const retry = await runFrontlineReviewCommand({
      schemaVersion: 1,
      target: reviewTarget,
      resolution: retryResolution,
      retryOfOperationId: timedOut.payload.operationId,
    }, dependencies);

    expect(timedOut).toMatchObject({ state: "timed-out", nextAction: "operator-repair" });
    expect(timedOut.diagnostics).toEqual([{
      code: "frontline-explicit-retry",
      message: expect.stringContaining(timedOut.payload.operationId),
    }]);
    expect(timedOut.diagnostics[0]?.message).toContain("arc review frontline resolve -");
    expect(timedOut.diagnostics[0]?.message).toContain("arc review frontline run -");
    expect(retry).toMatchObject({ state: "clean", nextAction: "none" });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(retry.payload.operationId).not.toBe(timedOut.payload.operationId);
    await expect(stores.operationStore.readOperation(laneProgressOperationId({
      lane: "frontline",
      repositoryId: reviewTarget.repositoryId,
      headSha: reviewTarget.headSha,
      lineage: retryAdmission.lineage,
    }))).resolves.toMatchObject({
      state: {
        kind: "lane-progress",
        completedPasses: 1,
        attempts: [
          { attemptId: timedOut.payload.operationId, outcome: "timed-out" },
          { attemptId: retry.payload.operationId, sourceId: source.sourceId, outcome: "clean" },
        ],
      },
    });
    await expect(stores.operationStore.readOperation(timedOut.payload.operationId))
      .resolves.toMatchObject({ state: { kind: "frontline-run", outcome: "timed-out" } });
    await expect(stores.operationStore.readOperation(retry.payload.operationId))
      .resolves.toMatchObject({ state: { kind: "frontline-run", outcome: "clean" } });
    await expect(stores.outcomeStore.readOutcome(timedOut.payload.operationId))
      .resolves.toMatchObject({ record: { outcome: { outcome: "timed-out" } } });
    await expect(stores.outcomeStore.readOutcome(retry.payload.operationId))
      .resolves.toMatchObject({ record: { outcome: { outcome: "clean" } } });
  });

  it("refuses a public retry with the wrong predecessor before provider execution", async () => {
    const reviewTarget = target("c");
    const { stores, resolution } = await admittedRun(reviewTarget);
    const execute = vi.fn(async (input: { pass: number; maxPasses: number }) => ({
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "timed-out" },
        source,
        target: reviewTarget,
        pass: input.pass,
        maxPasses: input.maxPasses,
      }),
      executableIdentity: null,
    }));
    const dependencies = {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => ({
        target: reviewTarget,
        reviewRoot: "/tmp/review",
        release: vi.fn(),
      }),
      execute,
      ...stores,
      now: () => "2026-08-15T12:00:00Z",
    };
    const first = await runFrontlineReviewCommand({
      schemaVersion: 1,
      target: reviewTarget,
      resolution,
    }, dependencies);
    const retryAdmission = admissionFor(reviewTarget, 2, 1);
    await recordLaneAttempt(stores.operationStore, {
      lane: "frontline",
      repositoryId: reviewTarget.repositoryId,
      changeRequestId: null,
      headSha: reviewTarget.headSha,
      lineage: retryAdmission.lineage,
      logicalPass: retryAdmission.logicalPass,
      retryGeneration: retryAdmission.retryGeneration,
      attemptId: retryAdmission.operationId,
      sourceId: source.sourceId,
      outcome: "pending",
      consumedPass: false,
      frontline: { admission: retryAdmission, effectiveCoverage: null },
      now: "2026-08-15T12:01:00Z",
    });

    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: reviewTarget,
      resolution: readyResolution(retryAdmission),
      retryOfOperationId: canonicalDigest({ unrelated: "predecessor" }),
    }, dependencies)).rejects.toThrow("retry");
    expect(first.state).toBe("timed-out");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
