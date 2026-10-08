/** Publish-first choreography for one immutable local review preparation. */

import { canonicalize } from "../../../lib/kernel/index.js";

import {
  LocalReviewSourceSchema,
  type LocalReviewSource,
} from "./local-review-source.js";
import type { LocalReviewAdmission } from "./local-operation.js";
import {
  LocalReviewStateSchema,
  type LocalReviewState,
} from "./operation-state-schema.js";
import type {
  LocalReviewSourceStore,
  ReviewOperationStateStore,
} from "./ports.js";
import {
  LocalReviewSourcePayloadSchema,
  type LocalReviewSourcePayload,
} from "./local-review-payload.js";
import type { LocalReviewGuidance } from "../policy/local-review-guidance.js";

export interface LocalReviewPreparation {
  persistedVersion: number;
  state: LocalReviewState;
  sourceRef: string;
  sourceDigest: string;
  reviewRoot: string;
}

/** Project only immutable source coordinates into the evaluator payload. */
export function createLocalReviewSourcePayload(
  admission: LocalReviewAdmission,
  preparation: LocalReviewPreparation,
): LocalReviewSourcePayload {
  return LocalReviewSourcePayloadSchema.parse({
    reviewRoot: preparation.reviewRoot,
    diffBaseSha: admission.target.diffBaseSha,
    headSha: admission.target.headSha,
    sourceRef: preparation.sourceRef,
    sourceDigest: preparation.sourceDigest,
    ...(preparation.state.coverageAdmission.correctionScope === undefined
      ? {}
      : { correctionScope: preparation.state.coverageAdmission.correctionScope }),
  });
}

function localReviewerInstructions(
  guidance: LocalReviewGuidance,
  source: LocalReviewSource,
): string {
  const scope = source.correctionScope;
  if (scope === undefined) return guidance.reviewerInstructions;
  const findings = scope.requiredFindings.length === 0
    ? "No earlier material finding requires re-examination."
    : "Re-examine the earlier material findings "
      + scope.requiredFindings
        .map(({ producerId, findingId, locus }) => `${producerId} / ${findingId} at ${locus}`)
        .join(", ")
      + " at their original loci, including loci outside the changed lines.";
  return `${guidance.reviewerInstructions}\n\n`
    + `Incremental correction pass. The requested change set for this pass is `
    + `${scope.predecessorHeadSha}..${scope.headSha}: review that range completely, and apply the coverage and `
    + `clean rules to it. The changes from ${scope.basisHeadSha} to ${scope.predecessorHeadSha} were covered by the `
    + `earlier passes in this review's recorded coverage chain; do not re-review them. ${findings}`;
}

/**
 * Publishes descriptor and operation state before creating the reachability pin.
 *
 * @param admission - Deterministic local admission.
 * @param sourceInput - Descriptor whose operational locators materialization owns.
 * @param dependencies - Stores, materializer, clock, and cleanup bound.
 * @returns The durable operation plus its proven immutable review root.
 */
export async function publishLocalReviewPreparation(
  admission: LocalReviewAdmission,
  sourceInput: LocalReviewSource,
  dependencies: {
    sourceStore: LocalReviewSourceStore;
    operationStore: ReviewOperationStateStore;
    materialize(source: LocalReviewSource): Promise<{ reviewRoot: string }>;
    now(): string;
    cleanupTtlMs: number;
    guidance: LocalReviewGuidance;
  },
): Promise<LocalReviewPreparation> {
  const source = LocalReviewSourceSchema.parse(sourceInput);
  const admittedCorrectionScope = admission.coverageAdmission.correctionScope;
  if (source.repositoryId !== admission.target.repositoryId
    || source.targetId !== admission.target.targetId
    || source.diffBaseSha !== admission.target.diffBaseSha
    || source.diffBaseTree !== admission.target.diffBaseTree
    || source.headSha !== admission.target.headSha
    || source.headTree !== admission.target.headTree
    || canonicalize(source.correctionScope ?? null)
      !== canonicalize(admittedCorrectionScope ?? null)) {
    throw new Error("local review source does not match its admission target");
  }
  const { sourceRef } = await dependencies.sourceStore.appendSource(source);
  const state = LocalReviewStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "local-review",
    operationId: admission.operationId,
    updatedAt: dependencies.now(),
    vehicle: admission.authority.vehicle,
    repositoryId: admission.target.repositoryId,
    targetId: admission.target.targetId,
    requestId: admission.carrier.request.requestId,
    laneSourceId: admission.laneSourceId,
    scopeMode: admission.scopeMode,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
    coverageAdmission: admission.coverageAdmission,
    ...(admission.deliveryAdmission === undefined
      ? {}
      : { deliveryAdmission: admission.deliveryAdmission }),
    policyVersion: admission.requirement.policyVersion,
    policyBindingDigest: admission.policyBindingDigest,
    attestationRuntimeKind: admission.authority.attestationRuntimeKind,
    sourceRef,
    sourceDigest: source.sourceDigest,
    guidance: dependencies.guidance.projection,
    guidanceDigest: dependencies.guidance.guidanceDigest,
    reviewerInstructions: localReviewerInstructions(dependencies.guidance, source),
    target: admission.target,
    requirement: admission.requirement,
    request: admission.carrier.request,
    attestation: admission.carrier.attestation,
    cleanupTtlMs: dependencies.cleanupTtlMs,
  });
  const published = await dependencies.operationStore.publishOperation(state, 0);
  const materialized = await dependencies.materialize(source);
  return {
    persistedVersion: published.version,
    state,
    sourceRef,
    sourceDigest: source.sourceDigest,
    reviewRoot: materialized.reviewRoot,
  };
}
