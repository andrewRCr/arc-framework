import { describe, expect, it, vi } from "vitest";

import { createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createFrontlineAdmission } from
  "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import type { LaneSubjectLineage } from
  "../../../../../src/scripts/review-gate/core/lane-admission.js";
import type { ReviewOperationState } from
  "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from
  "../../../../../src/scripts/review-gate/core/ports.js";
import type { ReviewOperationStateSnapshotIndex } from
  "../../../../../src/scripts/review-gate/core/ports.js";
import {
  captureConditionalNextPassAuthorization,
  readLaneProgressOwner,
  recordFrontlineAttempt,
  recordLaneAttempt,
  settleLaneAttempt,
} from "../../../../../src/scripts/review-gate/lane-progress.js";
import { resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { readSingletonFrontlinePhaseClosure, recordSingletonFrontlineInitialSkip } from
  "../../../../../src/scripts/review-gate/policy/frontline-phase.js";
import { normalizeFrontlineOutcome } from
  "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";
import { reduceReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";

const oid = (character: string): string => character.repeat(40);
const targetInput = {
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha: oid("c"),
  headTree: oid("d"),
} as const;
const target = createReviewTarget(targetInput);
const lineage = {
  kind: "candidate" as const,
  candidateId: `sha256:${"1".repeat(64)}`,
} as const;
const headBoundLineage = {
  kind: "head-bound" as const,
  vehicleKind: "errand",
  vehicleIdentity: "5".repeat(32),
  headSha: target.headSha,
} as const;
const movedTarget = createReviewTarget({ ...targetInput, headSha: oid("e"), headTree: oid("f") });
const movedHeadBoundLineage = { ...headBoundLineage, headSha: movedTarget.headSha } as const;

function operationStore(): ReviewOperationStateStore & ReviewOperationStateSnapshotIndex {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  return {
    readOperation: async (operationId) => records.get(operationId) ?? { version: 0, state: null },
    readOperationSnapshot: async () => ({
      status: "complete" as const,
      records: [...records.values()],
    }),
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
    resolveSupersessionAncestors: async () => [],
    withLaneOperationLock: async <T>(_operationId: string, action: () => Promise<T>) => action(),
    confirmDispositionSetCurrent: async () => true,
    readSettledFindingsAdvice: async () => ({ action: "stop" as const, reason: "no-approved-material-fix" }),
    readMaxPasses: async () => maxPasses,
    now: () => "2026-09-08T12:01:00Z",
  };
}

const followUpAdvice = (pass: number, maxPasses: number) => ({
  action: "follow-up-after-fix" as const, pass, maxPasses, nextCommand: "frontline-resolve" as const,
});

function completedAdmission(
  logicalPass: number,
  maxPasses: number,
  ownerLineage: LaneSubjectLineage = lineage,
) {
  const routing = { facts: routineCode, decision: reduceReviewRouting(routineCode) };
  return createFrontlineAdmission({
    lineage: ownerLineage,
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
  ownerLineage: LaneSubjectLineage = lineage,
  outcome: "clean" | "settled-findings" = "clean",
): Promise<void> {
  const admission = completedAdmission(logicalPass, maxPasses, ownerLineage);
  await recordLaneAttempt(store, {
    lane: "frontline",
    repositoryId: target.repositoryId,
    changeRequestId: null,
    headSha: target.headSha,
    lineage: ownerLineage,
    logicalPass,
    retryGeneration: 0,
    attemptId: admission.operationId,
    sourceId: source.sourceId,
    outcome,
    consumedPass: true,
    frontline: { admission, effectiveCoverage: "complete" },
    now: "2026-09-08T12:00:00Z",
  });
}

describe("frontline workflow command", () => {
  it("keeps frontline closed after a validated superseded owner has a clean result", async () => {
    const store = operationStore();
    const ancestorLineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"2".repeat(64)}`,
    } as const;
    await recordCompletedPass(store, 1, 3, ancestorLineage);
    const deps = {
      ...dependencies(store, 3),
      resolveSupersessionAncestors: async () => [{
        candidateId: ancestorLineage.candidateId,
        baseRevision: oid("a"),
        reviewResponseCount: 0,
      }],
    };
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, deps)).resolves.toMatchObject({ state: "skipped", nextAction: "none" });
    await expect(readLaneProgressOwner(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      headSha: target.headSha,
      lineage: ancestorLineage,
    })).resolves.toMatchObject({ completedPasses: 1, attempts: [
      expect.objectContaining({ logicalPass: 1, outcome: "clean" }),
    ] });
  });

  it("closes an accepted singleton skip durably without recording a clean attempt", async () => {
    const store = operationStore();
    const deps = dependencies(store);
    const skipped = await resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "skip" },
    }, deps);
    expect(skipped).toMatchObject({ state: "skipped", nextAction: "none" });
    await expect(readSingletonFrontlinePhaseClosure(store, {
      repositoryId: target.repositoryId,
      candidateIds: [lineage.candidateId],
    })).resolves.toMatchObject({ closedBy: "initial-skip" });
    await expect(readLaneProgressOwner(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      headSha: target.headSha,
      lineage,
    })).resolves.toBeNull();
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, deps)).resolves.toMatchObject({ state: "skipped", nextAction: "none" });
  });

  it("inherits a validated initial skip after Candidate supersession", async () => {
    const store = operationStore();
    const ancestorId: `sha256:${string}` = `sha256:${"3".repeat(64)}`;
    await recordSingletonFrontlineInitialSkip(store, {
      repositoryId: target.repositoryId,
      candidateId: ancestorId,
      now: "2026-09-08T12:00:00Z",
    });
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, {
      ...dependencies(store),
      resolveSupersessionAncestors: async () => [{
        candidateId: ancestorId,
        baseRevision: oid("a"),
        reviewResponseCount: 0,
      }],
    })).resolves.toMatchObject({ state: "skipped", nextAction: "none" });
  });

  it("refuses an initial skip while frontline findings remain unresolved", async () => {
    const store = operationStore();
    const admission = completedAdmission(1, 2);
    await recordLaneAttempt(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      changeRequestId: null,
      headSha: target.headSha,
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: admission.operationId,
      sourceId: source.sourceId,
      outcome: "findings",
      consumedPass: true,
      frontline: { admission, effectiveCoverage: "complete" },
      now: "2026-09-08T12:00:00Z",
    });
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "skip" },
    }, dependencies(store))).rejects.toThrow(/unresolved frontline findings/u);
    await expect(readSingletonFrontlinePhaseClosure(store, {
      repositoryId: target.repositoryId,
      candidateIds: [lineage.candidateId],
    })).resolves.toBeNull();
  });

  it("keeps singleton frontline closed after a standard pending admission", async () => {
    const store = operationStore();
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId: target.repositoryId,
      changeRequestId: null,
      headSha: target.headSha,
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: "standard-pending-1",
      sourceId: "delegated-agent",
      outcome: "pending",
      consumedPass: false,
      now: "2026-09-08T12:00:00Z",
    });
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, dependencies(store))).resolves.toMatchObject({ state: "skipped", nextAction: "none" });
  });

  it("does not admit another pass after a clean Candidate result on the same target", async () => {
    const store = operationStore();
    await recordCompletedPass(store, 1, 3);
    const commandDependencies = dependencies(store, 3);

    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, commandDependencies)).resolves.toMatchObject({ state: "skipped", nextAction: "none" });
    await expect(readLaneProgressOwner(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      headSha: target.headSha,
      lineage,
    })).resolves.toMatchObject({
      completedPasses: 1,
      attempts: [expect.objectContaining({ logicalPass: 1, outcome: "clean" })],
    });
  });

  it("consumes a response-bound conditional pass before returning frontline work", async () => {
    const store = operationStore();
    const producer = completedAdmission(1, 1);
    await recordLaneAttempt(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      changeRequestId: null,
      headSha: target.headSha,
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: producer.operationId,
      sourceId: source.sourceId,
      outcome: "findings",
      consumedPass: true,
      frontline: { admission: producer, effectiveCoverage: "complete" },
      now: "2026-09-08T12:00:00Z",
    });
    const dispositionSetId: `sha256:${string}` = `sha256:${"6".repeat(64)}`;
    const captured = await captureConditionalNextPassAuthorization(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      headSha: target.headSha,
      lineage,
      producerId: producer.operationId,
      dispositionSetId,
      authorizedBy: "owner-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-09-08T12:00:30Z",
    });
    await settleLaneAttempt(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      headSha: target.headSha,
      lineage,
      attemptId: producer.operationId,
      dispositionSetId,
      producedHeadSha: target.headSha,
      now: "2026-09-08T12:00:45Z",
    });

    const authorizedRequest = {
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
      policyJudgment: {
        ceilingOverride: {
          exhaustedPassCount: 1,
          nextPass: 2,
          conditionalPassAuthorizationId: captured.authorizationId,
        },
      },
    } as const;
    const originalPublish = store.publishOperation;
    store.publishOperation = async (next, expectedVersion) => {
      if (next.kind === "lane-progress" && next.attempts.some(({ logicalPass }) => logicalPass === 2)) {
        throw new Error("interrupted frontline admission");
      }
      return originalPublish(next, expectedVersion);
    };
    const followUpDependencies = {
      ...dependencies(store, 1),
      readSettledFindingsAdvice: async () => ({
        action: "follow-up-after-fix" as const, pass: 2, maxPasses: 2, nextCommand: "frontline-resolve" as const,
      }),
    };
    await expect(resolveFrontlineCommand(authorizedRequest, followUpDependencies))
      .rejects.toThrow("interrupted frontline admission");
    const interrupted = await readLaneProgressOwner(store, {
      lane: "frontline", repositoryId: target.repositoryId, headSha: target.headSha, lineage,
    });
    expect(interrupted?.attempts[0]?.conditionalPassAuthorizations?.authorizations[0]?.status)
      .toBe("bound");
    store.publishOperation = originalPublish;
    await expect(resolveFrontlineCommand(authorizedRequest, followUpDependencies)).resolves.toMatchObject({
      state: "ready",
      nextAction: "run-frontline",
      payload: { pass: 2, maxPasses: 2 },
    });
    await expect(readLaneProgressOwner(store, {
      lane: "frontline",
      repositoryId: target.repositoryId,
      headSha: target.headSha,
      lineage,
    })).resolves.toMatchObject({
      attempts: expect.arrayContaining([expect.objectContaining({
        conditionalPassAuthorizations: expect.objectContaining({
          authorizations: [expect.objectContaining({
            status: "consumed",
            producedHeadSha: target.headSha,
          })],
        }),
      })]),
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
    await recordCompletedPass(store, 1, 2, headBoundLineage, "settled-findings");
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, {
      ...dependencies(store, 1), resolveLineage: async () => headBoundLineage,
      readSettledFindingsAdvice: async () => followUpAdvice(2, 2),
    })).rejects.toThrow("frontline pass allowance is exhausted");
  });

  it("accepts pass ceilings beyond the former two-pass limit", async () => {
    const store = operationStore();
    await recordCompletedPass(store, 1, 3, headBoundLineage, "settled-findings");
    await recordCompletedPass(store, 2, 3, headBoundLineage, "settled-findings");
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, {
      ...dependencies(store, 3), resolveLineage: async () => headBoundLineage,
      readSettledFindingsAdvice: async () => followUpAdvice(3, 3),
    })).resolves.toMatchObject({
      state: "ready",
      payload: { pass: 3, maxPasses: 3 },
    });
  });

  it("keeps an Errand's frontline phase closed after a clean result on an earlier head", async () => {
    const store = operationStore();
    await recordCompletedPass(store, 1, 3, headBoundLineage);
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target: movedTarget,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, {
      ...dependencies(store, 3), resolveLineage: async () => movedHeadBoundLineage,
    })).resolves.toMatchObject({
      state: "skipped",
      nextAction: "none",
      diagnostics: [expect.objectContaining({ code: "frontline-phase-closed" })],
    });
  });

  it("keeps an Errand's frontline phase closed after standard review admitted an earlier head", async () => {
    const store = operationStore();
    await recordLaneAttempt(store, {
      lane: "standard",
      repositoryId: target.repositoryId,
      changeRequestId: null,
      headSha: target.headSha,
      lineage: headBoundLineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: "standard-pending-1",
      sourceId: "delegated-agent",
      outcome: "pending",
      consumedPass: false,
      now: "2026-09-08T12:00:00Z",
    });
    const commandDependencies = {
      ...dependencies(store), resolveLineage: async () => movedHeadBoundLineage,
    };
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target: movedTarget,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, commandDependencies)).resolves.toMatchObject({
      state: "skipped",
      nextAction: "none",
      diagnostics: [expect.objectContaining({ code: "frontline-phase-closed" })],
    });
    await expect(readSingletonFrontlinePhaseClosure(store, {
      repositoryId: target.repositoryId,
      candidateIds: [lineage.candidateId],
    })).resolves.toBeNull();
  });

  it("opens an Errand's frontline phase while it has no terminal result or standard admission", async () => {
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      target: movedTarget,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, {
      ...dependencies(), resolveLineage: async () => movedHeadBoundLineage,
    })).resolves.toMatchObject({ state: "ready", nextAction: "run-frontline", payload: { pass: 1 } });
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
