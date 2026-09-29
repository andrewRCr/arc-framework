/** Faithful hosted admission and handle fixtures composed through production constructors. */

import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { CanonicalDigestSchema } from "../../src/lib/kernel/index.js";
import {
  createHostedSealedResult,
  LaneProgressStateSchema,
  type LaneProgressState,
} from "../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from
  "../../src/scripts/review-gate/core/ports.js";
import type {
  HostedCoverageEvidence,
  HostedFinding,
} from "../../src/scripts/review-gate/hosted/await.js";
import type { LaneSubjectLineage } from
  "../../src/scripts/review-gate/core/lane-admission.js";
import type { IncrementalReviewScope } from
  "../../src/scripts/review-gate/core/incremental-review-scope.js";
import {
  createHostedAdmission,
  hostedLaneAttemptId,
  type HostedArtifact,
  type HostedProgressVehicle,
  type HostedProviderId,
  type HostedRequestHandle,
  type HostedReviewCoverage,
  type HostedTarget,
} from "../../src/scripts/review-gate/hosted/request.js";

const objectId = (character: string): string => character.repeat(40);

export interface HostedHandleFixtureInput {
  readonly repositoryId?: string;
  readonly lineage?: LaneSubjectLineage;
  readonly logicalPass?: number;
  readonly provider?: HostedProviderId;
  readonly target?: HostedTarget;
  readonly requestedCoverage?: HostedReviewCoverage;
  readonly effectiveCoverage?: HostedReviewCoverage;
  readonly correctionScope?: IncrementalReviewScope;
  readonly vehicle?: HostedProgressVehicle;
  readonly actorIdentity?: string;
  readonly artifact?: HostedArtifact;
}

/** Create a complete hosted handle whose admission matches every carried field. */
export function createHostedHandleFixture(
  input: HostedHandleFixtureInput = {},
): HostedRequestHandle {
  const repositoryId = input.repositoryId ?? "repo-1";
  const provider = input.provider ?? "coderabbit-pr";
  const requestedCoverage = input.requestedCoverage ?? "complete";
  const target = input.target ?? {
    repository: "owner/repo",
    pullRequest: 42,
    headSha: objectId("c"),
  };
  const correctionScope = input.correctionScope ?? (requestedCoverage === "incremental"
    ? {
        schemaVersion: 1 as const,
        predecessorProducerId: "prior-review",
        predecessorHeadSha: objectId("b"),
        basisHeadSha: objectId("b"),
        headSha: target.headSha,
        requiredFindings: [],
      }
    : undefined);
  const deliveryVehicle = input.vehicle?.kind === "delivery-member" ? input.vehicle : undefined;
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: deliveryVehicle === undefined ? "change-set" : "delivery-member",
    repositoryId,
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: target.headSha,
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"e".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "hosted", qualifier: provider }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("hosted fixture requires a review obligation");
  const lineage = input.lineage ?? (deliveryVehicle === undefined
    ? input.vehicle?.kind === "errand"
      ? {
          kind: "head-bound" as const,
          vehicleKind: "errand",
          vehicleIdentity: input.vehicle.claimId,
          headSha: target.headSha,
        }
      : { kind: "candidate" as const, candidateId: `sha256:${"f".repeat(64)}` }
    : {
        kind: "delivery-member" as const,
        planId: deliveryVehicle.planId,
        workUnitId: deliveryVehicle.workUnitId,
        deliverableId: deliveryVehicle.deliverableId,
      });
  const admission = createHostedAdmission({
    schemaVersion: 1,
    repositoryId,
    lineage,
    logicalPass: input.logicalPass ?? 1,
    sourceId: provider,
    target,
    requestedCoverage,
    ...(correctionScope === undefined ? {} : { correctionScope }),
    ...(input.vehicle === undefined ? {} : { vehicle: input.vehicle }),
    reviewTarget,
    requirement,
    actorIdentity: input.actorIdentity ?? "github-user-1",
  });
  return {
    schemaVersion: 1,
    provider,
    requestedCoverage,
    effectiveCoverage: input.effectiveCoverage ?? requestedCoverage,
    target,
    artifact: input.artifact ?? {
      kind: "issue-comment",
      id: "comment-1",
      url: "https://example.invalid/comment-1",
      createdAt: "2026-08-15T11:00:00Z",
    },
    ...(input.vehicle === undefined ? {} : { vehicle: input.vehicle }),
    admission,
  };
}

type HostedAttemptBinding = NonNullable<LaneProgressState["attempts"][number]["hosted"]>;

/** Create one production-shaped hosted terminal attempt from an already-admitted producer. */
export function createHostedTerminalAttemptFixture(input: {
  readonly admission: HostedRequestHandle["admission"];
  readonly effectiveCoverage?: HostedReviewCoverage;
  readonly coverageEvidence?: HostedCoverageEvidence;
  readonly artifact?: HostedArtifact;
  readonly outcome: "clean" | "findings";
  readonly reviewUrl?: string;
  readonly findings?: readonly HostedFinding[];
  readonly dispositionSetId?: string | null;
  readonly dispositionSetLineage?: HostedAttemptBinding["dispositionSetLineage"];
  readonly findingActions?: HostedAttemptBinding["dispositionSetLineage"][number]["findingActions"];
  readonly settledFindingIds?: readonly string[];
  readonly settlementEvidence?: HostedAttemptBinding["settlementEvidence"];
}): { attemptId: string; hosted: HostedAttemptBinding } {
  const carrierCoverage = input.effectiveCoverage ?? input.admission.requestedCoverage;
  const nativeIncremental = input.admission.sourceId === "coderabbit-pr"
    && input.admission.requestedCoverage === "incremental";
  const coverageEvidence = input.coverageEvidence ?? (nativeIncremental
    ? {
        schemaVersion: 1 as const,
        kind: "provider-native-incremental" as const,
        sourceId: "coderabbit-pr" as const,
        requestArtifactId: input.artifact?.id ?? "comment-1",
        status: "established" as const,
        baselineSha: input.admission.correctionScope?.predecessorHeadSha ?? objectId("b"),
        headSha: input.admission.target.headSha,
        providerGeneration: {
          artifactId: "coderabbit-generation-1",
          url: "https://example.invalid/coderabbit-generation-1",
          createdAt: "2026-08-15T10:00:00Z",
          updatedAt: "2026-08-15T11:05:00Z",
          actorIdentity: "136622811" as const,
          appId: "347564" as const,
        },
      }
    : undefined);
  const effectiveCoverage = nativeIncremental && coverageEvidence?.status !== "established"
    ? null
    : carrierCoverage;
  const handle: HostedRequestHandle = {
    schemaVersion: 1,
    provider: input.admission.sourceId,
    requestedCoverage: input.admission.requestedCoverage,
    effectiveCoverage: carrierCoverage,
    target: input.admission.target,
    artifact: input.artifact ?? {
      kind: "issue-comment",
      id: "comment-1",
      url: "https://example.invalid/comment-1",
      createdAt: "2026-08-15T11:00:00Z",
    },
    ...(input.admission.vehicle === undefined ? {} : { vehicle: input.admission.vehicle }),
    admission: input.admission,
  };
  const attemptId = hostedLaneAttemptId(handle);
  const findings = [...input.findings ?? []];
  const dispositionSetId = input.dispositionSetId === undefined || input.dispositionSetId === null
    ? null : CanonicalDigestSchema.parse(input.dispositionSetId);
  const hosted = {
    admission: input.admission,
    handle,
    target: input.admission.target,
    requestedCoverage: input.admission.requestedCoverage,
    effectiveCoverage,
    ...(input.admission.vehicle?.kind === "delivery-member" ? { vehicle: input.admission.vehicle } : {}),
    reviewTarget: input.admission.reviewTarget,
    requirement: input.admission.requirement,
    actorIdentity: input.admission.actorIdentity,
    requestFailureReason: null,
    sealedResult: createHostedSealedResult({
      attemptId,
      admission: input.admission,
      handle,
      target: input.admission.target,
      requestedCoverage: input.admission.requestedCoverage,
      effectiveCoverage,
      ...(input.admission.vehicle?.kind === "delivery-member" ? { vehicle: input.admission.vehicle } : {}),
      reviewTarget: input.admission.reviewTarget,
      requirement: input.admission.requirement,
      outcome: input.outcome,
      reviewUrl: input.reviewUrl ?? "https://example.invalid/review",
      findings,
      ...(coverageEvidence === undefined ? {} : { coverageEvidence }),
    }),
    dispositionSetId,
    dispositionSetLineage: input.dispositionSetLineage ?? (dispositionSetId === null
      ? []
      : [{
          dispositionSetId,
          predecessorDispositionSetId: null,
          successorDispositionSetId: null,
          findingActions: [...input.findingActions ?? []],
        }]),
    settledFindingIds: [...input.settledFindingIds ?? []],
    settlementEvidence: [...input.settlementEvidence ?? []],
  };
  return { attemptId, hosted };
}

/** Publish a hosted terminal fixture through separate admission and acknowledgment states. */
export async function publishHostedTerminalProgressFixture(
  store: ReviewOperationStateStore,
  input: {
    readonly operationId: string;
    readonly repositoryId: string;
    readonly lineage: LaneSubjectLineage;
    readonly logicalPass: number;
    readonly retryGeneration?: number;
    readonly changeRequestId: string;
    readonly headSha: string;
    readonly sourceId: HostedProviderId;
    readonly outcome: "clean" | "findings" | "settled-findings";
    readonly terminal: ReturnType<typeof createHostedTerminalAttemptFixture>;
    readonly now: string;
  },
): Promise<LaneProgressState> {
  const current = await store.readOperation(input.operationId);
  if (current.state !== null && current.state.kind !== "lane-progress") {
    throw new Error("hosted terminal fixture requires lane-progress storage");
  }
  const retainedAttempts = current.state?.attempts ?? [];
  const retainedCompletedPasses = current.state?.completedPasses ?? 0;
  const handle = input.terminal.hosted.handle;
  if (handle === undefined) throw new Error("hosted terminal fixture requires an acknowledgment handle");
  const pendingHosted: HostedAttemptBinding = {
    admission: input.terminal.hosted.admission,
    target: input.terminal.hosted.target,
    requestedCoverage: input.terminal.hosted.requestedCoverage,
    effectiveCoverage: null,
    ...(input.terminal.hosted.vehicle === undefined
      ? {}
      : { vehicle: input.terminal.hosted.vehicle }),
    reviewTarget: input.terminal.hosted.reviewTarget,
    requirement: input.terminal.hosted.requirement,
    actorIdentity: input.terminal.hosted.actorIdentity,
    requestFailureReason: null,
    dispositionSetId: null,
    dispositionSetLineage: [],
    settledFindingIds: [],
    settlementEvidence: [],
  };
  const attemptBase = {
    logicalPass: input.logicalPass,
    retryGeneration: input.retryGeneration ?? 0,
    changeRequestId: input.changeRequestId,
    headSha: input.headSha,
    sourceId: input.sourceId,
  };
  const state = (attempts: LaneProgressState["attempts"], completedPasses: number) => (
    LaneProgressStateSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-operation/v1",
      operationId: input.operationId,
      updatedAt: input.now,
      kind: "lane-progress",
      lane: "standard",
      repositoryId: input.repositoryId,
      lineage: input.lineage,
      completedPasses,
      attempts,
    })
  );
  const admittedAttempt = {
    ...attemptBase,
    attemptId: input.terminal.hosted.admission.admissionId,
    terminalProducer: false,
    outcome: "pending" as const,
    hosted: pendingHosted,
  };
  const admitted = state([...retainedAttempts, admittedAttempt], retainedCompletedPasses);
  await store.publishOperation(admitted, current.version);
  const acknowledgedAttempt = {
    ...attemptBase,
    attemptId: input.terminal.attemptId,
    terminalProducer: false,
    outcome: "pending" as const,
    hosted: {
      ...pendingHosted,
      handle,
      effectiveCoverage: null,
    },
  };
  const acknowledged = state(
    [...retainedAttempts, acknowledgedAttempt],
    retainedCompletedPasses,
  );
  await store.publishOperation(acknowledged, current.version + 1);
  const terminalAttempt = {
    ...attemptBase,
    ...input.terminal,
    terminalProducer: true,
    outcome: input.outcome,
  };
  const terminalAttempts = [...retainedAttempts, terminalAttempt];
  const completedPasses = new Set(terminalAttempts
    .filter(({ terminalProducer }) => terminalProducer)
    .map(({ logicalPass }) => logicalPass)).size;
  const terminal = state(terminalAttempts, completedPasses);
  await store.publishOperation(terminal, current.version + 2);
  return terminal;
}
