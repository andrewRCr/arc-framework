import { describe, expect, it } from "vitest";

import { CanonicalDigestSchema } from "../../../../src/lib/kernel/index.js";



import { type ReviewOperationState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { FrontlineExecutionOutcomeSchema } from "../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createFrontlineAdmission } from "../../../../src/scripts/review-gate/core/frontline-admission.js";
import { frontlineLaneOutcome, recordFrontlineAttempt, readCandidateInheritedLaneProgress, readLaneProgress, readLaneProgressAcrossLineage, recordLaneAttempt, settleLaneAttempt } from "../../../../src/scripts/review-gate/lane-progress.js";

import { reduceReviewRouting } from "../../../../src/scripts/review-gate/policy/routing.js";

const digest = (value: string) => CanonicalDigestSchema.parse(value);
const objectId = (character: string): string => character.repeat(40);
function createStore() {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  const store = {
    records,
    drift: 0,
    get state(): ReviewOperationState | null {
      return [...records.values()][0]?.state ?? null;
    },
    readOperation: async (operationId: string) => {
      const record = records.get(operationId);
      return { version: record?.version ?? 0, state: record?.state ?? null };
    },
    publishOperation: async (next: ReviewOperationState, expectedVersion: number) => {
      const current = records.get(next.operationId)?.version ?? 0;
      if (expectedVersion !== current + store.drift) throw new Error("version-conflict");
      const version = current + 1;
      records.set(next.operationId, { version, state: next });
      return { version };
    },
    readOperationSnapshot: async () => ({
      status: "complete" as const,
      records: [...records.values()],
    }),
  };
  return store;
}

const attempt = {
  lane: "standard" as const,
  repositoryId: "repo-1",
  changeRequestId: "pull/42",
  headSha: objectId("c"),
  attemptId: "attempt-1",
  sourceId: "coderabbit-pr",
  now: "2026-08-15T12:00:00Z",
};

const frontlineTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: objectId("a"),
  diffBaseTree: objectId("b"),
  headSha: objectId("c"),
  headTree: objectId("d"),
});
const frontlineLineage = {
  kind: "candidate" as const,
  candidateId: digest(`sha256:${"1".repeat(64)}`),
};
const frontlineSource = {
  sourceId: "coderabbit",
  kind: "agent" as const,
  handle: { capabilityId: "coderabbit" },
};
const frontlineFacts = {
  schemaVersion: 1 as const,
  changeSetState: "known" as const,
  contentKind: "code-bearing" as const,
  reviewRisk: "routine" as const,
  changeDeterminacy: "ordinary" as const,
  ownership: "self" as const,
  surfaceAuthority: "ordinary" as const,
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
} as const;

function frontlineAdmission(retryGeneration = 0) {
  return createFrontlineAdmission({
    lineage: frontlineLineage,
    target: frontlineTarget,
    routing: {
      facts: frontlineFacts,
      decision: reduceReviewRouting(frontlineFacts),
    },
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code"],
      source: frontlineSource,
      maxPasses: 2,
      promptText: "Review the aggregate candidate.",
    },
    logicalPass: 1,
    retryGeneration,
    maxPasses: 2,
  });
}

async function recordPendingFrontline(store: ReturnType<typeof createStore>) {
  const admission = frontlineAdmission();
  await recordLaneAttempt(store, {
    lane: "frontline",
    repositoryId: frontlineTarget.repositoryId,
    changeRequestId: null,
    headSha: frontlineTarget.headSha,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
    attemptId: admission.operationId,
    sourceId: frontlineSource.sourceId,
    outcome: "pending",
    consumedPass: false,
    chunkSeriesComplete: false,
    frontline: { admission, effectiveCoverage: null },
    now: "2026-08-15T11:59:00Z",
  });
  return admission;
}

function frontlineOutcome(
  outcome: string,
  reason: { class: string } | null,
): Parameters<typeof recordFrontlineAttempt>[1]["outcome"] {
  return FrontlineExecutionOutcomeSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "frontline-review/v1",
    source: frontlineSource,
    target: frontlineTarget,
    pass: 1,
    maxPasses: 2,
    outcome,
    findings: [],
    reason,
  });
}

/** Exercise lane recording with no finding payload; this consumer reads only verdict metadata. */
function partialFindingsOutcome(): Parameters<typeof recordFrontlineAttempt>[1]["outcome"] {
  return {
    schemaVersion: 1,
    semanticsVersion: "frontline-review/v1",
    source: frontlineSource,
    target: frontlineTarget,
    pass: 1,
    maxPasses: 2,
    outcome: "findings",
    findings: [],
    reason: null,
  } as unknown as Parameters<typeof recordFrontlineAttempt>[1]["outcome"];
}

describe("frontline lane recording", () => {
  it("allows a frontline-only response with no standard ancestor owner", async () => {
    const store = createStore();
    const admission = await recordPendingFrontline(store);
    await recordFrontlineAttempt(store, {
      admission, outcome: partialFindingsOutcome(), now: "2026-08-15T12:00:00Z",
    });
    const dispositionSetId = digest(`sha256:${"9".repeat(64)}`);
    await settleLaneAttempt(store, {
      lane: "frontline", repositoryId: frontlineTarget.repositoryId,
      headSha: frontlineTarget.headSha, lineage: frontlineLineage,
      attemptId: admission.operationId, dispositionSetId,
      producedHeadSha: objectId("e"), now: "2026-08-15T12:01:00Z",
    });
    const inherited = await readCandidateInheritedLaneProgress(store, {
      lane: "standard", repositoryId: frontlineTarget.repositoryId,
      headSha: objectId("e"), ancestors: [{
        candidateId: frontlineLineage.candidateId,
        baseRevision: frontlineTarget.headSha,
        reviewResponseCount: 1, reviewDispositionIds: [dispositionSetId],
      }],
    });
    expect(inherited.inheritedCompletedPasses).toBe(0);
    expect(inherited.ancestorOwners[0]?.owner).toBeNull();
  });
  it("preserves the unavailable-class distinction the fall-through decision reads", () => {
    expect(frontlineLaneOutcome("unavailable", "rate-limited")).toBe("rate-limited");
    expect(frontlineLaneOutcome("unavailable", "transient-unavailable")).toBe("transient-unavailable");
    expect(frontlineLaneOutcome("unavailable", "source-unbound")).toBe("source-unbound");
    expect(frontlineLaneOutcome("unavailable", "capability-unsupported")).toBe("capability-unsupported");
  });

  it("maps the verdict, timeout, and stale-target outcomes", () => {
    expect(frontlineLaneOutcome("clean", null)).toBe("clean");
    expect(frontlineLaneOutcome("findings", null)).toBe("findings");
    expect(frontlineLaneOutcome("timed-out", "execution-timeout")).toBe("timed-out");
    expect(frontlineLaneOutcome("stale-target", "head-mismatch")).toBe("stale-target");
    expect(frontlineLaneOutcome("stale-target", "target-mismatch")).toBe("stale-target");
  });

  it("separates a malformed carrier result from a terminal refusal", () => {
    expect(frontlineLaneOutcome("failed", "invalid-output")).toBe("malformed");
    expect(frontlineLaneOutcome("failed", "authorization-rejected")).toBe("terminal-failure");
  });

  it("keeps the lane's own retry classification for transient carrier failures", () => {
    for (const reasonClass of [
      "transient-transport",
      "process-failure",
      "signal-termination",
      "unexpected-adapter-failure",
    ]) {
      expect(frontlineLaneOutcome("failed", reasonClass)).toBe("transient-unavailable");
    }
  });

  it("concludes no attempt for an exhausted pass cap", () => {
    expect(frontlineLaneOutcome("pass-cap-exhausted", "pass-cap")).toBeNull();
  });

  it("records a concluded frontline attempt against the frontline lane", async () => {
    const store = createStore();
    const admission = await recordPendingFrontline(store);
    const state = await recordFrontlineAttempt(store, {
      admission,
      outcome: frontlineOutcome("unavailable", { class: "rate-limited" }),
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("frontline");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.attempts).toEqual([{
      attemptId: admission.operationId,
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: null,
      headSha: objectId("c"),
      terminalProducer: false,
      sourceId: "coderabbit",
      outcome: "rate-limited",
      chunkSeriesComplete: false,
      frontline: { admission, effectiveCoverage: null },
    }]);
    expect(state?.completedPasses).toBe(0);
  });

  it("consumes a pass for a verdict-bearing frontline outcome", async () => {
    const store = createStore();
    const admission = await recordPendingFrontline(store);
    const state = await recordFrontlineAttempt(store, {
      admission,
      outcome: partialFindingsOutcome(),
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.completedPasses).toBe(1);
    expect(state?.attempts[0]).toMatchObject({ chunkSeriesComplete: true });
  });

  it("supersedes a timed-out generation when its retry settles", async () => {
    const store = createStore();
    const first = frontlineAdmission();
    await recordFrontlineAttempt(store, {
      admission: first,
      outcome: frontlineOutcome("timed-out", { class: "execution-timeout" }),
      now: "2026-08-15T12:00:00Z",
    });
    const retry = frontlineAdmission(1);
    const state = await recordFrontlineAttempt(store, {
      admission: retry,
      outcome: partialFindingsOutcome(),
      now: "2026-08-15T12:01:00Z",
    });

    expect(state).toMatchObject({
      completedPasses: 1,
      attempts: [
        { attemptId: first.operationId, outcome: "timed-out", retryGeneration: 0 },
        {
          attemptId: retry.operationId,
          sourceId: "coderabbit",
          outcome: "findings",
          retryGeneration: 1,
          chunkSeriesComplete: true,
        },
      ],
    });
  });
});

describe("lane progress reader", () => {
  it("reports an unrecorded lane distinctly from one that recorded attempts", async () => {
    const store = createStore();
    await expect(readLaneProgress(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("c"),
    })).resolves.toEqual({ status: "unrecorded" });
  });

  it("projects recorded progress into the driver's pass count and ordered attempts", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "rate-limited", consumedPass: false });
    await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "findings",
      consumedPass: true,
    });
    await expect(readLaneProgress(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("c"),
    })).resolves.toEqual({
      status: "recorded",
      completedPasses: 1,
      completePasses: 0,
      attempts: [
        {
          attemptId: "attempt-1",
          logicalPass: 1,
          retryGeneration: 0,
          changeRequestId: "pull/42",
          headSha: objectId("c"),
          terminalProducer: false,
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
        },
        {
          attemptId: "attempt-2",
          logicalPass: 1,
          retryGeneration: 0,
          changeRequestId: "pull/42",
          headSha: objectId("c"),
          terminalProducer: true,
          sourceId: "codex-pr",
          outcome: "findings",
        },
      ],
    });
  });

  it("does not read another lane's progress against the same head", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "clean", consumedPass: true });
    await expect(readLaneProgress(store, {
      lane: "frontline",
      repositoryId: "repo-1",
      headSha: objectId("c"),
    })).resolves.toEqual({ status: "unrecorded" });
  });

  it("does not read progress recorded against a different head", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "clean", consumedPass: true });
    await expect(readLaneProgress(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("d"),
    })).resolves.toEqual({ status: "unrecorded" });
  });

  it("carries consumed passes across Candidate heads while exposing only current-head attempts", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "findings", consumedPass: true });
    await recordLaneAttempt(store, {
      ...attempt,
      headSha: objectId("d"),
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "clean",
      consumedPass: true,
    });

    await expect(readLaneProgressAcrossLineage(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("d"),
      lineageHeadShas: [objectId("c"), objectId("d"), objectId("c")],
    })).resolves.toEqual({
      status: "recorded",
      completedPasses: 2,
      completePasses: 0,
      attempts: [{
        attemptId: "attempt-2",
        logicalPass: 1,
        retryGeneration: 0,
        changeRequestId: "pull/42",
        headSha: objectId("d"),
        terminalProducer: true,
        sourceId: "codex-pr",
        outcome: "clean",
      }],
    });
  });

  it("uses the stable-lineage owner instead of mixing exact-head progress", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: digest(`sha256:${"6".repeat(64)}`),
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
    });
    await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
      consumedPass: false,
    });

    await expect(readLaneProgressAcrossLineage(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("c"),
      lineageHeadShas: [objectId("c")],
      lineage,
    })).resolves.toEqual({
      status: "recorded",
      completedPasses: 1,
      completePasses: 0,
      attempts: [
        expect.objectContaining({
          attemptId: "attempt-1",
          sourceId: "delegated-agent",
          outcome: "clean",
        }),
      ],
    });
  });
});
