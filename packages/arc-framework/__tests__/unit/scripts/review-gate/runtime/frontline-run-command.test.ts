import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  ReviewOperationStateSchema,
  type ReviewOperationState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type {
  FrontlineOutcomeStore,
  ReviewOperationStateStore,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { reduceReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import { runFrontlineReviewCommand } from "../../../../../src/scripts/review-gate/runtime/frontline-run-command.js";

const oid = (value: string): string => value.repeat(40);
const target = (head: string) => createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
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
const resolution = {
  schemaVersion: 1,
  mode: "review-frontline-resolve",
  diagnostics: [],
  state: "ready",
  nextAction: "run-frontline",
  payload: {
    routing: {
      facts: routingFacts,
      decision: reduceReviewRouting(routingFacts),
    },
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code"],
      source,
      maxPasses: 2,
      promptText: "Review the aggregate candidate.",
    },
    pass: 2,
    maxPasses: 2,
  },
} as const;

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

describe("frontline run command", () => {
  it("publishes pending before materializing the checkout", async () => {
    const reviewTarget = target("c");
    const stores = memoryStores();
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
    const stores = memoryStores();
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
    const stores = memoryStores();
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
  });

  it("persists source-unbound when the ready source registration no longer resolves", async () => {
    const stores = memoryStores();
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
      const stores = memoryStores();
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
    const stores = memoryStores();

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
});
