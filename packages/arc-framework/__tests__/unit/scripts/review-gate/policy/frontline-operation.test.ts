import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createFrontlineOutcomeRecord,
  type FrontlineOutcomeRecord,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
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
const policyVersion = canonicalDigest({ policy: "review" });

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

function binding(overrides: Partial<Parameters<typeof resolveFrontlineRun>[1]> = {}) {
  return {
    target: target("c"),
    source,
    generation: 0,
    policyVersion,
    ...overrides,
  };
}

function executionBinding(overrides: Partial<ReturnType<typeof binding>> = {}) {
  return {
    ...binding(overrides),
    pass: 1 as const,
    maxPasses: 2 as const,
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
    const retryInput = { ...executionBinding(), retryOfOperationId: pending.operationId };

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
        ? { policyVersion: canonicalDigest({ policy: "changed" }) }
        : { source: { ...source, argv: ["--structured"] } });
      const execute = vi.fn(async () => ({
        outcome: normalizeFrontlineOutcome({
          providerResult: { kind: "clean" }, source: changed.source,
          target: changed.target, pass: changed.pass, maxPasses: changed.maxPasses,
        }),
        executableIdentity,
      }));
      const dependencies = {
        operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
        execute, now: () => "2026-07-23T19:01:00Z",
      };

      await expect(executeFrontlineRun(dependencies, changed))
        .rejects.toMatchObject({ code: "uncertain-provider-execution" });
      expect(execute).not.toHaveBeenCalled();

      const retried = await executeFrontlineRun(dependencies, {
        ...changed, retryOfOperationId: pending.operationId,
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
        providerResult: { kind: "clean" }, source: changed.source,
        target: changed.target, pass: changed.pass, maxPasses: changed.maxPasses,
      }),
      executableIdentity,
    }));
    const dependencies = {
      operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
      execute, now: () => "2026-07-23T19:01:00Z",
    };

    await expect(executeFrontlineRun(dependencies, changed))
      .rejects.toMatchObject({ code: "invalid-input", message: expect.stringContaining(first.operationId) });
    expect(execute).not.toHaveBeenCalled();
    await expect(executeFrontlineRun(dependencies, {
      ...changed, retryOfOperationId: first.operationId,
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
        providerResult: { kind: "clean" }, source: changed.source,
        target: changed.target, pass: changed.pass, maxPasses: changed.maxPasses,
      }),
      executableIdentity,
    }));
    const dependencies = {
      operationStore, outcomeStore, withOperationLock: passThroughOperationLock,
      execute, now: () => "2026-07-23T19:01:00Z",
    };

    await expect(executeFrontlineRun(dependencies, changed))
      .rejects.toMatchObject({ code: "invalid-input" });
    expect(execute).not.toHaveBeenCalled();
    await expect(executeFrontlineRun(dependencies, {
      ...changed, retryOfOperationId: pending.operationId,
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
    const changed = executionBinding({ policyVersion: canonicalDigest({ policy: "changed" }) });
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
      .rejects.toThrow("inconclusive prior operation");
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
    }, { ...executionBinding({ target: target("d") }), retryOfOperationId: first.operationId }))
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

  it.each([
    ["timed-out", { class: "execution-timeout" }],
    ["unavailable", { class: "rate-limited" }],
    ["unavailable", { class: "capability-unsupported" }],
    ["failed", { class: "unexpected-adapter-failure" }],
    ["failed", { class: "invalid-output" }],
    ["stale-target", { class: "head-mismatch", expectedHeadSha: oid("c"), observedHeadSha: oid("d") }],
  ] as const)("starts one explicit retry after %s with reason %s", async (outcomeName, reason) => {
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

    const retryInput = { ...executionBinding(), retryOfOperationId: first.operationId };
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

  it("reuses a durable outcome for an unchanged target, source, policy, and generation", async () => {
    const store = memoryStore();
    const first = await resolveFrontlineRun(store, binding());
    expect(first).toMatchObject({ action: "execute", expectedVersion: 0, invalidatedBy: [] });
    if (first.action !== "execute") throw new Error("expected execution");
    await expect(persistFrontlineRunPending(store, {
      ...binding(),
      updatedAt: "2026-07-20T19:59:00Z",
      expectedVersion: first.expectedVersion,
    })).resolves.toMatchObject({ version: 1, state: { outcome: "pending", passCount: 0 } });
    await expect(resolveFrontlineRun(store, binding())).resolves.toMatchObject({
      action: "reuse",
      version: 1,
      state: { outcome: "pending", passCount: 0 },
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
    })).resolves.toMatchObject({ version: 2, state: { outcome: "clean", passCount: 1 } });

    await expect(resolveFrontlineRun(store, binding())).resolves.toMatchObject({
      action: "reuse",
      version: 2,
      state: { outcome: "clean", passCount: 1 },
    });
  });

  it("uses distinct operation keys when target, source, or generation changes", async () => {
    const store = memoryStore();
    const baseline = await resolveFrontlineRun(store, binding());
    const changed = await Promise.all([
      resolveFrontlineRun(store, binding({ target: target("d") })),
      resolveFrontlineRun(store, binding({ source: { ...source, sourceId: "other-reviewer" } })),
      resolveFrontlineRun(store, binding({ generation: 1 })),
    ]);

    expect(new Set([baseline, ...changed].map((result) => result.operationId)).size).toBe(4);
    for (const result of changed) expect(result).toMatchObject({ action: "execute", expectedVersion: 0 });
  });

  it("invalidates same-key state when policy or source binding changes", async () => {
    const store = memoryStore();
    const first = await resolveFrontlineRun(store, binding());
    if (first.action !== "execute") throw new Error("expected execution");
    await persistFrontlineRunOutcome(store, {
      ...binding(),
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "pass-cap-exhausted" }, source, target: target("c"), pass: 2, maxPasses: 2,
      }),
      updatedAt: "2026-07-20T20:00:00Z",
      expectedVersion: first.expectedVersion,
    });

    await expect(resolveFrontlineRun(store, binding({
      policyVersion: canonicalDigest({ policy: "changed" }),
    }))).resolves.toMatchObject({
      action: "execute",
      expectedVersion: 1,
      invalidatedBy: ["policy"],
    });
    await expect(resolveFrontlineRun(store, binding({
      source: { ...source, argv: ["--structured"] },
    }))).resolves.toMatchObject({
      action: "execute",
      expectedVersion: 1,
      invalidatedBy: ["source-binding"],
    });
  });

  it("blocks corrupt same-key identity and preserves optimistic publication conflicts", async () => {
    const store = memoryStore();
    const resolution = await resolveFrontlineRun(store, binding());
    if (resolution.action !== "execute") throw new Error("expected execution");
    const outcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" }, source, target: target("c"), pass: 1, maxPasses: 1,
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
