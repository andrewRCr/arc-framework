/** Policy replay of admitted local retry generations retains durable evidence. */

import { describe, expect, it } from "vitest";
import { createLocalContinuationFixture } from "../../../fixtures/local-review-continuation.js";
import { readLaneProgress, readLaneProgressAcrossLineage, readLaneProgressOwner } from
  "../../../../src/scripts/review-gate/lane-progress.js";
import { LaneProgressStateSchema, type LaneProgressState } from
  "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { projectLocalRetryAttempts } from "../../../../src/scripts/review-gate/lane-progress-local-retry.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";

type Attempt = LaneProgressState["attempts"][number];

function changeTarget(prior: Attempt, movement: "base-ref" | "head") {
  if (prior.local === undefined) throw new Error("missing local binding");
  const { targetId: _targetId, ...coordinates } = prior.local.target;
  void _targetId;
  const target = createReviewTarget({ ...coordinates,
    ...(movement === "base-ref" ? { baseRef: "trunk" } : { headSha: "6".repeat(40), headTree: "5".repeat(40) }),
  });
  return { ...prior, headSha: target.headSha, local: { ...prior.local, target } };
}

describe("local retry policy projection", () => {
  it.each(["whole-target", "chunked"] as const)("replays a same-head base continuation once for %s", async (scope) => {
    const fixture = await createLocalContinuationFixture(scope);
    const continuation = await fixture.moveBase();
    await fixture.conclude(continuation, "findings");
    const input = {
      lane: "standard" as const, repositoryId: continuation.repositoryId,
      headSha: continuation.target.headSha, lineage: continuation.lineage,
    };
    for (const progress of [
      await readLaneProgress(fixture.dependencies.operationStore, input),
      await readLaneProgressAcrossLineage(fixture.dependencies.operationStore, { ...input, lineageHeadShas: [input.headSha] }),
    ]) {
      expect(progress).toMatchObject({ status: "recorded", completedPasses: 1, completePasses: 1 });
      if (progress.status !== "recorded") throw new Error("missing progress");
      expect(progress.attempts.map(({ attemptId }) => attemptId)).toEqual([continuation.operationId]);
    }
    const owner = await readLaneProgressOwner(fixture.dependencies.operationStore, input);
    expect(owner?.attempts.map(({ outcome }) => outcome)).toEqual(["stale-target", "findings"]);
    expect(fixture.operations.get(fixture.original.operationId)?.state).toEqual(fixture.original);
    expect(await fixture.resultReader.readResult(continuation.operationId)).toMatchObject({
      originalOutcome: "findings", admission: { logicalPass: 1, retryGeneration: 1 },
      target: continuation.target, findings: [{ findingId: "finding-1" }],
    });
  });

  it("projects repeated stale and failed generations through their terminal continuation", async () => {
    const fixture = await createLocalContinuationFixture();
    const second = await fixture.moveBase();
    const third = await fixture.moveBase("8");
    await fixture.conclude(third, "failed");
    const terminal = await fixture.prepare();
    await fixture.conclude(terminal, "clean");
    const owner = fixture.laneProgress();
    expect(owner?.attempts.map(({ outcome }) => outcome)).toEqual(["stale-target", "stale-target", "terminal-failure", "clean"]);
    expect(second.retryGeneration).toBe(1);
    const progress = await readLaneProgress(fixture.dependencies.operationStore, {
      lane: "standard", repositoryId: terminal.repositoryId, headSha: terminal.target.headSha, lineage: terminal.lineage,
    });
    if (progress.status !== "recorded") throw new Error("missing progress");
    expect(progress.attempts.map(({ attemptId }) => attemptId)).toEqual([terminal.operationId]);
    expect(progress.completedPasses).toBe(1);
  });

  it.each([
    ["logical pass", (prior: Attempt) => ({ ...prior, logicalPass: 2 })],
    ["generation", (prior: Attempt) => ({ ...prior, retryGeneration: 1 })],
    ["uncertain outcome", (prior: Attempt) => ({ ...prior, outcome: "ambiguous-delivery" as const })],
    ["scope", (prior: Attempt) => ({ ...prior, local: { ...prior.local!, scopeMode: "chunked" as const } })],
    ["vehicle", (prior: Attempt) => ({ ...prior, local: { ...prior.local!, vehicle: { kind: "work-unit" as const, identity: "other-work" } } })],
    ["rubric", (prior: Attempt) => ({ ...prior, local: { ...prior.local!, rubricIdentity: undefined } })],
    ["base reference", (prior: Attempt) => changeTarget(prior, "base-ref")],
    ["head", (prior: Attempt) => changeTarget(prior, "head")],
    ["coverage", (prior: Attempt) => ({ ...prior, local: {
      ...prior.local!, requestedCoverage: "incremental" as const,
      correctionScope: {
        schemaVersion: 1 as const, predecessorProducerId: "earlier-producer", predecessorHeadSha: "7".repeat(40),
        basisHeadSha: "7".repeat(40), headSha: prior.headSha, requiredFindings: [],
      },
    } })],
  ] as const)("retains a prior attempt with mismatched %s authority", async (_label, change) => {
    const fixture = await createLocalContinuationFixture();
    await fixture.moveBase();
    const owner = fixture.laneProgress();
    if (owner?.kind !== "lane-progress" || owner.attempts[0] === undefined) throw new Error("missing owner");
    const history = LaneProgressStateSchema.parse({ ...owner, attempts: [change(owner.attempts[0]), ...owner.attempts.slice(1)] });
    expect(projectLocalRetryAttempts(history.attempts)).toEqual(history.attempts);
  });

  it("retains terminal findings beside a later nonterminal generation", async () => {
    const fixture = await createLocalContinuationFixture();
    const later = await fixture.moveBase();
    await fixture.conclude(later, "failed");
    const owner = fixture.laneProgress();
    if (owner?.kind !== "lane-progress" || owner.attempts[0]?.local === undefined) throw new Error("missing owner");
    const original = owner.attempts[0];
    const history = LaneProgressStateSchema.parse({ ...owner, completedPasses: 1, attempts: [
      { ...original, outcome: "findings", terminalProducer: true, chunkSeriesComplete: true,
        local: { ...original.local, effectiveCoverage: "complete" } },
      ...owner.attempts.slice(1),
    ] });
    expect(projectLocalRetryAttempts(history.attempts)).toEqual(history.attempts);
  });

  it("does not bridge an intervening attempt removed by head filtering", async () => {
    const fixture = await createLocalContinuationFixture();
    await fixture.moveBase();
    const owner = fixture.laneProgress();
    if (owner?.kind !== "lane-progress" || owner.attempts[0] === undefined) throw new Error("missing owner");
    const prior = owner.attempts[0];
    const intervening = changeTarget(prior, "head");
    const history = LaneProgressStateSchema.parse({ ...owner, attempts: [
      prior, { ...intervening, attemptId: "intervening", outcome: "ambiguous-delivery",
        local: { ...intervening.local, operationId: "intervening" } },
      ...owner.attempts.slice(1),
    ] });
    const store = {
      ...fixture.dependencies.operationStore,
      readOperation: async () => ({ version: 1, state: history }),
    };
    const progress = await readLaneProgress(store, {
      lane: "standard", repositoryId: history.repositoryId, headSha: prior.headSha, lineage: history.lineage,
    });
    expect(progress.status === "recorded" && progress.attempts.map(({ attemptId }) => attemptId))
      .toEqual([prior.attemptId, owner.attempts[1]?.attemptId]);
  });
});
