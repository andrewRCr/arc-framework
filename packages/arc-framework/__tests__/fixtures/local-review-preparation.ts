/** Durable local preparation fixture shared by replay and target-recovery scenarios. */

import { vi } from "vitest";
import { CanonicalDigestSchema } from "../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewOperationState } from "../../src/scripts/review-gate/core/operation-state-schema.js";
import { createLocalReviewSource, type LocalReviewSource } from "../../src/scripts/review-gate/core/local-review-source.js";
import type { IncrementalReviewScope } from "../../src/scripts/review-gate/core/incremental-review-scope.js";
import { projectLocalReviewGuidance } from "../../src/scripts/review-gate/policy/local-review-guidance.js";
import { DEFAULT_LOCAL_REVIEW_POLICY_BINDING } from "../../src/scripts/review-gate/policy/local-review-policy.js";
import type { StandardReviewObligationProjection } from "../../src/scripts/review-gate/policy/standard-review-projection-schema.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";

const objectId = (character: string): string => character.repeat(40);

export const LOCAL_REVIEW_DELIVERABLE_ID = CanonicalDigestSchema.parse(`sha256:${"a".repeat(64)}`);
export const LOCAL_REVIEW_PLAN_ID = "123e4567-e89b-42d3-a456-426614174000";

export function createDeliveryLocalReviewAdmission(head: string, correctionScope?: IncrementalReviewScope) {
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
      planId: LOCAL_REVIEW_PLAN_ID,
      deliverableId: LOCAL_REVIEW_DELIVERABLE_ID,
      workUnitId: "review-surface-binding",
      head,
    },
    pass: 1,
    requestedCoverage: correctionScope === undefined ? "complete" as const : "incremental" as const,
    ...(correctionScope === undefined ? {} : { correctionScope }),
  };
}

export function createLocalReviewPreparationFixture() {
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
    planId: LOCAL_REVIEW_PLAN_ID,
    workUnitId: "review-surface-binding",
    deliverableId: LOCAL_REVIEW_DELIVERABLE_ID,
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
    : { authority: authorityOf({ kind: "delivery-member", identity: LOCAL_REVIEW_DELIVERABLE_ID }), member: memberCoordinates }
  ));
  const deriveTarget = vi.fn(async (
    _repositoryId: string,
    member?: { base: string; head: string },
  ) => (member === undefined ? changeSetTarget : memberTarget));
  const describeSource = vi.fn(async (
    operationId: string,
    target: typeof memberTarget,
    admission?: ReturnType<typeof createDeliveryLocalReviewAdmission>,
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
        planId: LOCAL_REVIEW_PLAN_ID,
        workUnitId: "review-surface-binding",
        deliverableId: LOCAL_REVIEW_DELIVERABLE_ID,
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
          vehicle: { kind: "delivery-member" as const, identity: LOCAL_REVIEW_DELIVERABLE_ID },
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
    now: () => new Date(Date.parse("2026-08-06T17:00:00Z") + clockTick++ * 1_000).toISOString(),
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
