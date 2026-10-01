/* eslint-disable max-lines -- Local preparation scenarios share one durable in-memory fixture. */
import { describe, expect, it, vi } from "vitest";

import { createHostedTerminalAttemptFixture } from "../../../../fixtures/hosted-review.js";
import { canonicalDigest, CanonicalDigestSchema } from "../../../../../src/lib/kernel/index.js";
import type { StandardReviewObligationProjection } from "../../../../../src/scripts/review-gate/policy/standard-review-projection-schema.js";

import { createReviewReceipt, createReviewRequirement, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewReceiptV2 } from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import type { ReviewOperationState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { IncrementalReviewScope } from "../../../../../src/scripts/review-gate/core/incremental-review-scope.js";
import { createHostedAdmission } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { projectLocalReviewGuidance } from "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import { DEFAULT_LOCAL_REVIEW_POLICY_BINDING } from "../../../../../src/scripts/review-gate/policy/local-review-policy.js";
import { assertStandardReviewExecutionAdmission } from "../../../../../src/scripts/review-gate/policy/review-execution-admission.js";
import { attestLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { captureConditionalNextPassAuthorization, readLaneProgressOwner, recordLaneAttempt, recordLocalReceiptConclusion, settleLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";

const objectId = (character: string): string => character.repeat(40);
const routingFacts = {
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
} as const;

describe("local review member preparation", () => {
    const DELIVERABLE_ID = CanonicalDigestSchema.parse(`sha256:${"a".repeat(64)}`);
    const PLAN_ID = "123e4567-e89b-42d3-a456-426614174000";

    function deliveryAdmission(head: string, correctionScope?: IncrementalReviewScope) {
      return {
        schemaVersion: 1 as const,
        sourceId: "delegated-agent" as const,
        statusTarget: {
          repository: "owner/repository",
          headRef: "delivery/member-1",
          headSha: head,
        },
        target: { repository: "owner/repository", pullRequest: 41, headSha: head },
        vehicle: {
          kind: "delivery-member" as const,
          planId: PLAN_ID,
          deliverableId: DELIVERABLE_ID,
          workUnitId: "review-surface-binding",
          head,
        },
        pass: 1,
        requestedCoverage: correctionScope === undefined ? "complete" as const : "incremental" as const,
        ...(correctionScope === undefined ? {} : { correctionScope }),
      };
    }

    function fixture() {
      const targetOf = (kind: "change-set" | "delivery-member", seed: string) => createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind,
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: objectId(seed),
        diffBaseTree: objectId("b"),
        headSha: objectId(seed === "a" ? "c" : "f"),
        headTree: objectId("d"),
      });
      const changeSetTarget = targetOf("change-set", "a");
      const memberTarget = targetOf("delivery-member", "e");
      const memberCoordinates = {
        base: memberTarget.diffBaseSha,
        head: memberTarget.headSha,
        planId: PLAN_ID,
        workUnitId: "review-surface-binding",
        deliverableId: DELIVERABLE_ID,
      };

      // Keyed by operation and source ref, so two vehicles over one repository
      // address separate records rather than overwriting a single slot.
      const operations = new Map<string, { version: number; state: ReviewOperationState }>();
      const sources = new Map<string, LocalReviewSource>();
      let lastPublished: ReviewOperationState | null = null;
      let lastLocalPublished: ReviewOperationState | null = null;
      let clockTick = 0;

      const authorityOf = (vehicle: { kind: string; identity: string }) => ({
        vehicle,
        authorIdentity: "author-1",
        evaluatorIdentity: "evaluator-1",
        attestationRuntimeKind: "arc-cli",
        runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation" as const,
      });
      const resolveAuthority = vi.fn(async (
        _evaluatorIdentity: string,
        memberHeadObjectId?: string,
      ) => (memberHeadObjectId === undefined
        ? { authority: authorityOf({ kind: "work-unit", identity: "review-surface-binding" }), member: null }
        : { authority: authorityOf({ kind: "delivery-member", identity: DELIVERABLE_ID }), member: memberCoordinates }
      ));
      const deriveTarget = vi.fn(async (
        _repositoryId: string,
        member?: { base: string; head: string },
      ) => (member === undefined ? changeSetTarget : memberTarget));
      const describeSource = vi.fn(async (
        operationId: string,
        target: typeof memberTarget,
        admission?: ReturnType<typeof deliveryAdmission>,
      ) => (
        createLocalReviewSource({
          schemaVersion: 1,
          semanticsVersion: "git-object-range/v1",
          repositoryId: target.repositoryId,
          targetId: target.targetId,
          objectFormat: "sha1",
          diffBaseSha: target.diffBaseSha,
          diffBaseTree: target.diffBaseTree,
          headSha: target.headSha,
          headTree: target.headTree,
          ...(admission?.correctionScope === undefined ? {} : {
            correctionScope: admission.correctionScope,
            predecessorReachabilityRef: `refs/arc/review/local-scope/${operationId}/predecessor`,
            basisReachabilityRef: `refs/arc/review/local-scope/${operationId}/basis`,
          }),
          reachabilityRef: `refs/arc/review/local/${operationId}`,
          materializationRef: "/tmp/review-root",
        })
      ));
      const materialize = vi.fn(async () => ({ reviewRoot: "/tmp/review-root" }));
      const validateDeliveryAdmission = vi.fn(
        async (): Promise<StandardReviewObligationProjection | undefined> => undefined,
      );
      const validatePolicyAdmission = vi.fn(async (
        _input: Parameters<Parameters<typeof prepareLocalReview>[1]["validatePolicyAdmission"]>[0],
      ): Promise<unknown> => {
        void _input;
        return { state: "ready", pass: 1 };
      });
      const composeAssurance = vi.fn(async () => ({
        status: "resolved" as const,
        assurance: { workContext: "work-unit" as const, workClass: "Heavy" as const },
        activity: { selfReview: true, frontlineReview: true },
        guidance: projectLocalReviewGuidance(),
        diagnostics: [],
      }));
      const resolvePolicy = vi.fn(() => ({
        status: "resolved" as const,
        binding: DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
        diagnostics: [] as [],
      }));
      const resolveLineage = vi.fn(async (vehicle: { kind: string }) => vehicle.kind === "delivery-member"
        ? {
            kind: "delivery-member" as const,
            planId: PLAN_ID,
            workUnitId: "review-surface-binding",
            deliverableId: DELIVERABLE_ID,
          }
        : {
            kind: "candidate" as const,
            candidateId: `sha256:${"7".repeat(64)}`,
          });

      const dependencies = {
        sweep: async () => undefined,
        laneSourceId: "delegated-agent",
        withLocalReviewLock: async <T>(action: () => Promise<T>) => action(),
        withLaneOperationLock: async <T>(_input: unknown, action: () => Promise<T>) => action(),
        confirmDispositionSetCurrent: async () => true,
        resolveRepositoryId: async () => "repo-1",
        readCurrentHeadSha: async () => changeSetTarget.headSha,
        resolveVehicle: async (memberHeadObjectId?: string) => memberHeadObjectId === undefined
          ? {
              vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
              authorIdentity: "author-1",
              member: null,
            }
          : {
              vehicle: { kind: "delivery-member" as const, identity: DELIVERABLE_ID },
              authorIdentity: "author-1",
              member: memberCoordinates,
            },
        deriveTarget,
        confirmTarget: async (target: typeof memberTarget) => ({ state: "current" as const, target }),
        resolveAuthority,
        resolveLineage,
        resolveSupersessionAncestors: async () => [],
        composeAssurance,
        resolvePolicy,
        validatePolicySelection: () => undefined,
        validateDeliveryAdmission,
        validatePolicyAdmission,
        operationStore: {
          readOperation: async (operationId: string) => (
            operations.get(operationId) ?? { version: 0, state: null }
          ),
          readOperationSnapshot: async () => ({
            status: "complete" as const,
            records: [...operations.values()],
          }),
          publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
            const current = operations.get(state.operationId)?.version ?? 0;
            if (current !== expectedVersion) {
              throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
            }
            const version = current + 1;
            operations.set(state.operationId, { version, state });
            lastPublished = state;
            if (state.kind === "local-review") lastLocalPublished = state;
            return { version };
          },
        },
        sourceStore: {
          readSource: async (sourceRef: string) => sources.get(sourceRef) ?? null,
          appendSource: async (source: LocalReviewSource) => {
            const sourceRef = `sources/${source.targetId}.json`;
            sources.set(sourceRef, source);
            return { sourceRef };
          },
        },
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        describeSource,
        materialize,
        now: () => `2026-08-06T17:00:0${clockTick++}Z`,
      } as unknown as Parameters<typeof prepareLocalReview>[1];

      return {
        dependencies,
        memberTarget,
        changeSetTarget,
        memberCoordinates,
        deriveTarget,
        describeSource,
        materialize,
        resolveAuthority,
        resolveLineage,
        composeAssurance,
        resolvePolicy,
        validateDeliveryAdmission,
        validatePolicyAdmission,
        operations,
        published: () => lastLocalPublished ?? lastPublished,
        laneProgress: () => [...operations.values()]
          .map(({ state }) => state)
          .find((state) => state.kind === "lane-progress") ?? null,
      };
    }

    const request = {
      schemaVersion: 1 as const,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    };

    it("admits a local pass after a validated superseded Candidate without copying attempts", async () => {
      const context = fixture();
      const ancestorId = CanonicalDigestSchema.parse(`sha256:${"6".repeat(64)}`);
      await recordLaneAttempt(context.dependencies.operationStore, {
        lane: "standard",
        repositoryId: "repo-1",
        changeRequestId: null,
        headSha: objectId("9"),
        lineage: { kind: "candidate", candidateId: ancestorId },
        logicalPass: 1,
        retryGeneration: 0,
        attemptId: "ancestor-local-review",
        sourceId: "delegated-agent",
        outcome: "clean",
        consumedPass: true,
        now: "2026-08-06T16:00:00Z",
      });
      const validatePolicyAdmission = vi.fn(async () => ({ state: "ready" as const, pass: 2 }));
      const dependencies = {
        ...context.dependencies,
        resolveSupersessionAncestors: async () => [{
          candidateId: ancestorId,
          baseRevision: objectId("a"),
          reviewResponseCount: 0,
        }],
        validatePolicyAdmission,
      };
      await expect(prepareLocalReview(request, dependencies)).resolves.toMatchObject({
        state: "ready",
        payload: { request: { logicalPass: 2 } },
      });
      expect(validatePolicyAdmission).toHaveBeenCalledWith(expect.objectContaining({
        completedPasses: 1,
        attempts: [],
      }));
      await expect(readLaneProgressOwner(context.dependencies.operationStore, {
        lane: "standard",
        repositoryId: "repo-1",
        headSha: objectId("9"),
        lineage: { kind: "candidate", candidateId: ancestorId },
      })).resolves.toMatchObject({ completedPasses: 1 });
    });

    it("publishes a member vehicle over a member target when a selector is supplied", async () => {
      const context = fixture();

      await expect(prepareLocalReview(
        { ...request, deliveryAdmission: deliveryAdmission(context.memberTarget.headSha) },
        context.dependencies,
      )).resolves.toMatchObject({ state: "ready", nextAction: "launch-review" });

      const state = context.published();
      expect(state).toMatchObject({
        kind: "local-review",
        vehicle: { kind: "delivery-member", identity: DELIVERABLE_ID },
        targetId: context.memberTarget.targetId,
        target: { kind: "delivery-member" },
      });
    });

    it("delivers the exact correction range and material finding instructions", async () => {
      const context = fixture();
      const correctionScope = {
        schemaVersion: 1 as const,
        predecessorProducerId: "hosted/attempt-1",
        predecessorHeadSha: objectId("a"),
        basisHeadSha: objectId("9"),
        headSha: context.memberTarget.headSha,
        requiredFindings: [{
          producerId: "hosted/attempt-1",
          findingId: "F-material",
          locus: "src/member.ts:1",
        }],
      };

      const prepared = await prepareLocalReview({
        ...request,
        deliveryAdmission: deliveryAdmission(context.memberTarget.headSha, correctionScope),
      }, context.dependencies);

      expect(prepared).toMatchObject({
        state: "ready",
        payload: {
          reviewerPayload: {
            diffBaseSha: context.memberTarget.diffBaseSha,
            headSha: context.memberTarget.headSha,
            correctionScope,
          },
        },
      });
      if (prepared.state !== "ready") throw new Error("local correction review was not ready");
      expect(prepared.payload.reviewerPayload.reviewerInstructions).toContain("hosted/attempt-1");
      expect(prepared.payload.reviewerPayload.reviewerInstructions).toContain("F-material");
      expect(prepared.payload.reviewerPayload.reviewerInstructions).toContain("src/member.ts:1");
      expect(prepared.payload.reviewerPayload.reviewerInstructions).toContain(
        `${correctionScope.predecessorHeadSha}..${correctionScope.headSha}`,
      );
    });

    it("delivers an exact non-delivery correction through the same coverage admission", async () => {
      const context = fixture();
      const correctionScope = {
        schemaVersion: 1 as const,
        predecessorProducerId: "local-predecessor",
        predecessorHeadSha: objectId("a"),
        basisHeadSha: objectId("9"),
        headSha: context.changeSetTarget.headSha,
        requiredFindings: [{
          producerId: "local-predecessor",
          findingId: "F-material",
          locus: "src/work-unit.ts:4",
        }],
      };

      const prepared = await prepareLocalReview({
        ...request,
        coverageAdmission: { requestedCoverage: "incremental", correctionScope },
      }, context.dependencies);

      expect(prepared).toMatchObject({
        state: "ready",
        payload: { reviewerPayload: { correctionScope } },
      });
      expect(context.published()).toMatchObject({
        coverageAdmission: { requestedCoverage: "incremental", correctionScope },
      });
      expect(context.laneProgress()).toMatchObject({
        attempts: [{
          local: {
            requestedCoverage: "incremental",
            correctionScope,
          },
        }],
      });
    });

    it("returns a typed coverage choice instead of silently launching after an inadequate pass", async () => {
      const context = fixture();
      const correctionScope = {
        schemaVersion: 1 as const,
        predecessorProducerId: "local-predecessor",
        predecessorHeadSha: objectId("a"),
        basisHeadSha: objectId("9"),
        headSha: context.changeSetTarget.headSha,
        requiredFindings: [],
      };
      context.validatePolicyAdmission.mockResolvedValueOnce({
        state: "coverage-required",
        action: {
          schemaVersion: 1,
          kind: "local-review-coverage-selection",
          sourceId: "delegated-agent",
          target: context.changeSetTarget,
          pass: 1,
          completedPasses: 1,
          consumedPass: true,
          choices: [
            { requestedCoverage: "incremental", correctionScope },
            { requestedCoverage: "complete" },
          ],
          interactionText: "Select one listed coverage admission and re-run local preparation.",
        },
      });

      const result = await prepareLocalReview(request, context.dependencies);

      expect(result).toMatchObject({
        state: "coverage-required",
        nextAction: "select-coverage",
        payload: {
          coverageSelectionAction: {
            kind: "local-review-coverage-selection",
            choices: [
              { requestedCoverage: "incremental", correctionScope },
              { requestedCoverage: "complete" },
            ],
          },
        },
      });
      expect(context.operations.size).toBe(0);
    });

    it("persists the admitted local attempt before returning executable review inputs", async () => {
      const context = fixture();

      const prepared = await prepareLocalReview(request, context.dependencies);
      if (prepared.state !== "ready") throw new Error("local review preparation was not ready");

      expect(context.laneProgress()).toMatchObject({
        kind: "lane-progress",
        lineage: { kind: "candidate", candidateId: `sha256:${"7".repeat(64)}` },
        completedPasses: 0,
        attempts: [{
          attemptId: prepared.payload.operationId,
          logicalPass: 1,
          retryGeneration: 0,
          headSha: context.changeSetTarget.headSha,
          outcome: "pending",
          terminalProducer: false,
          local: {
            operationId: prepared.payload.operationId,
            requestId: prepared.payload.request.requestId,
            requestedCoverage: "complete",
            effectiveCoverage: null,
            scopeMode: "whole-target",
          },
        }],
      });
      expect(context.validatePolicyAdmission).toHaveBeenCalledWith(expect.objectContaining({
        repositoryId: "repo-1",
        target: context.changeSetTarget,
        completedPasses: 0,
        attempts: [],
      }));
    });

    it("keeps the admitted rubric through receipt settlement and rechecks a changed diff base", async () => {
      const context = fixture();
      const prepared = await prepareLocalReview(request, context.dependencies);
      if (prepared.state !== "ready") throw new Error("expected a prepared local review");
      const state = context.published();
      if (state?.kind !== "local-review") throw new Error("expected local operation state");
      expect(context.laneProgress()).toMatchObject({ attempts: [{ local: { rubricIdentity: {
        version: state.requirement.rubricVersion,
        digest: state.requirement.rubricDigest,
      } } }] });
      const receipt = createReviewReceipt({
        target: state.target,
        requirement: state.requirement,
        request: state.request,
        applicabilityId: null,
        reviewRunId: "review-run-1",
        evaluatorIdentity: state.request.evaluatorIdentity,
        attestingRuntimeIdentity: state.attestation.runtimeIdentity,
        attestationMechanism: state.attestation.mechanism,
        providerEventIdentity: null,
        result: "clean",
        findings: [],
      });
      await recordLocalReceiptConclusion(context.dependencies.operationStore, {
        state, receipt, now: "2026-08-06T17:10:00Z",
      });
      context.dependencies.readReceipts = async () => ({ ledgerVersion: 1, receipts: [receipt] });
      await expect(prepareLocalReview(request, context.dependencies)).resolves.toMatchObject({
        state: "review-complete",
        payload: { operationId: state.operationId },
      });

      const changedTarget = createReviewTarget({
        schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
        repositoryId: state.repositoryId, baseRef: state.target.baseRef,
        diffBaseSha: objectId("9"), diffBaseTree: objectId("8"),
        headSha: state.target.headSha, headTree: state.target.headTree,
      });
      context.deriveTarget.mockResolvedValue(changedTarget);
      context.validatePolicyAdmission.mockResolvedValue({ state: "ready", pass: 2 });
      const fresh = await prepareLocalReview(request, context.dependencies);
      expect(fresh).toMatchObject({
        state: "ready",
        payload: { target: changedTarget },
      });
      if (fresh.state !== "ready") throw new Error("expected a fresh local review");
      expect(fresh.payload.operationId).not.toBe(state.operationId);
    });

    it("admits successive named local passes after clean convergence without duplicate replay", async () => {
      const context = fixture();
      const first = await prepareLocalReview(request, context.dependencies);
      if (first.state !== "ready") throw new Error("first local review was not prepared");
      const firstState = context.published();
      if (firstState?.kind !== "local-review") throw new Error("first local operation is unavailable");
      const firstReceipt = createReviewReceipt({
        target: firstState.target,
        requirement: firstState.requirement,
        request: firstState.request,
        applicabilityId: null,
        reviewRunId: "review-run-1",
        evaluatorIdentity: firstState.request.evaluatorIdentity,
        attestingRuntimeIdentity: firstState.attestation.runtimeIdentity,
        attestationMechanism: firstState.attestation.mechanism,
        providerEventIdentity: null,
        result: "clean",
        findings: [],
      });
      await recordLocalReceiptConclusion(context.dependencies.operationStore, {
        state: firstState, receipt: firstReceipt, now: "2026-08-06T17:10:00Z",
      });
      context.dependencies.readReceipts = async () => ({ ledgerVersion: 1, receipts: [firstReceipt] });
      const approval = {
        headSha: firstState.target.headSha,
        precedingProducerId: firstState.operationId,
        completedPasses: 1,
        nextPass: 2,
      };
      context.validatePolicyAdmission.mockResolvedValueOnce({ state: "ready", pass: 2 });
      const second = await prepareLocalReview({
        ...request, policyJudgment: { additionalPassAuthorization: approval },
      }, context.dependencies);
      if (second.state !== "ready") throw new Error("second local review was not prepared");
      expect(second.payload.operationId).not.toBe(first.payload.operationId);
      await expect(prepareLocalReview({
        ...request, policyJudgment: { additionalPassAuthorization: approval },
      }, context.dependencies)).resolves.toMatchObject({
        state: "ready", payload: { operationId: second.payload.operationId },
      });
      const secondState = context.published();
      if (secondState?.kind !== "local-review") throw new Error("second local operation is unavailable");
      const secondReceipt = createReviewReceipt({
        target: secondState.target,
        requirement: secondState.requirement,
        request: secondState.request,
        applicabilityId: null,
        reviewRunId: "review-run-2",
        evaluatorIdentity: secondState.request.evaluatorIdentity,
        attestingRuntimeIdentity: secondState.attestation.runtimeIdentity,
        attestationMechanism: secondState.attestation.mechanism,
        providerEventIdentity: null,
        result: "clean",
        findings: [],
      });
      await recordLocalReceiptConclusion(context.dependencies.operationStore, {
        state: secondState, receipt: secondReceipt, now: "2026-08-06T17:11:00Z",
      });
      context.dependencies.readReceipts = async () => ({
        ledgerVersion: 2, receipts: [firstReceipt, secondReceipt],
      });
      await expect(prepareLocalReview({
        ...request, policyJudgment: { additionalPassAuthorization: approval },
      }, context.dependencies)).resolves.toMatchObject({
        state: "review-complete", payload: { operationId: second.payload.operationId },
      });
      context.validatePolicyAdmission.mockResolvedValueOnce({ state: "ready", pass: 3 });
      const third = await prepareLocalReview({
        ...request,
        policyJudgment: { additionalPassAuthorization: {
          headSha: secondState.target.headSha,
          precedingProducerId: secondState.operationId,
          completedPasses: 2,
          nextPass: 3,
        } },
      }, context.dependencies);
      expect(third).toMatchObject({ state: "ready" });
      if (third.state !== "ready") throw new Error("third local review was not prepared");
      expect(third.payload.operationId).not.toBe(second.payload.operationId);
    });

    it("persists ordinary local chunk scope through operation and lane admission", async () => {
      const context = fixture();

      await expect(prepareLocalReview({
        ...request,
        policyJudgment: { scopeMode: "chunked" },
      }, context.dependencies)).resolves.toMatchObject({ state: "ready" });

      expect(context.published()).toMatchObject({ scopeMode: "chunked" });
      expect(context.laneProgress()).toMatchObject({
        attempts: [{ local: { scopeMode: "chunked" } }],
      });
    });

    it("stops a non-delivery pass without live driver admission before materialization", async () => {
      const context = fixture();
      context.validatePolicyAdmission.mockRejectedValueOnce(new Error("review pass ceiling requires approval"));

      await expect(prepareLocalReview(request, context.dependencies))
        .rejects.toThrow(/ceiling requires approval/u);
      expect(context.materialize).not.toHaveBeenCalled();
      expect(context.operations.size).toBe(0);
    });

    it("reauthorizes local admission when a hosted terminal wins the lane owner", async () => {
      const context = fixture();
      const store = context.dependencies.operationStore;
      const publish = store.publishOperation.bind(store);
      let injectedHostedTerminal = false;
      store.publishOperation = async (state, expectedVersion) => {
        const result = await publish(state, expectedVersion);
        if (state.kind !== "local-review" || injectedHostedTerminal) return result;
        injectedHostedTerminal = true;
        const hostedTarget = {
          repository: "owner/repository",
          pullRequest: 42,
          headSha: state.target.headSha,
        };
        const requirement = createReviewRequirement({
          target: state.target,
          projection: {
            obligation: "required",
            reasons: ["sensitive-change-set"],
            rubricVersion: "standard-review/v1",
            rubricDigest: `sha256:${"e".repeat(64)}`,
            retrigger: "full-final",
            count: 1,
          },
          acceptableSources: [{ sourceKind: "hosted", qualifier: "coderabbit-pr" }],
          initialAdmission: "automatic",
        });
        if (requirement === null) throw new Error("expected hosted requirement");
        const admission = createHostedAdmission({
          schemaVersion: 1,
          repositoryId: state.repositoryId,
          lineage: state.lineage,
          logicalPass: 1,
          sourceId: "coderabbit-pr",
          target: hostedTarget,
          requestedCoverage: "complete",
          reviewTarget: state.target,
          requirement,
          actorIdentity: "github-user-1",
        });
        const terminal = createHostedTerminalAttemptFixture({
          admission,
          outcome: "clean",
        });
        await recordLaneAttempt(store, {
          lane: "standard",
          repositoryId: state.repositoryId,
          changeRequestId: "pull/42",
          headSha: state.target.headSha,
          lineage: state.lineage,
          logicalPass: 1,
          retryGeneration: 0,
          attemptId: terminal.attemptId,
          sourceId: admission.sourceId,
          outcome: "clean",
          consumedPass: true,
          hosted: terminal.hosted,
          now: "2026-08-06T17:00:30Z",
        });
        return result;
      };
      context.validatePolicyAdmission.mockImplementation(async ({ completedPasses }) => {
        if (completedPasses > 0) throw new Error("review pass already completed");
        return { state: "ready", pass: 1 };
      });

      await expect(prepareLocalReview(request, context.dependencies))
        .rejects.toThrow(/pass already completed/u);
    });

    it("carries and freshly validates the exact driver admission before local preparation", async () => {
      const context = fixture();
      const admittedProjection = {
        obligation: "required" as const,
        reasons: ["sensitive-change-set" as const],
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "admitted" }),
        retrigger: "full-final" as const,
        count: 1 as const,
      };
      context.validateDeliveryAdmission.mockResolvedValue(admittedProjection);
      const deliveryAdmission = {
        schemaVersion: 1 as const,
        sourceId: "delegated-agent" as const,
        statusTarget: {
          repository: "owner/repository",
          headRef: "delivery/member-1",
          headSha: context.memberTarget.headSha,
        },
        target: {
          repository: "owner/repository",
          pullRequest: 41,
          headSha: context.memberTarget.headSha,
        },
        vehicle: {
          kind: "delivery-member" as const,
          planId: PLAN_ID,
          deliverableId: DELIVERABLE_ID,
          workUnitId: "review-surface-binding",
          head: context.memberTarget.headSha,
        },
        pass: 1,
        requestedCoverage: "complete" as const,
      };

      await expect(prepareLocalReview(
        { ...request, deliveryAdmission },
        context.dependencies,
      )).resolves.toMatchObject({ state: "ready", nextAction: "launch-review" });

      expect(context.validateDeliveryAdmission).toHaveBeenCalledWith(deliveryAdmission);
      expect(context.resolveAuthority).toHaveBeenCalledWith(
        "evaluator-1",
        context.memberTarget.headSha,
        deliveryAdmission,
      );
      expect(context.published()).toMatchObject({ deliveryAdmission });
      expect(context.published()).toMatchObject({
        requirement: {
          reasons: ["sensitive-change-set"],
          rubricDigest: admittedProjection.rubricDigest,
          retrigger: "full-final",
        },
      });
    });

    it("stops a stale driver admission before publishing a local operation", async () => {
      const context = fixture();
      const deliveryAdmission = {
        schemaVersion: 1 as const,
        sourceId: "delegated-agent" as const,
        statusTarget: {
          repository: "owner/repository",
          headRef: "delivery/member-1",
          headSha: context.memberTarget.headSha,
        },
        target: {
          repository: "owner/repository",
          pullRequest: 41,
          headSha: context.memberTarget.headSha,
        },
        vehicle: {
          kind: "delivery-member" as const,
          planId: PLAN_ID,
          deliverableId: DELIVERABLE_ID,
          workUnitId: "review-surface-binding",
          head: context.memberTarget.headSha,
        },
        pass: 1,
        requestedCoverage: "complete" as const,
      };
      context.validateDeliveryAdmission.mockRejectedValueOnce(new Error("delivery admission moved"));

      await expect(prepareLocalReview(
        { ...request, deliveryAdmission },
        context.dependencies,
      )).rejects.toThrow(/delivery admission moved/u);
      expect(context.operations.size).toBe(0);
    });

    it("feeds the resolution's recorded shas to derivation, and none without a selector", async () => {
      const context = fixture();

      await prepareLocalReview(
        { ...request, deliveryAdmission: deliveryAdmission(context.memberTarget.headSha) },
        context.dependencies,
      );
      expect(context.deriveTarget).toHaveBeenCalledWith("repo-1", context.memberCoordinates);

      const plain = fixture();
      await prepareLocalReview(request, plain.dependencies);
      expect(plain.deriveTarget).toHaveBeenCalledWith("repo-1", undefined);
    });

    it("refuses an unresolvable vehicle before a dirty worktree", async () => {
      const context = fixture();
      const deriveTarget = vi.fn(async () => {
        throw new Error("dirty-worktree");
      });
      const resolveAuthority = vi.fn(async () => {
        throw new Error("vehicle-unresolved");
      });

      await expect(prepareLocalReview(request, {
        ...context.dependencies,
        deriveTarget,
        resolveAuthority,
      } as unknown as Parameters<typeof prepareLocalReview>[1]))
        .rejects.toThrow(/vehicle-unresolved/u);
      expect(deriveTarget).not.toHaveBeenCalled();
    });

    it("carries the member's pinned head through the source descriptor and materialization", async () => {
      const context = fixture();

      await prepareLocalReview(
        { ...request, deliveryAdmission: deliveryAdmission(context.memberTarget.headSha) },
        context.dependencies,
      );

      expect(context.materialize).toHaveBeenCalledWith(expect.objectContaining({
        headSha: context.memberTarget.headSha,
        diffBaseSha: context.memberTarget.diffBaseSha,
      }));
    });

    it("snapshots the member's base ref and recorded diff base into the admission carrier", async () => {
      const context = fixture();

      await prepareLocalReview(
        { ...request, deliveryAdmission: deliveryAdmission(context.memberTarget.headSha) },
        context.dependencies,
      );

      const state = context.published();
      expect(state).toMatchObject({
        target: {
          baseRef: "main",
          diffBaseSha: context.memberCoordinates.base,
          headSha: context.memberCoordinates.head,
        },
      });
      // The carrier's snapshot is built from that same target, so a request bound
      // to it carries the member's coordinates rather than the work-unit branch's.
      expect(state?.kind === "local-review" && state.request.targetId)
        .toBe(context.memberTarget.targetId);
    });

    it("preserves the no-selector path in a work-unit context", async () => {
      const context = fixture();

      await expect(prepareLocalReview(request, context.dependencies))
        .resolves.toMatchObject({ state: "ready" });

      expect(context.published()).toMatchObject({
        vehicle: { kind: "work-unit", identity: "review-surface-binding" },
        lineage: { kind: "candidate", candidateId: `sha256:${"7".repeat(64)}` },
        targetId: context.changeSetTarget.targetId,
        target: { kind: "change-set" },
      });
      expect(context.resolveLineage).toHaveBeenCalledWith(
        { kind: "work-unit", identity: "review-surface-binding" },
        context.changeSetTarget.headSha,
        undefined,
        undefined,
      );
    });

    it("preserves the no-selector path in an Errand context", async () => {
      const context = fixture();
      const resolveAuthority = vi.fn(async () => ({
        authority: {
          vehicle: { kind: "errand" as const, identity: "repair-review-state", claimId: "claim-1" },
          authorIdentity: "author-1",
          evaluatorIdentity: "evaluator-1",
          attestationRuntimeKind: "arc-cli",
          runtimeIdentity: "arc-cli/0.1.0",
          attestationMechanism: "local-attestation" as const,
        },
        member: null,
      }));

      await expect(prepareLocalReview(request, {
        ...context.dependencies,
        resolveAuthority,
      } as unknown as Parameters<typeof prepareLocalReview>[1]))
        .resolves.toMatchObject({ state: "ready" });

      expect(context.published()).toMatchObject({
        vehicle: { kind: "errand", identity: "repair-review-state", claimId: "claim-1" },
        target: { kind: "change-set" },
      });
      expect(context.deriveTarget).toHaveBeenCalledWith("repo-1", undefined);
    });

    describe("re-entrant admission", () => {
      it("replays the same member but refuses changed pull-request authority", async () => {
        const context = fixture();
        const memberRequest = {
          ...request,
          deliveryAdmission: deliveryAdmission(context.memberTarget.headSha),
        };

        const first = await prepareLocalReview(memberRequest, context.dependencies);
        const second = await prepareLocalReview(memberRequest, context.dependencies);
        if (first.state !== "ready" || second.state !== "ready") {
          throw new Error("member re-preparation was not ready");
        }

        expect(second.payload.operationId).toBe(first.payload.operationId);
        expect(context.operations.size).toBe(2);
        const changed = { ...memberRequest, deliveryAdmission: { ...memberRequest.deliveryAdmission,
          target: { ...memberRequest.deliveryAdmission.target, pullRequest: 42 } } };
        await expect(prepareLocalReview(changed, context.dependencies))
          .rejects.toThrow("local pending admission does not match its operation");
      });

      it("replays a pending admission before current policy and evaluator selection", async () => {
        const context = fixture();
        const first = await prepareLocalReview(request, context.dependencies);
        if (first.state !== "ready") throw new Error("first local preparation was not ready");
        const admittedAuthority = context.resolveAuthority.getMockImplementation();
        context.resolveAuthority.mockImplementation(async (evaluatorIdentity, memberHeadObjectId) => {
          if (evaluatorIdentity === "replacement-evaluator") {
            throw new Error("replacement evaluator is not admissible");
          }
          if (admittedAuthority === undefined) throw new Error("missing admitted authority");
          return admittedAuthority(evaluatorIdentity, memberHeadObjectId);
        });
        context.composeAssurance.mockRejectedValueOnce(new Error("current assurance drifted"));
        context.resolvePolicy.mockImplementationOnce(() => {
          throw new Error("current policy drifted");
        });

        const replay = await prepareLocalReview(
          { ...request, evaluatorIdentity: "replacement-evaluator" },
          context.dependencies,
        );

        expect(replay).toMatchObject({
          state: "ready",
          payload: {
            operationId: first.payload.operationId,
            request: { evaluatorIdentity: "evaluator-1" },
          },
        });
        expect(context.composeAssurance).toHaveBeenCalledTimes(1);
        expect(context.resolvePolicy).toHaveBeenCalledTimes(1);
      });

      it("replays admitted chunked incremental coverage when optional selections are omitted", async () => {
        const context = fixture();
        const correctionScope = {
          schemaVersion: 1 as const,
          predecessorProducerId: "local-predecessor",
          predecessorHeadSha: objectId("a"),
          basisHeadSha: objectId("9"),
          headSha: context.changeSetTarget.headSha,
          requiredFindings: [{
            producerId: "local-predecessor", findingId: "F-material", locus: "src/work-unit.ts:4",
          }],
        };
        const first = await prepareLocalReview({
          ...request,
          policyJudgment: { scopeMode: "chunked" },
          coverageAdmission: { requestedCoverage: "incremental", correctionScope },
        }, context.dependencies);
        if (first.state !== "ready") throw new Error("first local preparation was not ready");

        const replay = await prepareLocalReview(request, context.dependencies);
        expect(replay).toMatchObject({
          state: "ready",
          payload: {
            operationId: first.payload.operationId,
            reviewerPayload: { correctionScope },
          },
        });
        expect(context.published()).toMatchObject({
          scopeMode: "chunked", coverageAdmission: { requestedCoverage: "incremental" },
        });
      });

      it("keeps a fresh invalid evaluator outside the recovery path", async () => {
        const context = fixture();
        context.resolveAuthority.mockRejectedValueOnce(new Error("replacement evaluator is not admissible"));
        await expect(prepareLocalReview({
          ...request, evaluatorIdentity: "replacement-evaluator",
        }, context.dependencies)).rejects.toThrow(/not admissible/u);
        expect(context.operations.size).toBe(0);
      });

      it.each([
        ["runtime", false],
        ["policy", true],
      ] as const)(
        "keeps operation-first crash residue unexecutable across %s drift",
        async (drift, allocatesReplacement) => {
          const context = fixture();
          const operationStore = context.dependencies.operationStore;
          const interruptedStore = {
            readOperation: operationStore.readOperation,
            publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
              if (state.kind === "lane-progress") {
                throw new Error("lane-owner admission interrupted");
              }
              return operationStore.publishOperation(state, expectedVersion);
            },
          };

          await expect(prepareLocalReview(request, {
            ...context.dependencies,
            operationStore: interruptedStore,
          })).rejects.toThrow(/lane-owner admission interrupted/u);
          const orphan = [...context.operations.values()]
            .map(({ state }) => state)
            .find((state) => state.kind === "local-review");
          if (orphan === undefined || orphan.kind !== "local-review") {
            throw new Error("interrupted local operation was not published");
          }
          expect(context.laneProgress()).toBeNull();

          if (drift === "runtime") {
            context.resolveAuthority.mockResolvedValueOnce({
              authority: {
                vehicle: { kind: "work-unit", identity: "review-surface-binding" },
                authorIdentity: "author-1",
                evaluatorIdentity: "evaluator-1",
                attestationRuntimeKind: "arc-cli",
                runtimeIdentity: "arc-cli/0.2.0",
                attestationMechanism: "local-attestation",
              },
              member: null,
            });
          } else {
            context.resolvePolicy.mockReturnValueOnce({
              status: "resolved",
              binding: {
                ...DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
                bindingDigest: `sha256:${"8".repeat(64)}`,
              },
              diagnostics: [],
            });
          }

          const recovered = await prepareLocalReview(request, context.dependencies);
          if (recovered.state !== "ready") throw new Error("local operation was not recovered");
          expect(recovered.payload.operationId === orphan.operationId).toBe(!allocatesReplacement);
          expect(context.laneProgress()).toMatchObject({
            attempts: [{
              attemptId: recovered.payload.operationId,
              outcome: "pending",
            }],
          });
        },
      );

      it("renews an expired pending admission with the requested cleanup lifetime", async () => {
        const context = fixture();
        const first = await prepareLocalReview(
          { ...request, freshnessMs: 1 },
          context.dependencies,
        );
        const initial = context.published();
        const renewed = await prepareLocalReview(
          { ...request, freshnessMs: 60_000 },
          context.dependencies,
        );
        const current = context.published();

        if (first.state !== "ready" || renewed.state !== "ready"
          || initial?.kind !== "local-review" || current?.kind !== "local-review") {
          throw new Error("pending local admission was not renewed");
        }
        expect(renewed.payload.operationId).toBe(first.payload.operationId);
        expect(current.updatedAt).not.toBe(initial.updatedAt);
        expect(current.cleanupTtlMs).toBe(60_000);
      });

      it("advances native retry generation after a failed local attempt", async () => {
        const context = fixture();
        const validatePolicyAdmission: Parameters<
          typeof prepareLocalReview
        >[1]["validatePolicyAdmission"] = async ({
          standardReview,
          completedPasses,
          attempts,
          judgment,
        }) => ({ state: "ready", pass: assertStandardReviewExecutionAdmission({
          target: {
            repository: "owner/repository",
            pullRequest: null,
            headSha: context.changeSetTarget.headSha,
          },
          frontlineActive: false,
          standardReview,
          completedPasses,
          attempts,
          sources: ["delegated-agent"],
          maxPasses: 2,
          expectedSourceId: "delegated-agent",
          expectedNextAction: "local-prepare",
          judgment: {
            ...judgment,
            invocation: { mode: "force", sourceId: "delegated-agent" },
          },
        }).payload.pass });
        const dependencies = { ...context.dependencies, validatePolicyAdmission };
        const first = await prepareLocalReview(request, dependencies);
        const state = context.published();
        const owner = context.laneProgress();
        if (first.state !== "ready"
          || state?.kind !== "local-review"
          || owner?.kind !== "lane-progress"
          || owner.attempts[0]?.local === undefined) {
          throw new Error("first local attempt was not admitted");
        }
        await recordLaneAttempt(context.dependencies.operationStore, {
          lane: "standard",
          repositoryId: state.repositoryId,
          changeRequestId: null,
          headSha: state.target.headSha,
          lineage: state.lineage,
          logicalPass: state.logicalPass,
          retryGeneration: state.retryGeneration,
          attemptId: state.operationId,
          sourceId: state.laneSourceId,
          outcome: "terminal-failure",
          consumedPass: false,
          advancePendingAttempt: true,
          local: owner.attempts[0].local,
          now: "2026-08-06T18:00:00Z",
        });

        const retry = await prepareLocalReview(request, dependencies);
        if (retry.state !== "ready") throw new Error("local retry was not prepared");
        expect(retry.payload.operationId).not.toBe(first.payload.operationId);
        expect(retry.payload.request).toMatchObject({ logicalPass: 1, generation: 1 });

        const retryState = context.published();
        const retryOwner = context.laneProgress();
        const retryAttempt = retryOwner?.kind === "lane-progress"
          ? retryOwner.attempts.find(({ attemptId }) => attemptId === retry.payload.operationId)
          : undefined;
        if (retryState?.kind !== "local-review" || retryAttempt?.local === undefined) {
          throw new Error("local retry admission was not persisted");
        }
        await recordLaneAttempt(context.dependencies.operationStore, {
          lane: "standard",
          repositoryId: retryState.repositoryId,
          changeRequestId: null,
          headSha: retryState.target.headSha,
          lineage: retryState.lineage,
          logicalPass: retryState.logicalPass,
          retryGeneration: retryState.retryGeneration,
          attemptId: retryState.operationId,
          sourceId: retryState.laneSourceId,
          outcome: "terminal-failure",
          consumedPass: false,
          advancePendingAttempt: true,
          local: retryAttempt.local,
          now: "2026-08-06T18:01:00Z",
        });

        const secondRetry = await prepareLocalReview(request, dependencies);
        expect(secondRetry).toMatchObject({
          state: "ready",
          payload: { request: { logicalPass: 1, generation: 2 } },
        });
      });

      it("admits a distinct same-target pass after findings are settled", async () => {
        const context = fixture();
        const first = await prepareLocalReview(request, context.dependencies);
        const state = context.published();
        const owner = context.laneProgress();
        if (first.state !== "ready"
          || state?.kind !== "local-review"
          || owner?.kind !== "lane-progress"
          || owner.attempts[0]?.local === undefined) {
          throw new Error("first local attempt was not admitted");
        }
        await recordLaneAttempt(context.dependencies.operationStore, {
          lane: "standard",
          repositoryId: state.repositoryId,
          changeRequestId: null,
          headSha: state.target.headSha,
          lineage: state.lineage,
          logicalPass: state.logicalPass,
          retryGeneration: state.retryGeneration,
          attemptId: state.operationId,
          sourceId: state.laneSourceId,
          outcome: "findings",
          consumedPass: true,
          chunkSeriesComplete: true,
          advancePendingAttempt: true,
          local: {
            ...owner.attempts[0].local,
            effectiveCoverage: owner.attempts[0].local.requestedCoverage,
          },
          now: "2026-08-06T18:00:00Z",
        });
        await settleLaneAttempt(context.dependencies.operationStore, {
          lane: "standard",
          repositoryId: state.repositoryId,
          headSha: state.target.headSha,
          lineage: state.lineage,
          attemptId: state.operationId,
          now: "2026-08-06T18:01:00Z",
        });
        context.validatePolicyAdmission.mockResolvedValueOnce({ state: "ready", pass: 2 });

        const next = await prepareLocalReview(request, context.dependencies);

        expect(next).toMatchObject({
          state: "ready",
          payload: { request: { logicalPass: 2, generation: 0 } },
        });
        if (next.state !== "ready") throw new Error("next local pass was not prepared");
        expect(next.payload.operationId).not.toBe(first.payload.operationId);
      });

      it("consumes a response-bound conditional pass before returning local review work", async () => {
        const context = fixture();
        const first = await prepareLocalReview(request, context.dependencies);
        const state = context.published();
        const owner = context.laneProgress();
        if (first.state !== "ready"
          || state?.kind !== "local-review"
          || owner?.kind !== "lane-progress"
          || owner.attempts[0]?.local === undefined) {
          throw new Error("first local attempt was not admitted");
        }
        await recordLaneAttempt(context.dependencies.operationStore, {
          lane: "standard",
          repositoryId: state.repositoryId,
          changeRequestId: null,
          headSha: state.target.headSha,
          lineage: state.lineage,
          logicalPass: state.logicalPass,
          retryGeneration: state.retryGeneration,
          attemptId: state.operationId,
          sourceId: state.laneSourceId,
          outcome: "findings",
          consumedPass: true,
          chunkSeriesComplete: true,
          advancePendingAttempt: true,
          local: {
            ...owner.attempts[0].local,
            effectiveCoverage: owner.attempts[0].local.requestedCoverage,
          },
          now: "2026-08-06T18:00:00Z",
        });
        const dispositionSetId = CanonicalDigestSchema.parse(`sha256:${"6".repeat(64)}`);
        const captured = await captureConditionalNextPassAuthorization(
          context.dependencies.operationStore,
          {
            lane: "standard",
            repositoryId: state.repositoryId,
            headSha: state.target.headSha,
            lineage: state.lineage,
            producerId: state.operationId,
            dispositionSetId,
            authorizedBy: "owner-1",
            exhaustedPassCount: 1,
            nextPass: 2,
            now: "2026-08-06T18:00:30Z",
          },
        );
        await settleLaneAttempt(context.dependencies.operationStore, {
          lane: "standard",
          repositoryId: state.repositoryId,
          headSha: state.target.headSha,
          lineage: state.lineage,
          attemptId: state.operationId,
          dispositionSetId,
          producedHeadSha: state.target.headSha,
          now: "2026-08-06T18:01:00Z",
        });
        context.validatePolicyAdmission.mockResolvedValueOnce({ state: "ready", pass: 2 });

        const authorizedRequest = {
          ...request,
          policyJudgment: {
            ceilingOverride: {
              exhaustedPassCount: 1,
              nextPass: 2,
              conditionalPassAuthorizationId: captured.authorizationId,
            },
          },
        };
        await expect(prepareLocalReview(authorizedRequest, context.dependencies)).resolves.toMatchObject({
          state: "ready",
          nextAction: "launch-review",
          payload: { request: { logicalPass: 2 } },
        });
        await expect(readLaneProgressOwner(context.dependencies.operationStore, {
          lane: "standard",
          repositoryId: state.repositoryId,
          headSha: state.target.headSha,
          lineage: state.lineage,
        })).resolves.toMatchObject({
          attempts: expect.arrayContaining([expect.objectContaining({
            conditionalPassAuthorizations: expect.objectContaining({
              authorizations: [expect.objectContaining({
                status: "consumed",
                producedHeadSha: state.target.headSha,
              })],
            }),
          })]),
        });
        const second = context.published();
        const secondOwner = context.laneProgress();
        if (second?.kind !== "local-review" || secondOwner?.kind !== "lane-progress") {
          throw new Error("authorized local attempt was not prepared");
        }
        const secondBinding = secondOwner.attempts.find(({ attemptId }) => attemptId === second.operationId)?.local;
        if (secondBinding === undefined) throw new Error("authorized local binding is unavailable");
        const receipt = createReviewReceipt({
          target: second.target,
          requirement: second.requirement,
          request: second.request,
          applicabilityId: null,
          reviewRunId: "authorized-pass-2-run",
          evaluatorIdentity: second.request.evaluatorIdentity,
          attestingRuntimeIdentity: second.attestation.runtimeIdentity,
          attestationMechanism: second.attestation.mechanism,
          providerEventIdentity: null,
          result: "clean",
          findings: [],
        });
        await recordLaneAttempt(context.dependencies.operationStore, {
          lane: "standard", repositoryId: second.repositoryId, changeRequestId: null,
          headSha: second.target.headSha, lineage: second.lineage,
          logicalPass: 2, retryGeneration: second.retryGeneration,
          attemptId: second.operationId, sourceId: second.laneSourceId,
          outcome: "clean", consumedPass: true, chunkSeriesComplete: true,
          advancePendingAttempt: true,
          local: { ...secondBinding, effectiveCoverage: secondBinding.requestedCoverage },
          now: "2026-08-06T18:02:00Z",
        });
        context.dependencies.readReceipts = async () => ({ ledgerVersion: 1, receipts: [receipt] });
        await expect(prepareLocalReview(authorizedRequest, context.dependencies)).resolves.toMatchObject({
          state: "review-complete", nextAction: "reduce",
          payload: { operationId: second.operationId },
        });
      });

      it("holds distinct operation identities for a member and a work unit in one repository", async () => {
        const context = fixture();

        const member = await prepareLocalReview(
          { ...request, deliveryAdmission: deliveryAdmission(context.memberTarget.headSha) },
          context.dependencies,
        );
        const workUnit = await prepareLocalReview(request, context.dependencies);
        if (member.state !== "ready" || workUnit.state !== "ready") {
          throw new Error("member and work-unit preparation were not both ready");
        }

        // The operation key is derived from the target, so the two vehicles never
        // collide on one key — the second admits fresh rather than mismatching.
        expect(workUnit.payload.operationId).not.toBe(member.payload.operationId);
        expect(context.operations.size).toBe(4);
        expect(context.published()).toMatchObject({
          vehicle: { kind: "work-unit", identity: "review-surface-binding" },
          targetId: context.changeSetTarget.targetId,
        });
      });

      it("admits a separate ordinary operation when the selector is forgotten", async () => {
        const context = fixture();

        await prepareLocalReview(
          { ...request, deliveryAdmission: deliveryAdmission(context.memberTarget.headSha) },
          context.dependencies,
        );
        // A forgotten selector reviews the work-unit branch rather than the member,
        // which admits as its own operation instead of colliding with the member's.
        await expect(prepareLocalReview(request, context.dependencies))
          .resolves.toMatchObject({ state: "ready" });

        const admitted = [...context.operations.values()]
          .filter(({ state }) => state.kind === "local-review")
          .map(({ state }) => state.kind === "local-review" && state.vehicle.kind);
        expect(admitted).toEqual(["delivery-member", "work-unit"]);
      });
    });
  });

  it("converges concurrent identical preparations on the admitted operation", async () => {
    const target = createReviewTarget({
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
    const persisted = new Map<string, { version: number; state: ReviewOperationState }>();
    let persistedSource: LocalReviewSource | null = null;
    let sweepCalls = 0;
    let releaseSweeps: (() => void) | undefined;
    const bothSweeps = new Promise<void>((resolve) => {
      releaseSweeps = resolve;
    });
    let lockTail = Promise.resolve();
    let sourceAppendCount = 0;
    let clockTick = 0;
    const dependencies = {
      sweep: async () => {
        sweepCalls += 1;
        if (sweepCalls === 2) releaseSweeps?.();
        await bothSweeps;
      },
      laneSourceId: "delegated-agent",
      withLocalReviewLock: async <T>(action: () => Promise<T>) => {
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
      },
      withLaneOperationLock: async <T>(_input: unknown, action: () => Promise<T>) => action(),
      confirmDispositionSetCurrent: async () => true,
      resolveRepositoryId: async () => target.repositoryId,
      readCurrentHeadSha: async () => target.headSha,
      resolveVehicle: async () => ({
        vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
        authorIdentity: "author-1",
        member: null,
      }),
      deriveTarget: async () => target,
      confirmTarget: async () => ({ state: "current" as const, target }),
      resolveAuthority: async () => ({
        authority: {
          vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
          authorIdentity: "author-1",
          evaluatorIdentity: "evaluator-1",
          attestationRuntimeKind: "arc-cli",
          runtimeIdentity: "arc-cli/0.1.0",
          attestationMechanism: "local-attestation" as const,
        },
        member: null,
      }),
      resolveLineage: async () => ({
        kind: "candidate" as const,
        candidateId: CanonicalDigestSchema.parse(`sha256:${"7".repeat(64)}`),
      }),
      resolveSupersessionAncestors: async () => [],
      composeAssurance: async () => ({
        status: "resolved" as const,
        assurance: { workContext: "work-unit" as const, workClass: "Heavy" as const },
        activity: { selfReview: true, frontlineReview: true },
        guidance: projectLocalReviewGuidance(),
        diagnostics: [],
      }),
      resolvePolicy: () => ({
        status: "resolved" as const,
        binding: DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
        diagnostics: [] as [],
      }),
      validatePolicySelection: () => undefined,
      validatePolicyAdmission: async () => ({ state: "ready" as const, pass: 1 }),
      validateDeliveryAdmission: async () => undefined,
      operationStore: {
        readOperation: async (operationId: string) => {
          const current = persisted.get(operationId);
          return current ?? { version: 0, state: null };
        },
        publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
          const current = persisted.get(state.operationId)?.version ?? 0;
          if (current !== expectedVersion) {
            throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
          }
          const version = current + 1;
          persisted.set(state.operationId, { version, state });
          return { version };
        },
      },
      sourceStore: {
        readSource: async () => persistedSource,
        appendSource: async (source: LocalReviewSource) => {
          sourceAppendCount += 1;
          persistedSource = source;
          return { sourceRef: "sources/local.json" };
        },
      },
      readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
      describeSource: async (operationId: string) => createLocalReviewSource({
        schemaVersion: 1,
        semanticsVersion: "git-object-range/v1",
        repositoryId: target.repositoryId,
        targetId: target.targetId,
        objectFormat: "sha1",
        diffBaseSha: target.diffBaseSha,
        diffBaseTree: target.diffBaseTree,
        headSha: target.headSha,
        headTree: target.headTree,
        reachabilityRef: `refs/arc/review/local/${operationId}`,
        materializationRef: "/tmp/review-root",
      }),
      materialize: async () => ({ reviewRoot: "/tmp/review-root" }),
      now: () => `2026-07-23T17:00:0${clockTick++}Z`,
    };
    const request = {
      schemaVersion: 1 as const,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    };

    const prepared = await Promise.all([
      prepareLocalReview(request, dependencies),
      prepareLocalReview(request, dependencies),
    ]);
    const first = prepared[0];
    if (first?.state !== "ready") throw new Error("first concurrent preparation was not ready");

    expect(first).toMatchObject({
      state: "ready",
      nextAction: "launch-review",
      payload: { persistedVersion: 1 },
    });
    expect(prepared[1]).toMatchObject({
      state: "ready",
      nextAction: "launch-review",
      payload: {
        operationId: first.payload.operationId,
        persistedVersion: 1,
      },
    });
    expect(sourceAppendCount).toBe(1);
  });

  it.each(["clean", "findings"] as const)(
    "returns an existing completed %s operation for reduction without relaunching",
    async (result) => {
      const target = createReviewTarget({
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
      let persistedVersion = 0;
      let persistedState: ReviewOperationState | null = null;
      let laneVersion = 0;
      let laneState: ReviewOperationState | null = null;
      let persistedSource: LocalReviewSource | null = null;
      let receipts: ReviewReceiptV2[] = [];
      let runtimeIdentity = "arc-cli/0.1.0";
      const materialize = vi.fn(async () => ({ reviewRoot: "/tmp/review-root" }));
      const dependencies = {
        sweep: async () => undefined,
        laneSourceId: "delegated-agent",
        withLocalReviewLock: async <T>(action: () => Promise<T>) => action(),
        withLaneOperationLock: async <T>(_input: unknown, action: () => Promise<T>) => action(),
        confirmDispositionSetCurrent: async () => true,
        resolveRepositoryId: async () => target.repositoryId,
        readCurrentHeadSha: async () => target.headSha,
        resolveVehicle: async () => ({
          vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
          authorIdentity: "author-1",
          member: null,
        }),
        deriveTarget: async () => target,
        confirmTarget: async () => ({ state: "current" as const, target }),
        resolveAuthority: async () => ({
          authority: {
            vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
            authorIdentity: "author-1",
            evaluatorIdentity: "evaluator-1",
            attestationRuntimeKind: "arc-cli",
            runtimeIdentity,
            attestationMechanism: "local-attestation" as const,
          },
          member: null,
        }),
        resolveLineage: async () => ({
          kind: "candidate" as const,
          candidateId: CanonicalDigestSchema.parse(`sha256:${"7".repeat(64)}`),
        }),
        resolveSupersessionAncestors: async () => [],
        composeAssurance: async () => ({
          status: "resolved" as const,
          assurance: { workContext: "work-unit" as const, workClass: "Heavy" as const },
          activity: { selfReview: true, frontlineReview: true },
          guidance: projectLocalReviewGuidance(),
          diagnostics: [],
        }),
        resolvePolicy: () => ({
          status: "resolved" as const,
          binding: DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
          diagnostics: [] as [],
        }),
        validatePolicySelection: () => undefined,
        validatePolicyAdmission: async () => ({ state: "ready" as const, pass: 1 }),
        validateDeliveryAdmission: async () => undefined,
        operationStore: {
          readOperation: async (operationId: string) => (
            persistedState?.operationId === operationId
              ? { version: persistedVersion, state: persistedState }
              : { version: laneVersion, state: laneState }
          ),
          publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
            if (state.kind === "lane-progress") {
              if (laneVersion !== expectedVersion) throw new Error("version-conflict");
              laneVersion += 1;
              laneState = state;
              return { version: laneVersion };
            }
            if (persistedVersion !== expectedVersion) throw new Error("version-conflict");
            persistedVersion += 1;
            persistedState = state;
            return { version: persistedVersion };
          },
        },
        sourceStore: {
          readSource: async () => persistedSource,
          appendSource: async (source: LocalReviewSource) => {
            persistedSource = source;
            return { sourceRef: "sources/local.json" };
          },
        },
        readReceipts: async () => ({ ledgerVersion: receipts.length, receipts }),
        describeSource: async (operationId: string) => createLocalReviewSource({
          schemaVersion: 1,
          semanticsVersion: "git-object-range/v1",
          repositoryId: target.repositoryId,
          targetId: target.targetId,
          objectFormat: "sha1",
          diffBaseSha: target.diffBaseSha,
          diffBaseTree: target.diffBaseTree,
          headSha: target.headSha,
          headTree: target.headTree,
          reachabilityRef: `refs/arc/review/local/${operationId}`,
          materializationRef: "/tmp/review-root",
        }),
        materialize,
        now: () => "2026-07-23T17:00:00Z",
      };
      const request = {
        schemaVersion: 1 as const,
        evaluatorIdentity: "evaluator-1",
        routingFacts,
      };

      const launched = await prepareLocalReview(request, dependencies);
      const source = persistedSource as LocalReviewSource | null;
      const initialState = persistedState as ReviewOperationState | null;
      if (launched.state !== "ready"
        || initialState === null
        || initialState.kind !== "local-review"
        || source === null) {
        throw new Error("local review was not prepared");
      }
      runtimeIdentity = "arc-cli/0.2.0";
      await expect(prepareLocalReview(request, dependencies)).resolves.toMatchObject({
        state: "ready",
        nextAction: "launch-review",
        payload: {
          operationId: initialState.operationId,
          persistedVersion: 2,
        },
      });
      const state = persistedState as ReviewOperationState | null;
      if (state === null || state.kind !== "local-review") {
        throw new Error("local review runtime binding was not renewed");
      }
      expect(state.updatedAt).toBe(initialState.updatedAt);
      expect(state.cleanupTtlMs).toBe(initialState.cleanupTtlMs);
      expect(state.attestation.runtimeIdentity).toBe(runtimeIdentity);
      const attestationResult = {
        status: "complete" as const,
        result,
        targetId: target.targetId,
        headSha: target.headSha,
        headTree: target.headTree,
        rubricVersion: state.requirement.rubricVersion,
        rubricDigest: state.requirement.rubricDigest,
        sourceDigest: source.sourceDigest,
        guidanceDigest: state.guidanceDigest,
        evaluatorIdentity: state.request.evaluatorIdentity,
        reviewRunId: `run-${result}`,
        applicabilityId: null,
        findings: result === "findings"
          ? [{
              findingId: "finding-1",
              severity: "major" as const,
              locus: "src/index.ts:1",
              evidenceUrlOrId: "review:finding-1",
            }]
          : [],
      };
      let interruptLanePublication = true;
      const interruptedOperationStore = {
        readOperation: dependencies.operationStore.readOperation,
        publishOperation: async (nextState: ReviewOperationState, expectedVersion: number) => {
          if (nextState.kind === "lane-progress" && interruptLanePublication) {
            interruptLanePublication = false;
            throw new Error("lane publication interrupted");
          }
          return dependencies.operationStore.publishOperation(nextState, expectedVersion);
        },
      };
      await expect(attestLocalReviewCommand({
        schemaVersion: 1,
        operationId: state.operationId,
        result: attestationResult,
      }, {
        withLocalReviewLock: dependencies.withLocalReviewLock,
        operationStore: interruptedOperationStore,
        sourceStore: dependencies.sourceStore,
        receiptStore: {
          readReceipts: dependencies.readReceipts,
          appendReceipt: async (receipt) => {
            receipts = [receipt];
            return {
              ledgerVersion: receipts.length,
              durableEvidenceRef: "receipts.json#1",
            };
          },
        },
        resolveAuthority: async () => (await dependencies.resolveAuthority()).authority,
        resolveGuidanceDigest: async () => state.guidanceDigest,
        confirmTarget: dependencies.confirmTarget,
        inspectMaterialization: async () => "materialized",
        releaseMaterialization: async () => undefined,
        now: () => "2026-07-23T21:00:00Z",
      })).rejects.toThrow(/lane publication interrupted/u);

      await expect(prepareLocalReview(request, dependencies)).resolves.toMatchObject({
        state: "review-complete",
        nextAction: "reduce",
        payload: {
          operationId: state.operationId,
          persistedVersion: 2,
          target,
        },
      });
      const recoveredLaneState = laneState as ReviewOperationState | null;
      if (recoveredLaneState === null || recoveredLaneState.kind !== "lane-progress") {
        throw new Error("local review lane progress was not recovered");
      }
      expect(recoveredLaneState).toMatchObject({
        completedPasses: 1,
        attempts: [{
          outcome: result,
          terminalProducer: true,
          local: {
            requestedCoverage: "complete",
            effectiveCoverage: "complete",
          },
        }],
      });
      await expect(attestLocalReviewCommand({
        schemaVersion: 1,
        operationId: state.operationId,
        result: attestationResult,
      }, {
        withLocalReviewLock: dependencies.withLocalReviewLock,
        operationStore: dependencies.operationStore,
        sourceStore: dependencies.sourceStore,
        receiptStore: {
          readReceipts: dependencies.readReceipts,
          appendReceipt: async () => ({
            ledgerVersion: receipts.length,
            durableEvidenceRef: "receipts.json#1",
          }),
        },
        resolveAuthority: async () => (await dependencies.resolveAuthority()).authority,
        resolveGuidanceDigest: async () => state.guidanceDigest,
        confirmTarget: dependencies.confirmTarget,
        inspectMaterialization: async () => "materialized",
        releaseMaterialization: async () => undefined,
        now: () => "2026-07-23T21:01:00Z",
      })).resolves.toMatchObject({
        state: "attested-current",
        nextAction: "reduce",
      });
      expect(materialize).toHaveBeenCalledTimes(2);
    },
  );
