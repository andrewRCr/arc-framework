import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createFrontlineOutcomeRecord,
  type FrontlineOutcomeRecord,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
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
  executeFrontlineRun,
  persistFrontlineRunPending,
  persistFrontlineRunOutcome,
  resolveFrontlineRun,
} from "../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import {
  FrontlineExecutionOutcomeSchema,
  normalizeFrontlineOutcome,
  type FrontlineExecutionOutcome,
} from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { reduceReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";

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
const source = {
  sourceId: "review-cli",
  kind: "command" as const,
  executable: "reviewer",
  argv: ["--plain"],
};
const lineage = {
  kind: "candidate" as const,
  candidateId: canonicalDigest({ candidate: "one" }),
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

function memoryStore(): ReviewOperationStateStore & { records: Map<string, { version: number; state: ReviewOperationState }> } {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  return {
    records,
    readOperation: async (operationId) => records.get(operationId) ?? { version: 0, state: null },
    publishOperation: async (state, expectedVersion) => {
      const current = records.get(state.operationId);
      const version = current?.version ?? 0;
      if (version !== expectedVersion) throw new Error("version-conflict");
      const next = { version: version + 1, state: ReviewOperationStateSchema.parse(state) };
      records.set(state.operationId, next);
      return { version: next.version };
    },
  };
}

function memoryOutcomeStore(): FrontlineOutcomeStore & {
  records: Map<string, { version: number; record: FrontlineOutcomeRecord; outcomeRef: string }>;
} {
  const records = new Map<string, { version: number; record: FrontlineOutcomeRecord; outcomeRef: string }>();
  return {
    records,
    readOutcome: async (operationId) => records.get(operationId) ?? {
      version: 0,
      record: null,
      outcomeRef: null,
    },
    appendOutcome: async (record, expectedVersion) => {
      const current = records.get(record.operationId);
      if (current !== undefined) return { version: current.version, outcomeRef: current.outcomeRef };
      if (expectedVersion !== 0) throw new Error("version-conflict");
      const stored = {
        version: 1,
        record,
        outcomeRef: `outcomes/${record.operationId}.json`,
      };
      records.set(record.operationId, stored);
      return { version: stored.version, outcomeRef: stored.outcomeRef };
    },
  };
}

function admission(overrides: {
  target?: ReturnType<typeof target>;
  source?: typeof source;
  lineage?: typeof lineage;
  logicalPass?: number;
  retryGeneration?: number;
  maxPasses?: number;
  promptText?: string;
} = {}) {
  const maxPasses = overrides.maxPasses ?? 2;
  const admittedSource = overrides.source ?? source;
  return createFrontlineAdmission({
    lineage: overrides.lineage ?? lineage,
    target: overrides.target ?? target("c"),
    routing: {
      facts: routingFacts,
      decision: reduceReviewRouting(routingFacts),
    },
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code"],
      source: admittedSource,
      maxPasses,
      promptText: overrides.promptText ?? "Review the aggregate candidate.",
    },
    logicalPass: overrides.logicalPass ?? 1,
    retryGeneration: overrides.retryGeneration ?? 0,
    maxPasses,
  });
}

function binding(overrides: Parameters<typeof admission>[0] = {}) {
  return {
    admission: admission(overrides),
  };
}

function executionBinding(overrides: Parameters<typeof admission>[0] = {}) {
  return {
    ...binding(overrides),
    lockWaitMs: 30_000,
  };
}

const passThroughOperationLock = <T>(
  _operationId: string,
  _maxWaitMs: number,
  action: () => Promise<T>,
): Promise<T> => action();

const executableIdentity = {
  digest: canonicalDigest({ executable: "reviewer" }),
  qualifiedVersion: "reviewer/1.0.0",
};

function normalizedOutcome(
  outcome: FrontlineExecutionOutcome["outcome"],
  reason?: FrontlineExecutionOutcome["reason"],
): FrontlineExecutionOutcome {
  if (outcome === "clean") {
    return normalizeFrontlineOutcome({
      providerResult: { kind: "clean" }, source, target: target("c"), pass: 1, maxPasses: 2,
    });
  }
  if (outcome === "findings") {
    return normalizeFrontlineOutcome({
      providerResult: {
        kind: "findings",
        findings: [{
          findingId: canonicalDigest({ finding: "one" }),
          severity: "major",
          locus: "src/index.ts",
          evidenceUrlOrId: "finding-one",
          sourceOrdinal: 1,
        }],
      },
      source,
      target: target("c"),
      pass: 1,
      maxPasses: 2,
    });
  }
  return FrontlineExecutionOutcomeSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "frontline-review/v1",
    source,
    target: target("c"),
    pass: 1,
    maxPasses: 2,
    outcome,
    findings: [],
    reason,
  });
}

describe("frontline operation continuity", () => {
  it("records pending before execution and the durable outcome before terminal operation state", async () => {
    const store = memoryStore();
    const order: string[] = [];
    const outcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target: target("c"),
      pass: 1,
      maxPasses: 2,
    });
    const outcomeStore = {
      readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
      appendOutcome: async () => {
        order.push("outcome");
        return { version: 1, outcomeRef: "outcomes/operation.json" };
      },
    };
    const publish = store.publishOperation;
    store.publishOperation = async (state, expectedVersion) => {
      order.push(state.kind === "frontline-run" && state.outcome === "pending" ? "pending" : "terminal");
      return publish(state, expectedVersion);
    };

    await expect(executeFrontlineRun({
      operationStore: store,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => {
        order.push("execute");
        return {
          outcome,
          executableIdentity: {
            digest: canonicalDigest({ executable: "reviewer" }),
            qualifiedVersion: "reviewer/1.0.0",
          },
        };
      },
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding())).resolves.toMatchObject({
      persistedVersion: 2,
      target: target("c"),
      outcomeRef: "outcomes/operation.json",
      outcomeDigest: expect.stringMatching(/^sha256:/u),
    });
    expect(order).toEqual(["pending", "execute", "outcome", "terminal"]);
  });

  it.each([
    ["timed-out", { class: "execution-timeout" }],
    ["failed", { class: "unexpected-adapter-failure" }],
  ] as const)("persists a pre-launch %s terminal without executable identity", async (outcomeName, reason) => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => ({
        outcome: normalizedOutcome(outcomeName, reason),
        executableIdentity: null,
      }),
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding())).resolves.toMatchObject({
      persistedVersion: 2,
      executableIdentity: null,
      outcome: { outcome: outcomeName },
    });
    expect([...operationStore.records.values()].at(-1)?.state).toMatchObject({
      kind: "frontline-run",
      outcome: outcomeName,
    });
    expect([...outcomeStore.records.values()].at(-1)?.record).toMatchObject({
      executableIdentity: null,
      outcome: { outcome: outcomeName },
    });
  });

  it("refuses a concurrently published pending operation without a durable outcome", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const publish = operationStore.publishOperation;
    let injectConflict = true;
    operationStore.publishOperation = async (state, expectedVersion) => {
      if (state.kind === "frontline-run" && state.outcome === "pending" && injectConflict) {
        injectConflict = false;
        await publish(state, expectedVersion);
        throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
      }
      return publish(state, expectedVersion);
    };
    const execute = vi.fn(async () => ({
      outcome: normalizedOutcome("clean"),
      executableIdentity,
    }));

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding())).rejects.toMatchObject({ code: "uncertain-provider-execution" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("reloads exact outcome and terminal publications after concurrent conflicts", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const publish = operationStore.publishOperation;
    const append = outcomeStore.appendOutcome;
    let injectOutcomeConflict = true;
    let injectTerminalConflict = true;
    operationStore.publishOperation = async (state, expectedVersion) => {
      if (state.kind === "frontline-run" && state.outcome !== "pending" && injectTerminalConflict) {
        injectTerminalConflict = false;
        await publish(state, expectedVersion);
        throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
      }
      return publish(state, expectedVersion);
    };
    outcomeStore.appendOutcome = async (record, expectedVersion) => {
      const appended = await append(record, expectedVersion);
      if (injectOutcomeConflict) {
        injectOutcomeConflict = false;
        throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
      }
      return appended;
    };
    const execute = vi.fn(async () => ({
      outcome: normalizedOutcome("clean"),
      executableIdentity,
    }));

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding())).resolves.toMatchObject({
      persistedVersion: 2,
      outcome: { outcome: "clean" },
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("repairs a published outcome by advancing pending state without re-executing the carrier", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const resolved = await resolveFrontlineRun(operationStore, binding());
    if (resolved.action !== "execute") throw new Error("expected execution");
    await persistFrontlineRunPending(operationStore, {
      ...binding(),
      updatedAt: "2026-07-23T19:00:00Z",
      expectedVersion: resolved.expectedVersion,
    });
    const outcome = normalizedOutcome("clean");
    const record = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: target("c").repositoryId,
      operationId: resolved.operationId,
      sourceIdentity: source.sourceId,
      executableIdentity,
      outcome,
    });
    const published = await outcomeStore.appendOutcome(record, 0);
    const execute = vi.fn();

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:01:00Z",
    }, executionBinding())).resolves.toMatchObject({
      operationId: resolved.operationId,
      persistedVersion: 2,
      outcomeRef: published.outcomeRef,
      outcome: { outcome: "clean", pass: 1 },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses to recover a pending operation from an outcome with different coordinates", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const resolved = await resolveFrontlineRun(operationStore, binding());
    if (resolved.action !== "execute") throw new Error("expected execution");
    await persistFrontlineRunPending(operationStore, {
      ...binding(),
      updatedAt: "2026-07-23T19:00:00Z",
      expectedVersion: resolved.expectedVersion,
    });
    const mismatchedOutcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target: target("d"),
      pass: 1,
      maxPasses: 2,
    });
    await outcomeStore.appendOutcome(createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: target("d").repositoryId,
      operationId: resolved.operationId,
      sourceIdentity: source.sourceId,
      executableIdentity,
      outcome: mismatchedOutcome,
    }), 0);

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: vi.fn(),
      now: () => "2026-07-23T19:01:00Z",
    }, executionBinding())).rejects.toMatchObject({ code: "corrupt-state" });
  });

  it("refuses to replay a pending provider effect without an outcome", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const resolved = await resolveFrontlineRun(operationStore, binding());
    if (resolved.action !== "execute") throw new Error("expected execution");
    await persistFrontlineRunPending(operationStore, {
      ...binding(),
      updatedAt: "2026-07-23T19:00:00Z",
      expectedVersion: resolved.expectedVersion,
    });
    const execute = vi.fn(async () => ({
      outcome: normalizedOutcome("clean"),
      executableIdentity,
    }));

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:01:00Z",
    }, executionBinding())).rejects.toMatchObject({ code: "uncertain-provider-execution" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows one explicit restart from an outcome-less pending operation", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const pending = await resolveFrontlineRun(operationStore, binding());
    if (pending.action !== "execute") throw new Error("expected execution");
    await persistFrontlineRunPending(operationStore, {
      ...binding(),
      updatedAt: "2026-07-23T19:00:00Z",
      expectedVersion: pending.expectedVersion,
    });
    const execute = vi.fn(async () => ({
      outcome: normalizedOutcome("clean"),
      executableIdentity,
    }));
    const retryInput = {
      ...executionBinding({ retryGeneration: 1 }),
      retryOfOperationId: pending.operationId,
    };

    const result = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:01:00Z",
    }, retryInput);
    expect(result.operationId).not.toBe(pending.operationId);
    expect(result.outcome).toMatchObject({ outcome: "clean" });
    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:02:00Z",
    }, retryInput)).resolves.toMatchObject({ operationId: result.operationId });
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each(["policy", "source-binding"] as const)(
    "requires an explicit retry when a pending operation is invalidated by %s",
    async (change) => {
      const operationStore = memoryStore();
      const outcomeStore = memoryOutcomeStore();
      const pending = await resolveFrontlineRun(operationStore, binding());
      if (pending.action !== "execute") throw new Error("expected execution");
      await persistFrontlineRunPending(operationStore, {
        ...binding(), updatedAt: "2026-07-23T19:00:00Z", expectedVersion: pending.expectedVersion,
      });
      const changed = executionBinding(change === "policy"
        ? { promptText: "Review the changed policy boundary." }
        : { source: { ...source, argv: ["--structured"] } });
      const execute = vi.fn(async () => ({
        outcome: normalizeFrontlineOutcome({
          providerResult: { kind: "clean" }, source: changed.admission.frontlineReview.source ?? source,
          target: changed.admission.target, pass: changed.admission.logicalPass, maxPasses: changed.admission.maxPasses,
        }),
        executableIdentity,
      }));
      const dependencies = {
        operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
        execute, now: () => "2026-07-23T19:01:00Z",
      };

      await expect(executeFrontlineRun(dependencies, changed))
        .rejects.toMatchObject({ code: "corrupt-state" });
      expect(execute).not.toHaveBeenCalled();

      const retried = await executeFrontlineRun(dependencies, {
        ...executionBinding(change === "policy"
          ? { promptText: "Review the changed policy boundary.", retryGeneration: 1 }
          : { source: { ...source, argv: ["--structured"] }, retryGeneration: 1 }),
        retryOfOperationId: pending.operationId,
      });
      expect(retried.operationId).not.toBe(pending.operationId);
      expect(retried.outcome.outcome).toBe("clean");
      expect(execute).toHaveBeenCalledOnce();
    },
  );

  it("requires an explicit retry when an invalidated operation failed", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const first = await executeFrontlineRun({
      operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
      execute: async () => ({
        outcome: normalizedOutcome("failed", { class: "unexpected-adapter-failure" }),
        executableIdentity,
      }),
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding());
    const changed = executionBinding({ source: { ...source, argv: ["--structured"] } });
    const execute = vi.fn(async () => ({
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "clean" }, source: changed.admission.frontlineReview.source ?? source,
        target: changed.admission.target, pass: changed.admission.logicalPass, maxPasses: changed.admission.maxPasses,
      }),
      executableIdentity,
    }));
    const dependencies = {
      operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
      execute, now: () => "2026-07-23T19:01:00Z",
    };

    await expect(executeFrontlineRun(dependencies, changed))
      .rejects.toMatchObject({ code: "corrupt-state", message: expect.stringContaining(first.operationId) });
    expect(execute).not.toHaveBeenCalled();
    await expect(executeFrontlineRun(dependencies, {
      ...executionBinding({ source: { ...source, argv: ["--structured"] }, retryGeneration: 1 }),
      retryOfOperationId: first.operationId,
    })).resolves.toMatchObject({ outcome: { outcome: "clean" } });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("recovers an old-bound pending failure before an explicit retry with a new source", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const pending = await resolveFrontlineRun(operationStore, binding());
    if (pending.action !== "execute") throw new Error("expected execution");
    const original = await persistFrontlineRunPending(operationStore, {
      ...binding(), updatedAt: "2026-07-23T19:00:00Z", expectedVersion: pending.expectedVersion,
    });
    await outcomeStore.appendOutcome(createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: target("c").repositoryId,
      operationId: pending.operationId,
      sourceIdentity: source.sourceId,
      executableIdentity,
      outcome: normalizedOutcome("failed", { class: "unexpected-adapter-failure" }),
    }), 0);
    const changed = executionBinding({ source: { ...source, argv: ["--structured"] } });
    const execute = vi.fn(async () => ({
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "clean" }, source: changed.admission.frontlineReview.source ?? source,
        target: changed.admission.target, pass: changed.admission.logicalPass, maxPasses: changed.admission.maxPasses,
      }),
      executableIdentity,
    }));
    const dependencies = {
      operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
      execute, now: () => "2026-07-23T19:01:00Z",
    };

    await expect(executeFrontlineRun(dependencies, changed))
      .rejects.toMatchObject({ code: "corrupt-state" });
    expect(execute).not.toHaveBeenCalled();
    await expect(executeFrontlineRun(dependencies, {
      ...executionBinding({ source: { ...source, argv: ["--structured"] }, retryGeneration: 1 }),
      retryOfOperationId: pending.operationId,
    })).resolves.toMatchObject({ outcome: { outcome: "clean" } });
    expect(operationStore.records.get(pending.operationId)?.state)
      .toMatchObject({ outcome: "failed", sourceBindingId: original.state.sourceBindingId });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("can start a fresh generation after invalidating a completed clean operation", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const first = await executeFrontlineRun({
      operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
      execute: async () => ({ outcome: normalizedOutcome("clean"), executableIdentity }),
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding());
    const changed = executionBinding({ promptText: "Review the changed policy boundary.", retryGeneration: 1 });
    const execute = vi.fn(async () => ({ outcome: normalizedOutcome("clean"), executableIdentity }));

    const next = await executeFrontlineRun({
      operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
      execute, now: () => "2026-07-23T19:01:00Z",
    }, changed);
    expect(next.operationId).not.toBe(first.operationId);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("refuses an explicit retry of a completed review", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const first = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => ({ outcome: normalizedOutcome("clean"), executableIdentity }),
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding());
    const execute = vi.fn();

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:01:00Z",
    }, { ...executionBinding(), retryOfOperationId: first.operationId }))
      .rejects.toThrow("earlier exact admitted operation");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a retry ID from a different exact target", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const first = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => ({
        outcome: normalizedOutcome("failed", { class: "unexpected-adapter-failure" }),
        executableIdentity,
      }),
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding());
    const execute = vi.fn();

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:01:00Z",
    }, { ...executionBinding({ target: target("d"), retryGeneration: 1 }), retryOfOperationId: first.operationId }))
      .rejects.toMatchObject({ code: "invalid-input" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("serializes overlapping callers so the carrier executes once", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    let markStarted: (() => void) | undefined;
    let releaseExecution: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    const execute = vi.fn(async () => {
      if (execute.mock.calls.length === 1) {
        markStarted?.();
        await blocked;
      }
      return {
        outcome: normalizedOutcome("clean"),
        executableIdentity,
      };
    });
    let lockTail = Promise.resolve();
    const withOperationLock = async <T>(
      _operationId: string,
      _maxWaitMs: number,
      action: () => Promise<T>,
    ): Promise<T> => {
      const predecessor = lockTail;
      let releaseLock: (() => void) | undefined;
      lockTail = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await predecessor;
      try {
        return await action();
      } finally {
        releaseLock?.();
      }
    };
    const dependencies = {
      operationStore,
      outcomeStore,
      execute,
      withOperationLock,
      now: () => "2026-07-23T19:01:00Z",
    };

    const first = executeFrontlineRun(dependencies, executionBinding());
    await started;
    const second = executeFrontlineRun(dependencies, executionBinding());
    await Promise.resolve();
    expect(execute).toHaveBeenCalledOnce();
    releaseExecution?.();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(execute).toHaveBeenCalledOnce();
    expect(secondResult).toMatchObject({
      operationId: firstResult.operationId,
      outcomeRef: firstResult.outcomeRef,
      outcome: { outcome: "clean" },
    });
  });

  it.each(["clean", "findings", "pass-cap-exhausted"] as const)(
    "replays a concluded %s outcome from the same durable reference",
    async (outcomeName) => {
      const operationStore = memoryStore();
      const outcomeStore = memoryOutcomeStore();
      const outcome = outcomeName === "pass-cap-exhausted"
        ? normalizedOutcome("pass-cap-exhausted", { class: "pass-cap-exhausted" })
        : normalizedOutcome(outcomeName);
      const first = await executeFrontlineRun({
        operationStore,
        outcomeStore,
        withOperationLock: passThroughOperationLock,
        execute: async () => ({
          outcome,
          executableIdentity: outcomeName === "pass-cap-exhausted" ? null : executableIdentity,
        }),
        now: () => "2026-07-23T19:00:00Z",
      }, executionBinding());
      const execute = vi.fn();

      await expect(executeFrontlineRun({
        operationStore,
        outcomeStore,
        withOperationLock: passThroughOperationLock,
        execute,
        now: () => "2026-07-23T19:01:00Z",
      }, executionBinding())).resolves.toMatchObject({
        operationId: first.operationId,
        persistedVersion: first.persistedVersion,
        outcomeRef: first.outcomeRef,
        outcome: { outcome: outcomeName, pass: 1 },
      });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("replays a failed exact request without starting another provider review", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const first = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => ({
        outcome: normalizedOutcome("failed", { class: "unexpected-adapter-failure" }),
        executableIdentity,
      }),
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding());
    const execute = vi.fn(async () => ({
      outcome: normalizedOutcome("clean"),
      executableIdentity,
    }));

    const replay = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:01:00Z",
    }, executionBinding());

    expect(replay.operationId).toBe(first.operationId);
    expect(replay.outcomeRef).toBe(first.outcomeRef);
    expect(replay.outcome).toMatchObject({ outcome: "failed" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("replays a failed admitted generation until a new generation is admitted", async () => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const first = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => ({
        outcome: normalizedOutcome("timed-out", { class: "execution-timeout" }),
        executableIdentity: null,
      }),
      now: () => "2026-09-08T14:00:00Z",
    }, executionBinding());

    await expect(executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => {
        throw new Error("effect-called");
      },
      now: () => "2026-09-08T14:01:00Z",
    }, executionBinding())).resolves.toEqual(first);
  });

  it.each([
    ["timed-out", { class: "execution-timeout" }],
    ["unavailable", { class: "rate-limited" }],
    ["unavailable", { class: "capability-unsupported" }],
    ["failed", { class: "unexpected-adapter-failure" }],
    ["failed", { class: "invalid-output" }],
    ["stale-target", { class: "head-mismatch", expectedHeadSha: oid("c"), observedHeadSha: oid("d") }],
  ] as const)("executes a newly admitted generation after %s with reason %s", async (outcomeName, reason) => {
    const operationStore = memoryStore();
    const outcomeStore = memoryOutcomeStore();
    const first = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute: async () => ({
        outcome: normalizedOutcome(outcomeName, reason),
        executableIdentity: reason.class === "capability-unsupported" ? null : executableIdentity,
      }),
      now: () => "2026-07-23T19:00:00Z",
    }, executionBinding());
    const execute = vi.fn(async () => ({
      outcome: normalizedOutcome("clean"),
      executableIdentity,
    }));

    const retryInput = { ...executionBinding({ retryGeneration: 1 }), retryOfOperationId: first.operationId };
    const retry = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:01:00Z",
    }, retryInput);

    expect(retry.operationId).not.toBe(first.operationId);
    expect(retry.outcome).toMatchObject({ outcome: "clean", pass: 1 });
    expect(execute).toHaveBeenCalledOnce();
    const replay = await executeFrontlineRun({
      operationStore,
      outcomeStore,
      withOperationLock: passThroughOperationLock,
      execute,
      now: () => "2026-07-23T19:02:00Z",
    }, retryInput);
    expect(replay.operationId).toBe(retry.operationId);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("reuses a durable outcome for an unchanged admission", async () => {
    const store = memoryStore();
    const first = await resolveFrontlineRun(store, binding());
    expect(first).toMatchObject({ action: "execute", expectedVersion: 0, invalidatedBy: [] });
    if (first.action !== "execute") throw new Error("expected execution");
    await expect(persistFrontlineRunPending(store, {
      ...binding(),
      updatedAt: "2026-07-20T19:59:00Z",
      expectedVersion: first.expectedVersion,
    })).resolves.toMatchObject({
      version: 1,
      state: { outcome: "pending", logicalPass: 1, retryGeneration: 0 },
    });
    await expect(resolveFrontlineRun(store, binding())).resolves.toMatchObject({
      action: "reuse",
      version: 1,
      state: { outcome: "pending", logicalPass: 1, retryGeneration: 0 },
    });

    const outcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target: target("c"),
      pass: 1,
      maxPasses: 2,
    });
    await expect(persistFrontlineRunOutcome(store, {
      ...binding(),
      outcome,
      updatedAt: "2026-07-20T20:00:00Z",
      expectedVersion: 1,
    })).resolves.toMatchObject({
      version: 2,
      state: { outcome: "clean", logicalPass: 1, retryGeneration: 0 },
    });

    await expect(resolveFrontlineRun(store, binding())).resolves.toMatchObject({
      action: "reuse",
      version: 2,
      state: { outcome: "clean", logicalPass: 1, retryGeneration: 0 },
    });
  });

  it("uses distinct operation keys when target, source, lineage, pass, or retry generation changes", async () => {
    const store = memoryStore();
    const baseline = await resolveFrontlineRun(store, binding());
    const changed = await Promise.all([
      resolveFrontlineRun(store, binding({ target: target("d") })),
      resolveFrontlineRun(store, binding({ source: { ...source, sourceId: "other-reviewer" } })),
      resolveFrontlineRun(store, binding({
        lineage: { ...lineage, candidateId: canonicalDigest({ candidate: "two" }) },
      })),
      resolveFrontlineRun(store, binding({ logicalPass: 2 })),
      resolveFrontlineRun(store, binding({ retryGeneration: 1 })),
    ]);

    expect(new Set([baseline, ...changed].map((result) => result.operationId)).size).toBe(6);
    for (const result of changed) expect(result).toMatchObject({ action: "execute", expectedVersion: 0 });
  });

  it("blocks same-key state when its admitted policy or source binding changes", async () => {
    const store = memoryStore();
    const first = await resolveFrontlineRun(store, binding());
    if (first.action !== "execute") throw new Error("expected execution");
    await persistFrontlineRunOutcome(store, {
      ...binding(),
      outcome: normalizedOutcome("clean"),
      updatedAt: "2026-07-20T20:00:00Z",
      expectedVersion: first.expectedVersion,
    });

    await expect(resolveFrontlineRun(store, binding({
      promptText: "Review under a contradictory policy.",
    }))).resolves.toMatchObject({
      action: "blocked",
      reason: "operation-identity-conflict",
    });
    await expect(resolveFrontlineRun(store, binding({
      source: { ...source, argv: ["--structured"] },
    }))).resolves.toMatchObject({
      action: "blocked",
      reason: "operation-identity-conflict",
    });
  });

  it("blocks corrupt same-key identity and preserves optimistic publication conflicts", async () => {
    const store = memoryStore();
    const resolution = await resolveFrontlineRun(store, binding());
    if (resolution.action !== "execute") throw new Error("expected execution");
    const outcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" }, source, target: target("c"), pass: 1, maxPasses: 2,
    });
    const published = await persistFrontlineRunOutcome(store, {
      ...binding(), outcome, updatedAt: "2026-07-20T20:00:00Z", expectedVersion: 0,
    });
    store.records.set(resolution.operationId, {
      version: published.version,
      state: { ...published.state, targetId: target("d").targetId },
    });
    await expect(resolveFrontlineRun(store, binding())).resolves.toEqual({
      action: "blocked",
      operationId: resolution.operationId,
      reason: "operation-identity-conflict",
    });
    await expect(persistFrontlineRunOutcome(store, {
      ...binding(), outcome, updatedAt: "2026-07-20T20:01:00Z", expectedVersion: 0,
    })).rejects.toThrow(/version-conflict/u);
  });
});
