import { describe, expect, it } from "vitest";

import { createLocalReviewPreparationFixture, createDeliveryLocalReviewAdmission } from
  "../../../../fixtures/local-review-preparation.js";
import { createReviewReceipt, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { LaneProgressStateSchema } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { assertStandardReviewExecutionAdmission } from
  "../../../../../src/scripts/review-gate/policy/review-execution-admission.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { captureConditionalNextPassAuthorization, recordLaneAttempt, recordLocalReceiptConclusion, settleLaneAttempt } from
  "../../../../../src/scripts/review-gate/lane-progress.js";

const oid = (value: string) => value.repeat(40);
const request = {
  schemaVersion: 1 as const,
  evaluatorIdentity: "evaluator-1",
  routingFacts: {
    contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
    ownership: "self", surfaceAuthority: "ordinary",
  } as const,
};

function changedTarget(target: ReviewTarget, movement: "base" | "head" | "base-ref", head = "7"): ReviewTarget {
  return createReviewTarget({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: target.kind,
    repositoryId: target.repositoryId,
    baseRef: movement === "base-ref" ? "trunk" : target.baseRef,
    diffBaseSha: movement === "base" ? oid("9") : target.diffBaseSha,
    diffBaseTree: movement === "base" ? oid("8") : target.diffBaseTree,
    headSha: movement === "head" ? oid(head) : target.headSha,
    headTree: movement === "head" ? oid("6") : target.headTree,
  });
}

function scenario(member = false, headBound = false, maxPasses = 2) {
  const fixture = createLocalReviewPreparationFixture();
  const current = { target: member ? fixture.memberTarget : fixture.changeSetTarget };
  fixture.deriveTarget.mockImplementation(async () => current.target);
  fixture.dependencies.readCurrentHeadSha = async () => current.target.headSha;
  fixture.dependencies.confirmTarget = async (target) => target.targetId === current.target.targetId
    ? { state: "current", target }
    : { state: "stale-target", attemptedTarget: target, currentTarget: current.target };
  if (headBound) {
    const vehicle = { kind: "errand" as const, identity: "target-recovery", claimId: "1".repeat(32) };
    fixture.dependencies.resolveVehicle = async () => ({ vehicle, authorIdentity: "author-1", member: null });
    fixture.dependencies.resolveAuthority = async () => ({
      authority: {
        vehicle, authorIdentity: "author-1", evaluatorIdentity: "evaluator-1",
        attestationRuntimeKind: "arc-cli", runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation",
      },
      member: null,
    });
    fixture.dependencies.resolveLineage = async (_vehicle, headSha) => ({
      kind: "head-bound", vehicleKind: "errand", vehicleIdentity: vehicle.claimId, headSha,
    });
  }
  fixture.dependencies.validatePolicyAdmission = async ({
    standardReview, completedPasses, attempts, judgment,
  }) => ({ state: "ready", pass: assertStandardReviewExecutionAdmission({
    target: { repository: "owner/repository", pullRequest: null, headSha: current.target.headSha },
    frontlineActive: false, standardReview, completedPasses, attempts,
    sources: ["delegated-agent"], maxPasses, expectedSourceId: "delegated-agent",
    expectedNextAction: "local-prepare",
    judgment: { ...judgment, invocation: { mode: "force", sourceId: "delegated-agent" } },
  }).payload.pass });
  const input = member ? {
    ...request,
    memberHeadObjectId: current.target.headSha,
    deliveryAdmission: createDeliveryLocalReviewAdmission(current.target.headSha),
  } : request;
  return { ...fixture, current, input };
}

async function conditionalScenario() {
  const context = scenario();
  const first = await prepareLocalReview(context.input, context.dependencies);
  const producer = context.published();
  if (first.state !== "ready" || producer?.kind !== "local-review") throw new Error("producer was not prepared");
  const receipt = createReviewReceipt({
    target: producer.target, requirement: producer.requirement, request: producer.request,
    applicabilityId: null, reviewRunId: "producer-run", evaluatorIdentity: producer.request.evaluatorIdentity,
    attestingRuntimeIdentity: producer.attestation.runtimeIdentity, attestationMechanism: producer.attestation.mechanism,
    providerEventIdentity: null, result: "findings",
    findings: [{ findingId: "finding-1", severity: "major", locus: "src/example.ts:1", evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }],
  });
  await recordLocalReceiptConclusion(context.dependencies.operationStore, { state: producer, receipt, now: context.dependencies.now() });
  context.dependencies.readReceipts = async () => ({ ledgerVersion: 1, receipts: [receipt] });
  const dispositionSetId = `sha256:${"6".repeat(64)}` as const;
  const captured = await captureConditionalNextPassAuthorization(context.dependencies.operationStore, {
    lane: "standard", repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.lineage, producerId: producer.operationId, dispositionSetId,
    authorizedBy: "author-1", exhaustedPassCount: 1, nextPass: 2, now: context.dependencies.now(),
  });
  await settleLaneAttempt(context.dependencies.operationStore, {
    lane: "standard", repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.lineage, attemptId: producer.operationId, dispositionSetId,
    producedHeadSha: producer.target.headSha, now: context.dependencies.now(),
  });
  // The lane publication below enforces the recorded authorization; the policy decision admits its named pass.
  context.validatePolicyAdmission.mockResolvedValue({ state: "ready", pass: 2 });
  context.dependencies.validatePolicyAdmission = context.validatePolicyAdmission as typeof context.dependencies.validatePolicyAdmission;
  const authorized = { ...context.input, policyJudgment: { ceilingOverride: {
    exhaustedPassCount: 1, nextPass: 2, conditionalPassAuthorizationId: captured.authorizationId,
  } } };
  const prepared = await prepareLocalReview(authorized, context.dependencies);
  const state = context.published();
  if (prepared.state !== "ready" || state?.kind !== "local-review") throw new Error("conditional pass was not prepared");
  const binding = context.laneProgress()?.attempts.find((attempt) => attempt.attemptId === state.operationId)?.local;
  if (binding === undefined) throw new Error("conditional admission binding was not recorded");
  const authorization = () => context.laneProgress()?.attempts.find((attempt) => attempt.attemptId === producer.operationId)
    ?.conditionalPassAuthorizations?.authorizations.find((candidate) => candidate.authorizationId === captured.authorizationId);
  return { ...context, authorized, state, binding, authorization };
}

describe("local pending target recovery", () => {
  it.each([
    ["comparison base", "base", false, false],
    ["base reference", "base-ref", false, false],
    ["Errand head", "head", false, true],
    ["delivery member comparison", "base", true, false],
  ] as const)("replaces a stale %s admission at its original logical pass", async (_label, movement, member, headBound) => {
    const context = scenario(member, headBound);
    if (movement === "base-ref" || member) {
      // A pinned member and a comparison under the recorded base ref remain independently valid.
      context.dependencies.confirmTarget = async (target) => ({ state: "current", target });
    }
    const first = await prepareLocalReview(context.input, context.dependencies);
    if (first.state !== "ready") throw new Error("initial admission was not ready");
    const original = context.operations.get(first.payload.operationId);
    context.current.target = changedTarget(context.current.target, movement);
    if (member) context.memberCoordinates.base = context.current.target.diffBaseSha;

    const recovered = await prepareLocalReview(context.input, context.dependencies);
    expect(recovered.state).toBe("ready");
    if (recovered.state !== "ready") throw new Error("replacement admission was not ready");
    expect(recovered.payload.operationId).not.toBe(first.payload.operationId);
    expect(recovered.payload.target).toEqual(context.current.target);
    expect(recovered.payload.request).toMatchObject({ logicalPass: 1, generation: 1 });
    expect(context.operations.get(first.payload.operationId)).toEqual(original);
    expect(context.laneProgress()).toMatchObject({
      completedPasses: 0,
      attempts: [
        { attemptId: first.payload.operationId, logicalPass: 1, retryGeneration: 0,
          outcome: "stale-target", terminalProducer: false },
        { attemptId: recovered.payload.operationId, logicalPass: 1, retryGeneration: 1,
          outcome: "pending", terminalProducer: false },
      ],
    });
    const replay = await prepareLocalReview(context.input, context.dependencies);
    expect(replay).toMatchObject({ state: "ready", payload: { operationId: recovered.payload.operationId } });
  });

  it("rechecks authority before retiring a stale admission", async () => {
    const context = scenario();
    const first = await prepareLocalReview(context.input, context.dependencies);
    if (first.state !== "ready") throw new Error("initial admission was not ready");
    context.current.target = changedTarget(context.current.target, "base");
    context.resolveAuthority.mockResolvedValue({
      authority: {
        vehicle: { kind: "work-unit", identity: "review-surface-binding" },
        authorIdentity: "different-author", evaluatorIdentity: "evaluator-1",
        attestationRuntimeKind: "arc-cli", runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation",
      }, member: null,
    });
    await expect(prepareLocalReview(context.input, context.dependencies)).rejects.toThrow(/authority/u);
    expect(context.laneProgress()).toMatchObject({
      completedPasses: 0, attempts: [{ attemptId: first.payload.operationId, outcome: "pending" }],
    });
  });

  it("preserves a stale pending operation when its source is unavailable and resumes after source repair", async () => {
    const context = scenario();
    const first = await prepareLocalReview(context.input, context.dependencies);
    if (first.state !== "ready") throw new Error("initial admission was not ready");
    const original = context.operations.get(first.payload.operationId);
    context.current.target = changedTarget(context.current.target, "base");
    const readSource = context.dependencies.sourceStore.readSource;
    context.dependencies.sourceStore.readSource = async () => null;
    await expect(prepareLocalReview(context.input, context.dependencies)).rejects.toThrow(/source reference mismatch/u);
    expect(context.laneProgress()?.attempts.at(-1)?.outcome).toBe("pending");
    expect(context.operations.get(first.payload.operationId)).toEqual(original);
    context.dependencies.sourceStore.readSource = readSource;
    expect(await prepareLocalReview(context.input, context.dependencies)).toMatchObject({
      state: "ready", payload: { request: { logicalPass: 1, generation: 1 } },
    });
  });

  it("requires the complete admitted binding before retirement and resumes after owner repair", async () => {
    const context = scenario();
    const first = await prepareLocalReview(context.input, context.dependencies);
    const owner = context.laneProgress();
    if (first.state !== "ready" || owner === null) throw new Error("initial admission was not ready");
    const stored = context.operations.get(owner.operationId);
    if (stored === undefined) throw new Error("owner was not persisted");
    const changed = LaneProgressStateSchema.parse({
      ...owner, attempts: owner.attempts.map((attempt) => ({
        ...attempt, local: { ...attempt.local, scopeMode: "chunked" },
      })),
    });
    await context.dependencies.operationStore.publishOperation(changed, stored.version);
    context.current.target = changedTarget(context.current.target, "base");
    await expect(prepareLocalReview(context.input, context.dependencies)).rejects.toThrow(/live owner and operation/u);
    expect(context.laneProgress()?.attempts.at(-1)?.outcome).toBe("pending");
    const corrupted = context.operations.get(owner.operationId);
    if (corrupted === undefined) throw new Error("owner was lost");
    await context.dependencies.operationStore.publishOperation(stored.state, corrupted.version);
    expect(await prepareLocalReview(context.input, context.dependencies)).toMatchObject({
      state: "ready", payload: { request: { logicalPass: 1, generation: 1 } },
    });
  });

  it("reconciles a completed receipt published before its lane conclusion even when the base moves", async () => {
    const context = scenario();
    const first = await prepareLocalReview(context.input, context.dependencies);
    const state = context.published();
    if (first.state !== "ready" || state?.kind !== "local-review") throw new Error("initial admission was not ready");
    const receipt = createReviewReceipt({
      target: state.target, requirement: state.requirement, request: state.request,
      applicabilityId: null, reviewRunId: "completed-run", evaluatorIdentity: state.request.evaluatorIdentity,
      attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
      providerEventIdentity: null, result: "clean", findings: [],
    });
    context.dependencies.readReceipts = async () => ({ ledgerVersion: 1, receipts: [receipt] });
    context.current.target = changedTarget(context.current.target, "base");
    expect(await prepareLocalReview(context.input, context.dependencies)).toMatchObject({
      state: "review-complete", payload: { operationId: state.operationId, target: state.target },
    });
    expect(context.laneProgress()).toMatchObject({
      completedPasses: 1, attempts: [{ attemptId: state.operationId, outcome: "clean", terminalProducer: true }],
    });
    expect((await context.dependencies.readReceipts(state.targetId)).receipts).toEqual([receipt]);
  });

  it("rereads a version-conflicted owner before retiring and replacing its pending admission", async () => {
    const context = scenario();
    const first = await prepareLocalReview(context.input, context.dependencies);
    if (first.state !== "ready") throw new Error("initial admission was not ready");
    context.current.target = changedTarget(context.current.target, "base");
    const publish = context.dependencies.operationStore.publishOperation;
    let conflict = true;
    context.dependencies.operationStore.publishOperation = async (state, version) => {
      if (conflict && state.kind === "lane-progress" && state.attempts.at(-1)?.outcome === "stale-target") {
        conflict = false;
        const current = context.operations.get(state.operationId);
        if (current === undefined) throw new Error("owner was not published");
        context.operations.set(state.operationId, { ...current, version: current.version + 1 });
        throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
      }
      return publish(state, version);
    };
    expect(await prepareLocalReview(context.input, context.dependencies)).toMatchObject({
      state: "ready", payload: { request: { logicalPass: 1, generation: 1 } },
    });
    expect(context.laneProgress()).toMatchObject({ completedPasses: 0, attempts: [
      { attemptId: first.payload.operationId, outcome: "stale-target", retryGeneration: 0 },
      { outcome: "pending", retryGeneration: 1 },
    ] });
  });

  it("preserves a fourth-pass override and three completed passes during replacement", async () => {
    const context = scenario(false, true, 3);
    const receipts = [] as ReturnType<typeof createReviewReceipt>[];
    context.dependencies.readReceipts = async (targetId) => ({
      ledgerVersion: receipts.length, receipts: receipts.filter((receipt) => receipt.targetId === targetId),
    });
    for (const head of ["1", "2", "3"]) {
      context.current.target = changedTarget(context.current.target, "head", head);
      const prepared = await prepareLocalReview(context.input, context.dependencies);
      const state = context.published();
      if (prepared.state !== "ready" || state?.kind !== "local-review") throw new Error("pass was not prepared");
      const receipt = createReviewReceipt({
        target: state.target, requirement: state.requirement, request: state.request,
        applicabilityId: null, reviewRunId: `run-${head}`, evaluatorIdentity: state.request.evaluatorIdentity,
        attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
        providerEventIdentity: null, result: "clean", findings: [],
      });
      receipts.push(receipt);
      await recordLocalReceiptConclusion(context.dependencies.operationStore, { state, receipt, now: context.dependencies.now() });
    }
    context.current.target = changedTarget(context.current.target, "head", "4");
    const approved = { ...context.input, policyJudgment: {
      scopeMode: "chunked", ceilingOverride: { exhaustedPassCount: 3, nextPass: 4 },
    } };
    const first = await prepareLocalReview(approved, context.dependencies);
    if (first.state !== "ready") throw new Error("fourth pass was not admitted");
    context.current.target = changedTarget(context.current.target, "base");
    const recovered = await prepareLocalReview(approved, context.dependencies);
    expect(recovered).toMatchObject({ state: "ready", payload: { request: { logicalPass: 4, generation: 1 } } });
    expect(context.laneProgress()).toMatchObject({ completedPasses: 3 });
    expect(receipts).toHaveLength(3);
  });

  it.each(["stale-target", "terminal-failure"] as const)(
    "reuses a consumed authorization after %s without rewriting its consumption", async (outcome) => {
      const context = await conditionalScenario();
      const consumed = structuredClone(context.authorization());
      if (outcome === "stale-target") {
        context.current.target = changedTarget(context.current.target, "base");
      } else {
        await recordLaneAttempt(context.dependencies.operationStore, {
          lane: "standard", repositoryId: context.state.repositoryId, changeRequestId: null,
          headSha: context.state.target.headSha, lineage: context.state.lineage,
          attemptId: context.state.operationId, sourceId: context.state.laneSourceId,
          logicalPass: 2, retryGeneration: 0, outcome, consumedPass: false,
          local: context.binding, advancePendingAttempt: true, now: context.dependencies.now(),
        });
      }
      const recovered = await prepareLocalReview(context.authorized, context.dependencies);
      expect(recovered).toMatchObject({ state: "ready", payload: { request: { logicalPass: 2, generation: 1 } } });
      expect(context.authorization()).toEqual(consumed);
      expect(context.laneProgress()).toMatchObject({ completedPasses: 1 });
    },
  );

  it.each(["source", "owner"] as const)("recovers an interrupted replacement at the %s publication boundary", async (boundary) => {
    const context = await conditionalScenario();
    const consumed = structuredClone(context.authorization());
    context.current.target = changedTarget(context.current.target, "base");
    const publish = context.dependencies.operationStore.publishOperation;
    let interrupt = true;
    if (boundary === "source") {
      context.describeSource.mockRejectedValueOnce(new Error("replacement publication interrupted"));
    } else {
      context.dependencies.operationStore.publishOperation = async (state, version) => {
        if (interrupt && state.kind === "lane-progress" && state.attempts.some((attempt) =>
          attempt.outcome === "pending" && attempt.local?.target.targetId === context.current.target.targetId)) {
          interrupt = false;
          throw new Error("replacement publication interrupted");
        }
        return publish(state, version);
      };
    }
    await expect(prepareLocalReview(context.authorized, context.dependencies)).rejects.toThrow(/publication interrupted/u);
    const recovered = await prepareLocalReview(context.authorized, context.dependencies);
    expect(recovered).toMatchObject({ state: "ready", payload: { request: { logicalPass: 2, generation: 1 } } });
    expect(context.authorization()).toEqual(consumed);
    expect(context.laneProgress()).toMatchObject({ completedPasses: 1 });
  });

  it("requires the consumed admission's scope and recovers with its original selection", async () => {
    const context = await conditionalScenario();
    const consumed = structuredClone(context.authorization());
    context.current.target = changedTarget(context.current.target, "base");
    await expect(prepareLocalReview({
      ...context.authorized,
      policyJudgment: { ...context.authorized.policyJudgment, scopeMode: "chunked" },
    }, context.dependencies)).rejects.toThrow(/retry.*original admission/u);
    expect(context.authorization()).toEqual(consumed);
    const recovered = await prepareLocalReview(context.authorized, context.dependencies);
    expect(recovered).toMatchObject({ state: "ready", payload: { request: { logicalPass: 2, generation: 1 } } });
    expect(context.authorization()).toEqual(consumed);
  });

  it("retains current disposition authority through a consumed admission retry", async () => {
    const context = await conditionalScenario();
    const consumed = structuredClone(context.authorization());
    context.current.target = changedTarget(context.current.target, "base");
    context.dependencies.confirmDispositionSetCurrent = async () => false;
    await expect(prepareLocalReview(context.authorized, context.dependencies)).rejects.toThrow(/disposition set is not current/u);
    expect(context.authorization()).toEqual(consumed);
    expect(context.laneProgress()?.attempts.at(-1)?.outcome).toBe("stale-target");
    context.dependencies.confirmDispositionSetCurrent = async () => true;
    expect(await prepareLocalReview(context.authorized, context.dependencies)).toMatchObject({
      state: "ready", payload: { request: { logicalPass: 2, generation: 1 } },
    });
    expect(context.authorization()).toEqual(consumed);
  });

  it("requires response-head continuation and preserves consumed authority through successive head changes", async () => {
    const context = await conditionalScenario();
    const consumed = structuredClone(context.authorization());
    context.current.target = changedTarget(context.current.target, "head");
    await expect(prepareLocalReview(context.authorized, context.dependencies)).rejects.toThrow(/produced head/u);
    expect(context.authorization()).toEqual(consumed);
    context.dependencies.confirmResponseHeadContinuation = async () => true;
    expect(await prepareLocalReview(context.authorized, context.dependencies)).toMatchObject({
      state: "ready", payload: { request: { logicalPass: 2, generation: 1 } },
    });
    context.current.target = changedTarget(context.current.target, "head", "8");
    expect(await prepareLocalReview(context.authorized, context.dependencies)).toMatchObject({
      state: "ready", payload: { request: { logicalPass: 2, generation: 2 } },
    });
    expect(context.authorization()).toEqual(consumed);
    expect(context.laneProgress()).toMatchObject({ completedPasses: 1 });
  });

  it("refuses a changed evaluator on a consumed retry and resumes with the admitted evaluator", async () => {
    const context = await conditionalScenario();
    const consumed = structuredClone(context.authorization());
    context.current.target = changedTarget(context.current.target, "base");
    const resolveAuthority = context.dependencies.resolveAuthority;
    context.dependencies.resolveAuthority = async (evaluator, head, admission) => {
      const resolved = await resolveAuthority(evaluator, head, admission);
      return { ...resolved, authority: { ...resolved.authority, evaluatorIdentity: evaluator } };
    };
    await expect(prepareLocalReview({ ...context.authorized, evaluatorIdentity: "evaluator-2" }, context.dependencies))
      .rejects.toThrow(/original admission's actors and policy/u);
    expect(context.authorization()).toEqual(consumed);
    expect(await prepareLocalReview(context.authorized, context.dependencies)).toMatchObject({
      state: "ready", payload: { request: { logicalPass: 2, generation: 1 } },
    });
    expect(context.authorization()).toEqual(consumed);
  });
});
