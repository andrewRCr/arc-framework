import { describe, expect, it, vi } from "vitest";

import { createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createFrontlineAdmission } from
  "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import type { ReviewOperationState } from
  "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from
  "../../../../../src/scripts/review-gate/core/ports.js";
import {
  readLaneProgressOwner,
  recordFrontlineAttempt,
  recordLaneAttempt,
} from "../../../../../src/scripts/review-gate/lane-progress.js";
import { resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { normalizeFrontlineOutcome } from
  "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";
import { reduceReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";

const oid = (character: string): string => character.repeat(40);
const target = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha: oid("c"),
  headTree: oid("d"),
});
const lineage = {
  kind: "candidate" as const,
  candidateId: `sha256:${"1".repeat(64)}`,
} as const;

function operationStore(): ReviewOperationStateStore {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  return {
    readOperation: async (operationId) => records.get(operationId) ?? { version: 0, state: null },
    publishOperation: async (state, expectedVersion) => {
      const currentVersion = records.get(state.operationId)?.version ?? 0;
      if (currentVersion !== expectedVersion) throw new Error("version-conflict");
      records.set(state.operationId, { version: currentVersion + 1, state });
      return { version: currentVersion + 1 };
    },
  };
}

const routineCode = {
  schemaVersion: 1 as const,
  changeSetState: "known" as const,
  contentKind: "code-bearing" as const,
  reviewRisk: "routine" as const,
  changeDeterminacy: "ordinary" as const,
  ownership: "self" as const,
  surfaceAuthority: "ordinary" as const,
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: false },
} as const;

const preferences = (sourceIds: readonly string[] = []) => ({
  readDeveloperSourceIds: vi.fn().mockResolvedValue(sourceIds),
  readProjectSourceIds: vi.fn().mockResolvedValue([]),
});
const source = {
  sourceId: "review-command",
  kind: "command" as const,
  executable: "reviewer",
  argv: ["--mode", "frontline"],
};

function registry() {
  return new FrontlineSourceRegistry([{
    sourceId: source.sourceId,
    descriptor: { kind: source.kind, executable: source.executable, argv: source.argv },
  }]);
}

function dependencies(store = operationStore(), maxPasses = 2) {
  return {
    preferences: preferences(),
    registry: registry(),
    operationStore: store,
    resolveLineage: async () => lineage,
    readMaxPasses: async () => maxPasses,
    now: () => "2026-09-08T12:01:00Z",
  };
}

function completedAdmission(logicalPass: number, maxPasses: number) {
  const routing = { facts: routineCode, decision: reduceReviewRouting(routineCode) };
  return createFrontlineAdmission({
    lineage,
    target,
    routing,
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code", "invocation-force", "source-invocation"],
      source,
      maxPasses,
      promptText: "Review the aggregate candidate.",
    },
    logicalPass,
    retryGeneration: 0,
    maxPasses,
  });
}

async function recordCompletedPass(
  store: ReviewOperationStateStore,
  logicalPass: number,
  maxPasses: number,
): Promise<void> {
  const admission = completedAdmission(logicalPass, maxPasses);
  await recordLaneAttempt(store, {
    lane: "frontline",
    repositoryId: target.repositoryId,
    changeRequestId: null,
    headSha: target.headSha,
    lineage,
    logicalPass,
    retryGeneration: 0,
    attemptId: admission.operationId,
    sourceId: source.sourceId,
    outcome: "clean",
    consumedPass: true,
    frontline: { admission, effectiveCoverage: "complete" },
    now: "2026-09-08T12:00:00Z",
  });
}

describe("frontline workflow command", () => {
  it("derives a fresh logical pass and allowance from durable lineage state", async () => {
    const store = operationStore();
    await recordCompletedPass(store, 1, 3);
    const commandDependencies = dependencies(store, 3);

    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, commandDependencies)).resolves.toMatchObject({
      state: "ready",
      nextAction: "run-frontline",
      payload: {
        pass: 2,
        maxPasses: 3,
        admission: {
          lineage,
          logicalPass: 2,
          retryGeneration: 0,
          target,
          requestedCoverage: "complete",
        },
      },
    });
    await expect(readLaneProgressOwner(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      headSha: target.headSha,
      lineage,
    })).resolves.toMatchObject({
      completedPasses: 1,
      attempts: [
        expect.objectContaining({ logicalPass: 1, outcome: "clean" }),
        expect.objectContaining({ logicalPass: 2, retryGeneration: 0, outcome: "pending" }),
      ],
    });
  });

  it("accepts explicit change-set facts and a force invocation without executing a source", async () => {
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, dependencies())).resolves.toMatchObject({
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      diagnostics: [],
      state: "ready",
      nextAction: "run-frontline",
      payload: {
        routing: { facts: { activity: { frontlineReview: false } } },
        frontlineReview: {
          action: "attempt",
          reasons: [
            "routine-code",
            "frontline-inactive",
            "frontline-policy-skip",
            "invocation-force",
            "source-invocation",
          ],
          source: {
            sourceId: "review-command",
            kind: "command",
            executable: "reviewer",
            argv: ["--mode", "frontline"],
          },
        },
        pass: 1,
        maxPasses: 2,
      },
    });
  });

  it("replays pending admission before current policy, source, or allowance drift", async () => {
    const store = operationStore();
    const request = {
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    } as const;
    const first = await resolveFrontlineCommand(request, dependencies(store));

    const replay = await resolveFrontlineCommand({
      ...request,
      changeSet: { contentKind: "surprise" },
      invocation: { mode: "inherit" },
    }, {
      ...dependencies(store, 5),
      registry: new FrontlineSourceRegistry([]),
    });

    expect(replay).toEqual(first);
  });

  it("admits a new retry generation without advancing the logical pass", async () => {
    const store = operationStore();
    const commandDependencies = dependencies(store);
    const request = {
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    } as const;
    const first = await resolveFrontlineCommand(request, commandDependencies);
    if (first.state !== "ready" || first.payload.admission === undefined) {
      throw new Error("expected ready frontline admission");
    }
    await recordFrontlineAttempt(store, {
      admission: first.payload.admission,
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "timed-out" },
        source,
        target,
        pass: 1,
        maxPasses: 2,
      }),
      now: "2026-09-08T12:02:00Z",
    });

    await expect(resolveFrontlineCommand(request, commandDependencies)).resolves.toMatchObject({
      state: "ready",
      payload: {
        pass: 1,
        admission: {
          logicalPass: 1,
          retryGeneration: 1,
          operationId: expect.not.stringMatching(first.payload.admission.operationId),
        },
      },
    });
  });

  it("rejects a caller-authored pass and allowance", async () => {
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
      pass: 2,
      maxPasses: 2,
    }, dependencies())).rejects.toThrow(/unrecognized key/iu);
  });

  it("rejects a fresh pass after the configured allowance is consumed", async () => {
    const store = operationStore();
    await recordCompletedPass(store, 1, 1);
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, dependencies(store, 1))).rejects.toThrow("frontline pass allowance is exhausted");
  });

  it("accepts pass ceilings beyond the former two-pass limit", async () => {
    const store = operationStore();
    await recordCompletedPass(store, 1, 3);
    await recordCompletedPass(store, 2, 3);
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, dependencies(store, 3))).resolves.toMatchObject({
      state: "ready",
      payload: { pass: 3, maxPasses: 3 },
    });
  });

  it("projects skipped and both offered actions from the resolved semantic state", async () => {
    const commandDependencies = dependencies();
    const activeAtomic = {
      ...routineCode,
      changeDeterminacy: "atomic",
      activity: { ...routineCode.activity, frontlineReview: true },
    };

    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "inherit" },
    }, commandDependencies)).resolves.toMatchObject({
      state: "skipped",
      nextAction: "none",
    });
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: activeAtomic,
      invocation: { mode: "inherit" },
    }, commandDependencies)).resolves.toMatchObject({
      state: "offered",
      nextAction: "bind-source",
    });
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: activeAtomic,
      invocation: { mode: "inherit" },
    }, { ...commandDependencies, preferences: preferences(["review-command"]) })).resolves.toMatchObject({
      state: "offered",
      nextAction: "obtain-authorization",
    });
  });

  it("fails closed on malformed change-set facts", async () => {
    const result = await resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: { contentKind: "surprise" },
      invocation: { mode: "inherit" },
    }, { ...dependencies(), registry: new FrontlineSourceRegistry([]) });

    expect(result.payload.routing).toMatchObject({ facts: { changeSetState: "unknown" } });
    expect(result.payload.frontlineReview).toMatchObject({
      action: "offer",
      reasons: expect.arrayContaining(["unknown-change-set", "frontline-policy-attempt", "source-unbound"]),
    });
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("requires invocation input and rejects shell-shaped registry data at the registry boundary", async () => {
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
    }, { ...dependencies(), registry: new FrontlineSourceRegistry([]) })).rejects.toThrow();
    expect(() => new FrontlineSourceRegistry([{
      sourceId: "unsafe",
      descriptor: { kind: "command", executable: "reviewer; rm", argv: [] },
    }])).toThrow();
  });
});
